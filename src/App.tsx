import React, { useState, useEffect, useRef } from 'react';
import { ProjectState, MediaAsset, TranscriptionWord, VideoClip, ChatMessage, CaptionStyle, ViralShort, CaptionLanguage } from './types/video';
import { extractAudio } from './utils/audio';
import { transcribeAudio, curateShorts, correctTranscription } from './services/groq';
import { VideoPlayer } from './components/VideoPlayer';
import { TranscriptEditor } from './components/TranscriptEditor';
import { GlossaryInput } from './components/GlossaryInput';
import { CaptionLanguagePicker } from './components/CaptionLanguagePicker';
import { ClipList } from './components/ClipList';
import { AiCopilot } from './components/AiCopilot';
import { Exporter } from './components/Exporter';
import { Timeline } from './components/Timeline';
import { Film, BrainCircuit, Key, Upload, Sparkles, User, Video, ShieldCheck } from 'lucide-react';
import { GRADE_NONE, isGradeId } from './data/grades';
import { MotionOverlay, isMotionKind, motionDefaults } from './data/motion';
import { SfxCue, SfxKind, SFX_DURATION, isSfxKind } from './data/sfx';
import { Region, decodeToMono, findSilences, invertRegions, edgeSilence } from './utils/silence';
import './App.css';

const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontFamily: 'Impact',
  fontSize: 65,
  primaryColor: '#FFFFFF',
  activeWordColor: '#FFE600', // Yellow
  strokeColor: '#000000',
  strokeWidth: 8,
  uppercase: true,
  activeWordScale: 1.25,
  positionY: 70,
  animatePop: true,
  addEmojis: true,
  boxed: false
};

const SAMPLE_VIDEO_URL = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4';

/** Everything an edit can touch — the unit of undo. */
interface EditorSnapshot {
  captionStyle: CaptionStyle;
  clips: VideoClip[];
  activeClipId: string | null;
  overlays: MotionOverlay[];
  sfxCues: SfxCue[];
  transcription: TranscriptionWord[];
}

/** Caption-style keys the editor will accept from a command, with coercion. */
const CAPTION_STYLE_FIELDS: Record<keyof CaptionStyle, 'string' | 'number' | 'boolean'> = {
  fontFamily: 'string',
  primaryColor: 'string',
  activeWordColor: 'string',
  strokeColor: 'string',
  fontSize: 'number',
  strokeWidth: 'number',
  activeWordScale: 'number',
  positionY: 'number',
  uppercase: 'boolean',
  animatePop: 'boolean',
  addEmojis: 'boolean',
  boxed: 'boolean',
  boxColor: 'string'
};

function pickCaptionStyleFields(cmd: Record<string, unknown>): Partial<CaptionStyle> {
  const out: Record<string, unknown> = {};

  for (const [key, kind] of Object.entries(CAPTION_STYLE_FIELDS)) {
    const value = cmd[key];
    if (value === undefined || value === null) continue;

    if (kind === 'number') {
      const n = Number(value);
      if (Number.isFinite(n)) out[key] = n;
    } else if (kind === 'boolean') {
      if (typeof value === 'boolean') out[key] = value;
    } else if (typeof value === 'string' && value.trim()) {
      out[key] = value;
    }
  }

  return out as Partial<CaptionStyle>;
}

export const App: React.FC = () => {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('groq_api_key') || '');
  const [media, setMedia] = useState<MediaAsset | null>(null);
  const [transcription, setTranscription] = useState<TranscriptionWord[]>([]);
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>(DEFAULT_CAPTION_STYLE);
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isProcessingAi, setIsProcessingAi] = useState(false);
  const [transcribeProgress, setTranscribeProgress] = useState(0);
  // Caption output language — Hinglish, Hindi script, or English. Applied on
  // the next transcription run (initial or Re-transcribe).
  const [captionLanguage, setCaptionLanguage] = useState<CaptionLanguage>('hinglish');

  // Creator vocabulary — names, brands, slang injected into Whisper and the
  // correction pass so desi captions spell them right. Persists across loads.
  const [glossary, setGlossary] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('edith_glossary');
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  // Post-transcription AI accuracy pass (romanization / spelling / hallucinated
  // words). Costs one LLaMA call, so it can be switched off.
  const [fixCaptions, setFixCaptions] = useState<boolean>(
    () => localStorage.getItem('edith_fix_captions') !== 'off'
  );
  
  // Custom states for curated shorts list
  const [shorts, setShorts] = useState<ViralShort[]>([]);
  const [activeShortId, setActiveShortId] = useState<string | null>(null);

  // Motion-graphics overlays composited over the preview
  const [overlays, setOverlays] = useState<MotionOverlay[]>([]);

  // Synthesised sound-effect cues
  const [sfxCues, setSfxCues] = useState<SfxCue[]>([]);

  /** Decoded silence analysis, cached per asset — decoding is expensive. */
  const silenceCache = useRef<{ assetId: string; silences: Region[] } | null>(null);

  /* ---------------------------------------------------------------- undo --
     Every edit a skill can make is captured here so it can be taken back —
     including destructive ones like Remove Silence, which rewrites the
     timeline and has no other way home. */
  const [past, setPast] = useState<{ label: string; snap: EditorSnapshot }[]>([]);
  const [future, setFuture] = useState<EditorSnapshot[]>([]);
  const lastCommit = useRef({ label: '', at: 0 });

  const snapshot = (): EditorSnapshot => ({
    captionStyle,
    clips,
    activeClipId,
    overlays,
    sfxCues,
    transcription
  });

  /** Records the state *before* an edit. Rapid edits sharing a label (slider
      drags) collapse into one entry rather than flooding the stack. */
  const commit = (label: string) => {
    const now = Date.now();
    const burst = label === lastCommit.current.label && now - lastCommit.current.at < 800;
    lastCommit.current = { label, at: now };
    if (burst) return;

    setPast((p) => [...p.slice(-49), { label, snap: snapshot() }]);
    setFuture([]);
  };

  const restore = (s: EditorSnapshot) => {
    setCaptionStyle(s.captionStyle);
    setClips(s.clips);
    setActiveClipId(s.activeClipId);
    setOverlays(s.overlays);
    setSfxCues(s.sfxCues);
    setTranscription(s.transcription);
  };

  const undo = () => {
    if (!past.length) return;
    const entry = past[past.length - 1];
    setFuture((f) => [snapshot(), ...f].slice(0, 50));
    restore(entry.snap);
    setPast((p) => p.slice(0, -1));
    lastCommit.current = { label: '', at: 0 };
  };

  const redo = () => {
    if (!future.length) return;
    const next = future[0];
    setPast((p) => [...p, { label: 'redo', snap: snapshot() }]);
    restore(next);
    setFuture((f) => f.slice(1));
    lastCommit.current = { label: '', at: 0 };
  };

  // Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z, unless the user is editing text.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;

      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;

      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pushAiMessage = (text: string, status: ChatMessage['status'] = 'success') =>
    setChatHistory((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        sender: 'ai',
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status
      }
    ]);

  /** Source audio for analysis: the uploaded file, or fetched from the URL. */
  const getMediaBlob = async (): Promise<Blob> => {
    if (!media) throw new Error('No media loaded.');
    if (media.file) return media.file;
    const res = await fetch(media.url);
    if (!res.ok) throw new Error(`Could not fetch the video (HTTP ${res.status}).`);
    return res.blob();
  };

  const getSilences = async (): Promise<Region[]> => {
    if (!media) throw new Error('No media loaded.');
    if (silenceCache.current?.assetId === media.id) return silenceCache.current.silences;

    const buffer = await decodeToMono(await getMediaBlob());
    const { silences } = findSilences(buffer.getChannelData(0), buffer.sampleRate);
    silenceCache.current = { assetId: media.id, silences };
    return silences;
  };

  /** Rebuilds the timeline with silent stretches cut out of each clip. */
  const removeSilence = async () => {
    setIsProcessingAi(true);
    try {
      const silences = await getSilences();

      const rebuilt: VideoClip[] = [];
      let timelineStart = 0;
      let removed = 0;

      clips.forEach((clip, ci) => {
        const kept = invertRegions(silences, clip.start, clip.end).filter(
          (r) => r.end - r.start >= 0.2
        );
        removed += clip.end - clip.start - kept.reduce((a, r) => a + (r.end - r.start), 0);

        kept.forEach((r, ri) => {
          rebuilt.push({
            ...clip,
            id: `clip-${ci}-${ri}-${Math.round(r.start * 100)}`,
            start: r.start,
            end: r.end,
            timelineStart
          });
          timelineStart += r.end - r.start;
        });
      });

      if (rebuilt.length === 0) {
        pushAiMessage('That clip reads as silent all the way through, so I left the timeline alone.', 'error');
        return;
      }

      const cuts = rebuilt.length - clips.length;
      setClips(rebuilt);
      setActiveClipId(rebuilt[0].id);
      setPlayhead(0);
      pushAiMessage(
        cuts <= 0
          ? 'No pauses long enough to cut — the timeline is already tight.'
          : `Removed ${cuts} silent ${cuts === 1 ? 'gap' : 'gaps'} (${removed.toFixed(1)}s), leaving ${rebuilt.length} segments.`
      );
    } catch (err) {
      pushAiMessage(`Could not analyse the audio: ${(err as Error).message}`, 'error');
    } finally {
      setIsProcessingAi(false);
    }
  };

  /** Trims leading and trailing silence without touching the middle. */
  const tightenEdges = async () => {
    setIsProcessingAi(true);
    try {
      const silences = await getSilences();
      const first = clips[0];
      const last = clips[clips.length - 1];
      if (!first || !last) return;

      const head = edgeSilence(silences, first.start, first.end).head;
      const tail = edgeSilence(silences, last.start, last.end).tail;

      const trimmed = first.start - head + (last.end - tail);
      if (Math.abs(trimmed) < 0.05) {
        pushAiMessage('The clip already starts and ends on speech — nothing to trim.');
        return;
      }

      let timelineStart = 0;
      const next = clips.map((c, i) => {
        const start = i === 0 ? head : c.start;
        const end = i === clips.length - 1 ? tail : c.end;
        const updated = { ...c, start, end, timelineStart };
        timelineStart += Math.max(0, end - start);
        return updated;
      });

      setClips(next);
      setPlayhead(0);
      pushAiMessage(
        `Tightened the edges — trimmed ${(head - first.start).toFixed(1)}s off the head and ${(last.end - tail).toFixed(1)}s off the tail.`
      );
    } catch (err) {
      pushAiMessage(`Could not analyse the audio: ${(err as Error).message}`, 'error');
    } finally {
      setIsProcessingAi(false);
    }
  };

  /** Places sound-effect cues at meaningful points on the timeline. */
  const addSfx = (kind: SfxKind) => {
    const totalDuration =
      clips.reduce((acc, c) => acc + (c.end - c.start), 0) || media?.duration || 0;

    let cues: SfxCue[] = [];
    let where = '';

    if (kind === 'whoosh') {
      // One per cut; if the timeline has no cuts yet, mark the opening.
      const boundaries = clips.slice(1).map((c) => c.timelineStart);
      cues = (boundaries.length ? boundaries : [0]).map((at, i) => ({
        id: `sfx-whoosh-${i}`,
        kind,
        at
      }));
      where = boundaries.length
        ? `on ${boundaries.length} cut${boundaries.length === 1 ? '' : 's'}`
        : 'at the opening (no cuts on the timeline yet)';
    } else if (kind === 'impact') {
      cues = [{ id: 'sfx-impact', kind, at: playhead }];
      where = `at the playhead (${playhead.toFixed(1)}s)`;
    } else {
      const at = Math.max(0, Math.min(playhead, totalDuration) - SFX_DURATION.riser);
      cues = [{ id: 'sfx-riser', kind, at }];
      where = `building into the playhead (${at.toFixed(1)}s–${playhead.toFixed(1)}s)`;
    }

    setSfxCues((prev) => [...prev.filter((c) => c.kind !== kind), ...cues]);
    pushAiMessage(`Added the ${kind} ${where}. It plays in the preview and is mixed into the export.`);
  };

  // Store key in local storage
  const handleApiKeyChange = (val: string) => {
    setApiKey(val);
    localStorage.setItem('groq_api_key', val);
  };

  // Creator vocabulary + accuracy-pass toggle, both persisted.
  const handleGlossaryChange = (terms: string[]) => {
    setGlossary(terms);
    localStorage.setItem('edith_glossary', JSON.stringify(terms));
  };
  const handleFixCaptionsChange = (on: boolean) => {
    setFixCaptions(on);
    localStorage.setItem('edith_fix_captions', on ? 'on' : 'off');
  };

  // Helper to load video metadata and initialize default clip
  const initializeMedia = (name: string, url: string, file?: File, duration?: number) => {
    const asset: MediaAsset = {
      id: `asset-${Date.now()}`,
      name,
      type: 'video',
      url,
      duration: duration || 15, // placeholder, will update on metadata load
      file
    };

    setMedia(asset);
    
    // Create initial clip spanning the entire video
    const initialClip: VideoClip = {
      id: `clip-1`,
      assetId: asset.id,
      start: 0,
      end: duration || 15,
      timelineStart: 0,
      panOffset: 0,
      volume: 1
    };
    
    setClips([initialClip]);
    setActiveClipId(initialClip.id);
    setPlayhead(0);
    setTranscription([]);
    setShorts([]);
    setActiveShortId(null);
    setChatHistory([]);
    setOverlays([]);
    setSfxCues([]);
    silenceCache.current = null;
    setPast([]);
    setFuture([]);
  };

  // Handle local file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    
    // Extract metadata using temp video element
    const tempVideo = document.createElement('video');
    tempVideo.src = url;
    tempVideo.onloadedmetadata = () => {
      initializeMedia(file.name, url, file, tempVideo.duration);
    };
  };

  // Load a demo podcast snippet
  const handleLoadSample = () => {
    // Create pre-configured mockup state for sample testing
    initializeMedia('Sample_Podcast_Clip.mp4', SAMPLE_VIDEO_URL, undefined, 14);
  };

  // Start transcription pipeline
  const handleStartPipeline = async () => {
    if (!media) return;
    if (!apiKey) {
      alert('Please enter a Groq API Key at the top of the interface.');
      return;
    }

    setIsTranscribing(true);
    setTranscribeProgress(10); // starting

    try {
      let audioBlob: Blob;

      if (media.file) {
        // Real client-side audio extraction
        audioBlob = await extractAudio(media.file, (p) => {
          setTranscribeProgress(Math.floor(10 + p * 0.4)); // mapping to 10-50%
        });
      } else {
        // If loading a URL, we need to fetch and extract audio
        setTranscribeProgress(20);
        const res = await fetch(media.url);
        const resBlob = await res.blob();
        // create dummy file for extractor
        const file = new File([resBlob], 'sample.mp4', { type: 'video/mp4' });
        audioBlob = await extractAudio(file, (p) => {
          setTranscribeProgress(Math.floor(20 + p * 0.3)); // mapping to 20-50%
        });
      }

      setTranscribeProgress(60); // transcribing on groq

      // Send to Groq Whisper (glossary terms act as vocabulary hints)
      const words = await transcribeAudio(audioBlob, apiKey, captionLanguage, glossary);
      setTranscription(words);
      setTranscribeProgress(68);

      // Post-transcription accuracy pass: LLaMA fixes romanization, spelling,
      // punctuation and hallucinated words while keeping Whisper's timings.
      // Non-fatal — if it fails, captions stay as Whisper wrote them.
      if (fixCaptions) {
        try {
          const corrected = await correctTranscription(words, apiKey, captionLanguage, glossary);
          setTranscription(corrected.words);
          console.info(
            `Caption accuracy pass: corrected ${corrected.changedCount} of ${words.length} words.`
          );
        } catch (err) {
          console.warn('Caption accuracy pass skipped:', err);
          setTranscription(words);
        }
      }

      setTranscribeProgress(80); // curating viral moments

      // Send to Groq LLaMA to identify viral moments
      const curatedShortsList = await curateShorts(words, apiKey);
      setShorts(curatedShortsList);
      setTranscribeProgress(100);

      // Add helper message from AI
      setChatHistory([
        {
          id: 'system-start',
          sender: 'ai',
          text: `Hi! I've transcribed the video and detected ${curatedShortsList.length} potential viral shorts. Check them out on the left sidebar! Click any card to load the clip segment onto the timeline.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);

    } catch (err: any) {
      console.error(err);
      alert(`AI pipeline failed: ${err.message || 'Check your internet connection and API key.'}`);
    } finally {
      setIsTranscribing(false);
      setTranscribeProgress(0);
    }
  };

  // Select a viral short from the list
  const handleSelectShort = (short: ViralShort) => {
    commit('select short');
    setActiveShortId(short.id);
    
    // Resize the active clip coordinates to match the short timestamps
    setClips([{
      id: `clip-short-${short.id}`,
      assetId: media?.id || 'asset-1',
      start: short.startTime,
      end: short.endTime,
      timelineStart: 0,
      panOffset: 0,
      volume: 1
    }]);

    setActiveClipId(`clip-short-${short.id}`);
    setPlayhead(0); // Seek to timeline beginning
    
    // Jump HTML5 video to the correct source start time
    const video = document.querySelector('.canvas-container video') as HTMLVideoElement;
    if (video) video.currentTime = short.startTime;
  };

  // Timeline splits
  const handleSplitClip = (clipId: string, time: number) => {
    commit('split clip');
    // Locate the clip to split
    const targetIdx = clips.findIndex(c => c.id === clipId);
    if (targetIdx === -1) return;

    const clip = clips[targetIdx];
    const splitSourceTime = clip.start + (time - clip.timelineStart);

    if (splitSourceTime <= clip.start || splitSourceTime >= clip.end) return;

    const clip1: VideoClip = {
      ...clip,
      id: `${clip.id}-part1`,
      end: splitSourceTime
    };

    const clip2: VideoClip = {
      ...clip,
      id: `${clip.id}-part2`,
      start: splitSourceTime,
      timelineStart: time
    };

    // Update subsequent timeline starts
    const updatedClips = [...clips];
    updatedClips.splice(targetIdx, 1, clip1, clip2);

    let currentTimelineStart = 0;
    const recalculated = updatedClips.map((c) => {
      const duration = c.end - c.start;
      const updated = { ...c, timelineStart: currentTimelineStart };
      currentTimelineStart += duration;
      return updated;
    });

    setClips(recalculated);
    setActiveClipId(clip2.id);
  };

  // Timeline deletes
  const handleDeleteClip = (clipId: string) => {
    commit('delete clip');
    if (clips.length <= 1) {
      alert("Timeline must have at least 1 clip.");
      return;
    }
    const filtered = clips.filter(c => c.id !== clipId);
    
    // Recalculate timeline positions
    let currentTimelineStart = 0;
    const recalculated = filtered.map((c) => {
      const duration = c.end - c.start;
      const updated = { ...c, timelineStart: currentTimelineStart };
      currentTimelineStart += duration;
      return updated;
    });

    setClips(recalculated);
    setActiveClipId(recalculated[0].id);
    setPlayhead(0);
  };

  // Update specific word in transcription
  const handleUpdateWord = (index: number, updatedFields: Partial<TranscriptionWord>) => {
    commit('edit transcript');
    const updated = [...transcription];
    updated[index] = { ...updated[index], ...updatedFields };
    setTranscription(updated);
  };

  // Apply LLaMA commands
  const handleApplyAiCommands = (commands: any[], explanation: string) => {
    // Snapshot before anything mutates, so one skill = one undo step.
    commit('apply skill');
    commands.forEach((cmd) => {
      switch (cmd.type) {
        case 'UPDATE_STYLE': {
          // Only known caption keys are accepted. The model is free-form and
          // has previously answered unrelated requests (e.g. a colour grade)
          // with UPDATE_STYLE, which used to corrupt the caption styling.
          const styleFields = pickCaptionStyleFields(cmd);
          if (Object.keys(styleFields).length === 0) {
            console.warn('UPDATE_STYLE carried no recognised caption fields:', cmd);
            break;
          }
          setCaptionStyle((prev) => ({ ...prev, ...styleFields }));
          break;
        }
        case 'ADD_MOTION': {
          if (!isMotionKind(cmd.kind)) {
            console.warn('Unknown motion kind:', cmd.kind);
            break;
          }

          const timelineDuration =
            clips.reduce((acc, c) => acc + (c.end - c.start), 0) || media?.duration || 15;

          const base = motionDefaults(cmd.kind, {
            words: transcription.filter((w) => !w.deleted).map((w) => w.word),
            duration: timelineDuration,
            shortTitle: shorts.find((s) => s.id === activeShortId)?.title
          });

          const overlay: MotionOverlay = {
            ...base,
            id: `mg-${cmd.kind}`, // one of each kind; re-applying replaces it
            ...(typeof cmd.text === 'string' && cmd.text.trim() ? { text: cmd.text } : {}),
            ...(typeof cmd.subtext === 'string' ? { subtext: cmd.subtext } : {}),
            ...(Number.isFinite(Number(cmd.value)) ? { value: Number(cmd.value) } : {}),
            ...(Number.isFinite(Number(cmd.start)) ? { start: Number(cmd.start) } : {}),
            ...(Number.isFinite(Number(cmd.end)) ? { end: Number(cmd.end) } : {})
          };

          setOverlays((prev) => [...prev.filter((o) => o.id !== overlay.id), overlay]);
          break;
        }
        case 'REMOVE_SILENCE': {
          void removeSilence();
          break;
        }
        case 'TRIM_SILENCE_EDGES': {
          void tightenEdges();
          break;
        }
        case 'ADD_SFX': {
          if (!isSfxKind(cmd.kind)) {
            console.warn('Unknown sfx kind:', cmd.kind);
            break;
          }
          addSfx(cmd.kind);
          break;
        }
        case 'CLEAR_SFX': {
          setSfxCues((prev) => (isSfxKind(cmd.kind) ? prev.filter((c) => c.kind !== cmd.kind) : []));
          break;
        }
        case 'CLEAR_MOTION': {
          setOverlays((prev) =>
            isMotionKind(cmd.kind) ? prev.filter((o) => o.kind !== cmd.kind) : []
          );
          break;
        }
        case 'APPLY_GRADE': {
          // Scene Restyle: a look on the video frame, never on the captions.
          const grade = isGradeId(cmd.grade) ? cmd.grade : GRADE_NONE;
          if (!isGradeId(cmd.grade)) {
            console.warn('Unknown grade, clearing instead:', cmd.grade);
          }
          setClips((prevClips) => prevClips.map((c) => ({ ...c, grade })));
          break;
        }
        case 'ADJUST_PAN': {
          // An explicit pan is a fixed crop, so it also cancels any drift.
          setClips((prevClips) =>
            prevClips.map((c) =>
              c.id === activeClipId || c.id === cmd.clipId
                ? { ...c, panOffset: Number(cmd.panOffset), panDrift: null }
                : c
            )
          );
          break;
        }
        case 'SET_DRIFT': {
          // Animated reframe: the crop glides across the frame while playing.
          const dir = cmd.direction === 'left' || cmd.direction === 'right' ? cmd.direction : null;
          setClips((prevClips) =>
            prevClips.map((c) =>
              c.id === activeClipId || c.id === cmd.clipId
                ? { ...c, panDrift: dir, panOffset: 0 }
                : c
            )
          );
          break;
        }
        case 'TRIM_CLIP': {
          setClips((prevClips) =>
            prevClips.map((c) =>
              c.id === activeClipId || c.id === cmd.clipId
                ? { ...c, start: Number(cmd.start), end: Number(cmd.end) }
                : c
            )
          );
          break;
        }
        case 'HIGHLIGHT_WORDS': {
          const wordsToHighlight: string[] = cmd.words || [];
          setTranscription((prevWords) =>
            prevWords.map((w) => {
              const matches = wordsToHighlight.some(
                (hw) => w.word.toLowerCase().replace(/[^a-z]/g, '') === hw.toLowerCase().replace(/[^a-z]/g, '')
              );
              return matches ? { ...w, highlighted: true } : w;
            })
          );
          break;
        }
        case 'DELETE_WORDS': {
          // Rough Cut · Remove Filler: cut the listed words out of the video.
          const wordsToDelete: string[] = cmd.words || [];
          setTranscription((prevWords) =>
            prevWords.map((w) => {
              const matches = wordsToDelete.some(
                (hw) => w.word.toLowerCase().replace(/[^a-z]/g, '') === hw.toLowerCase().replace(/[^a-z]/g, '')
              );
              return matches ? { ...w, deleted: true } : w;
            })
          );
          break;
        }
        default:
          console.warn('Unknown AI Command:', cmd);
      }
    });
  };

  // Pack active state for child panels
  const projectState: ProjectState = {
    apiKey,
    media,
    transcription,
    clips,
    overlays,
    sfxCues,
    activeClipId,
    captionStyle,
    playhead,
    isPlaying,
    chatHistory,
    isTranscribing,
    isProcessingAi
  };

  return (
    <div className="app-container">
      {/* 1. Main Navigation Sidebar (Left) */}
      <aside className="nav-sidebar">
        <div className="brand-header">
          <BrainCircuit className="brand-logo" />
          <div className="brand-titles">
            <h1>AI Producer</h1>
            <span>Edith Engine v1.0</span>
          </div>
        </div>

        <nav className="nav-menu">
          <div className="nav-section-title">Workspace</div>
          <button className="nav-item active">
            <Film size={15} />
            <span>Clip edit</span>
          </button>
          <button className="nav-item disabled" title="Coming Soon">
            <Video size={15} />
            <span>Templates</span>
          </button>
        </nav>

        {/* <div className="sidebar-bottom">
          <div className="upgrade-card">
            <h4>Get Pro Edition</h4>
            <p>Unlock 1080p WebM rendering & unlimited AI minutes.</p>
            <button className="upgrade-btn">Upgrade</button>
          </div>
          
          <div className="user-profile">
            <div className="avatar-circle">
              <User size={14} />
            </div>
            <div className="profile-info">
              <div className="username">pradeepj@fluxlabs.in</div>
              <div className="user-plan">Free Plan</div>
            </div>
          </div>
        </div> */}
      </aside>

      {/* 2. Middle & Right Workspace Panels */}
      {media ? (
        <main className="main-workspace">
          {/* Middle Column: Transcript and Copilot Chat */}
          <section className="dashboard-console">
            <div className="top-api-bar">
              <div className="api-badge">
                <ShieldCheck size={14} />
                <span>Groq API Connected</span>
              </div>
              
              <div className="api-input-inline">
                <Key size={12} className="text-dimmed" />
                <input
                  type="password"
                  placeholder="Enter Groq Key..."
                  value={apiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                />
              </div>
            </div>

            {/* The copilot stays mounted either way: skills like caption and
                camera presets run locally and must not be gated behind a
                successful transcription. */}
            <div className="console-split-layout">
              {transcription.length === 0 ? (
                <div className="transcription-trigger-screen">
                  <Sparkles className="large-spark-icon animated-float" size={48} />
                  <h3>Transcribe &amp; Curate Video</h3>
                  <p>
                    Edith will analyze your video's audio, generate precise captions, and run our LLaMA viral moments pipeline to propose short-form clips with high hook indices.
                  </p>

                  <CaptionLanguagePicker
                    value={captionLanguage}
                    onChange={setCaptionLanguage}
                    disabled={isTranscribing}
                  />

                  <GlossaryInput
                    glossary={glossary}
                    onChange={handleGlossaryChange}
                    fixCaptions={fixCaptions}
                    onChangeFixCaptions={handleFixCaptionsChange}
                    disabled={isTranscribing}
                  />

                  {isTranscribing ? (
                    <div className="progress-container">
                      <div className="spinner"></div>
                      <div className="progress-bar-bg">
                        <div className="progress-bar-fill" style={{ width: `${transcribeProgress}%` }}></div>
                      </div>
                      <span>Processing audio pipeline: {transcribeProgress}%</span>
                    </div>
                  ) : (
                    <button className="run-pipeline-btn" onClick={handleStartPipeline}>
                      Transcribe with Groq Whisper
                    </button>
                  )}
                </div>
              ) : (
                <TranscriptEditor
                  transcription={transcription}
                  playhead={playhead}
                  captionStyle={captionStyle}
                  onChangeStyle={(next) => {
                    commit('caption style');
                    setCaptionStyle(next);
                  }}
                  onUpdateWord={handleUpdateWord}
                  onSeek={(t) => {
                    setPlayhead(t);
                    const video = document.querySelector('.canvas-container video') as HTMLVideoElement;
                    if (video) video.currentTime = t;
                  }}
                  onRetranscribe={handleStartPipeline}
                  retranscribing={isTranscribing}
                  captionLanguage={captionLanguage}
                  onChangeCaptionLanguage={setCaptionLanguage}
                  glossary={glossary}
                  onGlossaryChange={handleGlossaryChange}
                  fixCaptions={fixCaptions}
                  onFixCaptionsChange={handleFixCaptionsChange}
                />
              )}

              {/* Copilot chat panel */}
              <AiCopilot
                state={projectState}
                onAddChatMessage={(msg) => setChatHistory((prev) => [...prev, msg])}
                onApplyAiCommands={handleApplyAiCommands}
                onSetIsProcessing={setIsProcessingAi}
              />
            </div>
          </section>

          {/* Right Column: Player, Timeline & Exporter */}
          <section className="preview-timeline-workspace">
            <div className="preview-top-toolbar">
              <ClipList
                shorts={shorts}
                activeShortId={activeShortId}
                onSelectShort={handleSelectShort}
                isProcessing={isTranscribing}
              />
              
              <div className="exporter-block-container">
                <Exporter state={projectState} />
              </div>
            </div>

            <VideoPlayer
              state={projectState}
              onChangePlayhead={setPlayhead}
              onChangeIsPlaying={setIsPlaying}
              onChangeVolume={setVolume}
            />

            <Timeline
              state={projectState}
              onChangePlayhead={setPlayhead}
              onSplitClip={handleSplitClip}
              onDeleteClip={handleDeleteClip}
              onSelectClip={setActiveClipId}
              canUndo={past.length > 0}
              canRedo={future.length > 0}
              onUndo={undo}
              onRedo={redo}
            />
          </section>
        </main>
      ) : (
        /* Landing/Upload View */
        <main className="landing-screen">
          <div className="landing-card animate-scale-up">
            <div className="glowing-orb"></div>
            
            <div className="logo-badge">
              <BrainCircuit size={28} />
              <h2>AI Producer</h2>
            </div>
            
            <h1 className="landing-title">Turn long videos into viral clips with <em>Groq</em></h1>
            <p className="landing-desc">
              Upload your video, extract speech with Groq Whisper, and let LLaMA auto-crop to 9:16 vertical shorts with engaging kinetic captions.
            </p>

            <div className="api-card">
              <div className="card-header-icon">
                <Key size={18} />
                <h3>Groq Cloud Integration</h3>
              </div>
              <input
                type="password"
                placeholder="Enter Groq API Key (gsk_...)"
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                className="api-key-input"
              />
              <span className="api-help-text">
                Your key remains client-side. Stored locally in your browser's secure context.
              </span>
            </div>

            <div className="upload-options">
              <label className="drag-upload-box">
                <Upload size={32} className="upload-arrow-icon" />
                <span>Choose video file (MP4, WebM)</span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </label>
              
              {/* <div className="divider-text">OR</div>
              
              <button className="load-sample-btn" onClick={handleLoadSample}>
                <Film size={16} />
                Load Sample Video Clip
              </button> */}
            </div>
          </div>
        </main>
      )}
    </div>
  );
};

export default App;
