import React, { useRef, useEffect, useState } from 'react';
import { ProjectState, TranscriptionWord, VideoClip } from '../types/video';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Maximize } from 'lucide-react';
import { GRADES, GRADE_NONE, paintGradeOverlays } from '../data/grades';
import { drawMotionOverlays } from '../data/motion';
import { renderCaptionPhrase } from '../utils/captionRender';
import { SfxKind, renderSfx } from '../data/sfx';

interface VideoPlayerProps {
  state: ProjectState;
  onChangePlayhead: (time: number) => void;
  onChangeIsPlaying: (playing: boolean) => void;
  onChangeVolume: (volume: number) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  state,
  onChangePlayhead,
  onChangeIsPlaying,
  onChangeVolume
}) => {
  const { media, clips, activeClipId, playhead, isPlaying, captionStyle, transcription, overlays, sfxCues } = state;
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<number | null>(null);
  
  /* Sound-effect cues are fired as the playhead crosses them. A dedicated
     context keeps this independent of the exporter's mixing graph. */
  const sfxCtxRef = useRef<AudioContext | null>(null);
  const sfxBuffersRef = useRef<Partial<Record<SfxKind, AudioBuffer>>>({});
  const firedRef = useRef<Set<string>>(new Set());

  const [videoLoaded, setVideoLoaded] = useState(false);
  const [volume, setLocalVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  /* Playback bookkeeping lives in refs, not state. The draw loop reads these
     every frame; if they were state the effect below would tear down and
     rebuild the rAF loop 60 times a second. */
  const playheadRef = useRef(playhead);
  const clipIdxRef = useRef(0);
  const lastPushRef = useRef(playhead);

  // Calculate total timeline duration from clips
  const totalDuration = clips.reduce((acc, clip) => acc + (clip.end - clip.start), 0) || (media?.duration || 0);

  // Auto emojis dictionary for kinetic captions
  const EMOJI_MAP: Record<string, string> = {
    money: '💸', cash: '💰', rich: '🤑', gold: '🪙',
    fire: '🔥', hot: '🌶️', burn: '🥵',
    time: '⏰', clock: '⏳', watch: '⌚', speed: '⚡', fast: '🚀',
    love: '❤️', heart: '💖', kiss: '💋',
    smart: '🧠', think: '💭', idea: '💡',
    crazy: '🤪', wild: '🦁', scream: '😱', fear: '😨',
    laugh: '😂', funny: '🤪', joke: '🤡',
    yes: '✅', check: '✔️', win: '🏆', crown: '👑',
    no: '❌', stop: '🛑', fail: '📉',
    work: '💼', office: '🏢', business: '📈',
    call: '📞', phone: '📱', screen: '💻',
    music: '🎵', song: '🎶', sound: '🔊', listen: '🎧',
    speech: '🗣️', talk: '💬', say: '🗯️',
    game: '🎮', play: '🕹️',
    water: '💧', rain: '🌧️', ocean: '🌊',
    car: '🚗', drive: '🚙', travel: '✈️',
    food: '🍕', eat: '🍔', coffee: '☕',
    star: '⭐', space: '🌌', earth: '🌍',
    fist: '✊', power: '💪', fight: '🥊',
    light: '☀️', dark: '🌙', night: '🌃'
  };

  function getEmojiForWord(word: string): string {
    const clean = word.toLowerCase().replace(/[^a-z]/g, '');
    for (const key in EMOJI_MAP) {
      if (clean.includes(key)) return EMOJI_MAP[key];
    }
    return '';
  }

  // Find active clip at timeline playhead
  const getActiveClipAtTime = (time: number): { clip: VideoClip; localTime: number } | null => {
    if (clips.length === 0) return null;
    
    let elapsed = 0;
    for (const clip of clips) {
      const clipDuration = clip.end - clip.start;
      if (time >= elapsed && time <= elapsed + clipDuration) {
        return {
          clip,
          localTime: clip.start + (time - elapsed)
        };
      }
      elapsed += clipDuration;
    }
    
    // Fallback to last clip if slightly out of bounds
    const lastClip = clips[clips.length - 1];
    return {
      clip: lastClip,
      localTime: lastClip.end
    };
  };

  /** Timeline time -> which clip we are in and where in the source that lands. */
  const locate = (time: number) => {
    let elapsed = 0;
    for (let i = 0; i < clips.length; i++) {
      const span = clips[i].end - clips[i].start;
      if (time < elapsed + span || i === clips.length - 1) {
        return {
          index: i,
          clip: clips[i],
          sourceTime: clips[i].start + Math.max(0, Math.min(span, time - elapsed))
        };
      }
      elapsed += span;
    }
    return null;
  };

  /** Seconds of timeline that sit before clip `index`. */
  const timelineOffsetOf = (index: number) =>
    clips.slice(0, index).reduce((acc, c) => acc + (c.end - c.start), 0);

  // Sync HTML5 video playhead and play/pause state
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoLoaded || !media) return;

    if (isPlaying) {
      // Restart from the top if we were parked at the end.
      const from = playheadRef.current >= totalDuration - 0.01 ? 0 : playheadRef.current;
      const at = locate(from);

      playheadRef.current = from;
      lastPushRef.current = from;
      clipIdxRef.current = at?.index ?? 0;
      video.currentTime = at?.sourceTime ?? 0;
      if (from !== playhead) onChangePlayhead(from);

      video.play().catch((e) => console.log('Playback error: ', e));
    } else {
      video.pause();
    }
  }, [isPlaying, videoLoaded, media]);

  // Seek preview while paused (this is what makes timeline scrubbing work).
  useEffect(() => {
    // While playing, the draw loop owns the playhead — don't fight it.
    if (isPlaying) return;

    playheadRef.current = playhead;
    lastPushRef.current = playhead;

    const video = videoRef.current;
    if (!video || !videoLoaded || !media) return;

    const at = locate(playhead);
    if (at) {
      clipIdxRef.current = at.index;
      video.currentTime = at.sourceTime;
    } else {
      video.currentTime = playhead;
    }
  }, [playhead, isPlaying, videoLoaded, media, clips]);

  // Pre-render the effects the timeline references.
  useEffect(() => {
    let cancelled = false;
    const kinds = Array.from(new Set((sfxCues || []).map((c) => c.kind)));

    void Promise.all(
      kinds.map(async (k) => {
        const buf = await renderSfx(k);
        if (!cancelled) sfxBuffersRef.current[k] = buf;
      })
    );

    return () => {
      cancelled = true;
    };
  }, [sfxCues]);

  // Release the effects context with the player.
  useEffect(
    () => () => {
      void sfxCtxRef.current?.close();
      sfxCtxRef.current = null;
    },
    []
  );

  // Seeking or stopping re-arms every cue.
  useEffect(() => {
    if (!isPlaying) firedRef.current.clear();
  }, [isPlaying]);

  // Sync volume
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = isMuted ? 0 : volume;
    onChangeVolume(video.volume);
  }, [volume, isMuted]);

  // Main rendering loop for Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !media) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set high resolution canvas dimensions (1080 x 1920)
    canvas.width = 1080;
    canvas.height = 1920;

    const drawFrame = () => {
      if (!videoRef.current || !canvasRef.current) return;
      
      const v = videoRef.current;
      const c = canvasRef.current;
      const context = c.getContext('2d');
      if (!context) return;

      // 1. Draw video background with 9:16 crop
      const videoWidth = v.videoWidth || 1280;
      const videoHeight = v.videoHeight || 720;
      
      // Target aspect ratio is 9:16
      const targetWidth = videoHeight * (9 / 16);
      
      // Calculate crop shift based on current clip's panOffset, or the
      // animated drift position when the clip is set to glide across the frame.
      const activeInfo = getActiveClipAtTime(v.currentTime);
      const clip = activeInfo?.clip;
      let panOffset = clip?.panOffset ?? 0; // -100 to 100
      if (clip?.panDrift && clip.end > clip.start) {
        const local = Math.max(0, Math.min(1, (activeInfo!.localTime - clip.start) / (clip.end - clip.start)));
        // 'left' drifts from the left edge to the right edge (and vice versa).
        panOffset = clip.panDrift === 'left' ? -100 + 200 * local : 100 - 200 * local;
      }
      
      const maxShift = (videoWidth - targetWidth) / 2;
      const shift = (panOffset / 100) * maxShift;
      const sx = Math.max(0, Math.min(videoWidth - targetWidth, (videoWidth - targetWidth) / 2 + shift));
      
      // Clear canvas
      context.fillStyle = '#0B0B0F';
      context.fillRect(0, 0, c.width, c.height);

      /* Scene Restyle grade — applies to the video frame only. It is painted
         here, before captions, so the grade can never tint the subtitles. */
      const grade = GRADES[activeInfo?.clip?.grade ?? GRADE_NONE] ?? GRADES[GRADE_NONE];

      context.save();
      context.filter = grade.filter;
      context.drawImage(v, sx, 0, targetWidth, videoHeight, 0, 0, c.width, c.height);
      context.restore();

      paintGradeOverlays(context, grade, c.width, c.height);

      // Captions must never inherit the grade's filter state.
      context.filter = 'none';
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1;

      // 2. Render kinetic subtitles
      const curTime = v.currentTime;

      // Find words around current time
      const wordIndex = transcription.findIndex(w => !w.deleted && curTime >= w.start && curTime <= w.end);
      
      if (wordIndex !== -1) {
        // Select a small sliding window of words to display a readable phrase (e.g. 3-4 words)
        const windowSize = 3;
        const startIdx = Math.max(0, wordIndex - Math.floor(windowSize / 2));
        const endIdx = Math.min(transcription.length - 1, startIdx + windowSize - 1);

        const phraseWords = transcription.slice(startIdx, endIdx + 1).filter(w => !w.deleted);
        renderCaptionPhrase(context, phraseWords, captionStyle, curTime, c.width, c.height, getEmojiForWord);
      }

      /* 2b. Motion graphics sit above the captions and are driven by the
             timeline position, so preview and export stay in sync. */
      drawMotionOverlays(context, overlays || [], playheadRef.current, c.width, c.height);

      // 2c. Fire any sound-effect cue the playhead just crossed.
      if (isPlaying && sfxCues?.length) {
        const now = playheadRef.current;
        for (const cue of sfxCues) {
          if (firedRef.current.has(cue.id)) continue;
          if (now < cue.at || now > cue.at + 0.25) continue;

          const buffer = sfxBuffersRef.current[cue.kind];
          if (!buffer) continue;

          if (!sfxCtxRef.current) {
            const Ctor =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            sfxCtxRef.current = new Ctor();
          }
          const actx = sfxCtxRef.current;
          void actx.resume();

          const src = actx.createBufferSource();
          src.buffer = buffer;
          const g = actx.createGain();
          g.gain.value = cue.gain ?? 0.85;
          src.connect(g).connect(actx.destination);
          src.start();
          firedRef.current.add(cue.id);
        }
      }

      // 3. Advance the timeline playhead
      if (isPlaying) {
        const idx = Math.min(clipIdxRef.current, clips.length - 1);
        const clip = clips[idx];

        if (clip) {
          // Crossing a cut: jump the source video to the next clip's in-point
          // instead of letting it run on linearly through material we trimmed.
          if (v.currentTime >= clip.end - 0.02) {
            if (idx + 1 < clips.length) {
              clipIdxRef.current = idx + 1;
              v.currentTime = clips[idx + 1].start;
            } else {
              onChangeIsPlaying(false);
              onChangePlayhead(totalDuration);
              playheadRef.current = totalDuration;
              requestRef.current = requestAnimationFrame(drawFrame);
              return;
            }
          }

          const live = clips[clipIdxRef.current];
          const newPlayhead =
            timelineOffsetOf(clipIdxRef.current) +
            Math.max(0, v.currentTime - live.start);

          playheadRef.current = newPlayhead;

          // Push to React at ~20Hz. The playhead line interpolates between
          // these with a CSS transition, so it still reads as 60fps motion
          // without re-rendering the whole app every frame.
          if (Math.abs(newPlayhead - lastPushRef.current) >= 0.05) {
            lastPushRef.current = newPlayhead;
            onChangePlayhead(newPlayhead);
          }
        }
      }

      requestRef.current = requestAnimationFrame(drawFrame);
    };

    requestRef.current = requestAnimationFrame(drawFrame);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
    // `playhead` is deliberately absent: it changes ~20x/sec and would
    // otherwise cancel and rebuild the rAF loop each time. The loop reads
    // playheadRef instead.
  }, [isPlaying, clips, transcription, captionStyle, media, videoLoaded, overlays, sfxCues]);

  const handlePlayPause = () => {
    onChangeIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    onChangePlayhead(0);
    const video = videoRef.current;
    if (video) video.currentTime = clips[0]?.start || 0;
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setLocalVolume(val);
    if (val > 0) setIsMuted(false);
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="player-panel">
      {/* Top Header Options */}
      <div className="player-header">
        <div className="resolution-badge">Preview • 1080p Crop</div>
        <div className="player-header-actions">
          <button className="icon-btn-secondary" title="Reframe Grid">
            <Maximize size={16} />
          </button>
        </div>
      </div>

      {/* Main 9:16 Canvas Frame */}
      <div className="canvas-container">
        {!media && (
          <div className="player-placeholder">
            <div className="glow-icon">🎞️</div>
            <p>Upload a video to start editing</p>
          </div>
        )}
        
        {media && (
          <canvas ref={canvasRef} className="preview-canvas" />
        )}
        
        {/* Hidden video element for rendering frames */}
        {media && (
          <video
            ref={videoRef}
            src={media.url}
            onLoadedData={() => setVideoLoaded(true)}
            preload="auto"
            style={{ display: 'none' }}
          />
        )}
      </div>

      {/* Player Controls Bar */}
      <div className="player-controls">
        <div className="controls-left">
          <button className="control-btn" onClick={handlePlayPause} disabled={!media} title={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          <button className="control-btn" onClick={handleReset} disabled={!media} title="Reset playhead">
            <RotateCcw size={18} />
          </button>
          
          <span className="time-display">
            {formatTime(playhead)} / {formatTime(totalDuration)}
          </span>
        </div>

        <div className="controls-right">
          <button className="control-btn" onClick={toggleMute} disabled={!media} title={isMuted ? "Unmute" : "Mute"}>
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="volume-slider"
            disabled={!media}
          />
        </div>
      </div>
    </div>
  );
};
