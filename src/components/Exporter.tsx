import React, { useState, useRef } from 'react';
import { ProjectState, VideoClip } from '../types/video';
import { Download, Film, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { SfxCue, SfxKind, renderSfx, scheduleCues } from '../data/sfx';

interface ExporterProps {
  state: ProjectState;
}

export const Exporter: React.FC<ExporterProps> = ({ state }) => {
  const { media, clips, activeClipId } = state;
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const sfxSourcesRef = useRef<{
    cues: SfxCue[];
    buffers: Partial<Record<SfxKind, AudioBuffer>>;
    ctx: AudioContext;
    destination: MediaStreamAudioDestinationNode;
  } | null>(null);

  const startExport = async () => {
    // Locate the canvas and video element from DOM
    const canvas = document.querySelector('.preview-canvas') as HTMLCanvasElement;
    const video = document.querySelector('.canvas-container video') as HTMLVideoElement;

    if (!canvas || !video || !media) {
      setExportError('Could not find active video or preview screen to export.');
      return;
    }

    try {
      setExporting(true);
      setExportError(null);
      setDownloadUrl(null);
      setProgress(0);

      // Determine active clip duration
      const activeClip = clips.find(c => c.id === activeClipId) || clips[0];
      const clipStart = activeClip ? activeClip.start : 0;
      const clipEnd = activeClip ? activeClip.end : media.duration;
      const clipDuration = clipEnd - clipStart;

      // 1. Capture Canvas Video Track
      const canvasStream = canvas.captureStream(30); // 30 FPS
      const videoTrack = canvasStream.getVideoTracks()[0];

      // 2. Capture Audio Track via Web Audio API
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const source = audioCtx.createMediaElementSource(video);
      const destination = audioCtx.createMediaStreamDestination();
      
      // Connect source to BOTH destination (to record) and hardware speakers (so user hears it, or keep muted during export if wanted)
      source.connect(destination);
      source.connect(audioCtx.destination); // let the user hear it during export to know it's exporting

      const audioTrack = destination.stream.getAudioTracks()[0];

      /* Mix the synthesised sound effects into the same destination so they
         land in the recording, not just the preview. Cue times are timeline
         seconds; the recording starts at this clip's timeline offset. */
      const cues = state.sfxCues || [];
      if (cues.length) {
        const kinds = Array.from(new Set(cues.map((c) => c.kind)));
        const buffers: Partial<Record<SfxKind, AudioBuffer>> = {};
        await Promise.all(
          kinds.map(async (k) => {
            buffers[k] = await renderSfx(k);
          })
        );
        sfxSourcesRef.current = { cues, buffers, ctx: audioCtx, destination };
      }

      // 3. Combine into a MediaStream
      const combinedStream = new MediaStream();
      combinedStream.addTrack(videoTrack);
      if (audioTrack) {
        combinedStream.addTrack(audioTrack);
      }

      // 4. Setup MediaRecorder with best MIME type
      let mimeType = 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/mp4;codecs=h264';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = ''; // Let browser decide fallback
          }
        }
      }

      const chunks: Blob[] = [];
      const options = mimeType ? { mimeType } : undefined;
      const recorder = new MediaRecorder(combinedStream, options);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        const fileExtension = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const finalBlob = new Blob(chunks, { type: mimeType || 'video/webm' });
        const url = URL.createObjectURL(finalBlob);
        setDownloadUrl(url);
        setProgress(100);
        setExporting(false);

        // Clean up connections
        source.disconnect();
        sfxSourcesRef.current = null;
      };

      // 5. Run export playback sequence
      // Pause current playing
      video.pause();
      // Jump to start of clip
      video.currentTime = clipStart;
      
      // Wait for seek to complete
      await new Promise((r) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          r(null);
        };
        video.addEventListener('seeked', onSeeked);
      });

      // Start recording. Cues are scheduled against the same clock so the
      // effects land at the right timeline positions in the recording.
      recorder.start();

      const sfx = sfxSourcesRef.current;
      if (sfx) {
        const timelineOrigin = activeClip?.timelineStart ?? 0;
        const origin = sfx.ctx.currentTime;
        // Into the recording…
        scheduleCues(sfx.ctx, sfx.destination, sfx.cues, sfx.buffers, timelineOrigin, origin);
        // …and to the speakers, so the realtime export is monitorable.
        scheduleCues(sfx.ctx, sfx.ctx.destination, sfx.cues, sfx.buffers, timelineOrigin, origin);
      }

      video.play();

      // Monitor progress via interval
      const progressInterval = setInterval(() => {
        if (video.currentTime >= clipEnd) {
          clearInterval(progressInterval);
          video.pause();
          recorder.stop();
        } else {
          const currentElapsed = video.currentTime - clipStart;
          const pct = Math.floor((currentElapsed / clipDuration) * 95);
          setProgress(Math.max(0, Math.min(95, pct)));
        }
      }, 200);

    } catch (err: any) {
      console.error(err);
      setExportError(err.message || 'Browser failed to record the canvas stream.');
      setExporting(false);
    }
  };

  const handleDownload = () => {
    if (!downloadUrl) return;
    const a = document.createElement('a');
    a.href = downloadUrl;
    
    // Create clean file name
    const activeClip = clips.find(c => c.id === activeClipId);
    const title = activeClip ? activeClip.id : 'viral_short';
    a.download = `Edith_${title}_916.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="exporter-container">
      {!exporting && !downloadUrl && (
        <button
          className="export-btn"
          disabled={!media}
          onClick={startExport}
        >
          <Film size={16} />
          Export 9:16 Short
        </button>
      )}

      {exporting && (
        <div className="export-status exporting">
          <Loader2 size={16} className="spinner-icon" />
          <span>Exporting: {progress}%</span>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
          </div>
        </div>
      )}

      {downloadUrl && (
        <div className="export-status success">
          <CheckCircle2 size={16} className="text-green" />
          <button className="download-btn" onClick={handleDownload}>
            <Download size={16} />
            Download Compiled Video
          </button>
        </div>
      )}

      {exportError && (
        <div className="export-status error">
          <AlertTriangle size={16} className="text-red" />
          <span>Export Failed: {exportError}</span>
        </div>
      )}
    </div>
  );
};
