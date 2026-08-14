import type { MotionOverlay } from '../data/motion';
import type { SfxCue } from '../data/sfx';
export type { MotionOverlay, SfxCue };

/** Caption output language/script, chosen before transcribing. */
export type CaptionLanguage = 'hinglish' | 'hindi' | 'english';

export const CAPTION_LANGUAGES: { id: CaptionLanguage; label: string; hint: string }[] = [
  { id: 'hinglish', label: 'Hinglish', hint: 'Hindi spoken, romanized in Latin letters' },
  { id: 'hindi', label: 'Hindi script', hint: 'Hindi in Devanagari letters' },
  { id: 'english', label: 'English', hint: 'English transcription' }
];

export interface MediaAsset {
  id: string;
  name: string;
  type: 'video' | 'audio';
  url: string;
  duration: number;
  width?: number;
  height?: number;
  file?: File;
}

export interface TranscriptionWord {
  word: string;
  start: number; // in seconds
  end: number;   // in seconds
  highlighted?: boolean;
  deleted?: boolean;
}

export interface ViralShort {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  score: number;
  hookAnalysis: string;
}

export interface VideoClip {
  id: string;
  assetId: string;
  start: number;         // cut start from source video (seconds)
  end: number;           // cut end from source video (seconds)
  timelineStart: number; // position on active timeline (seconds)
  panOffset: number;     // horizontal shift for 9:16 reframe (-100 to 100)
  panDrift?: 'left' | 'right' | null; // animated reframe: crop glides across the frame while the clip plays
  volume: number;        // 0 to 1
  filter?: string;       // css filter style like 'grayscale(1)'
  grade?: string;        // Scene Restyle grade id, see data/grades.ts
}

export interface Subtitle {
  id: string;
  text: string;
  start: number;
  end: number;
  words?: TranscriptionWord[];
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  status?: 'pending' | 'success' | 'error';
}

export interface CaptionStyle {
  fontFamily: string;
  fontSize: number; // px
  primaryColor: string; // hex
  activeWordColor: string; // hex
  strokeColor: string; // hex
  strokeWidth: number; // px
  uppercase: boolean;
  activeWordScale: number; // e.g. 1.2
  positionY: number; // % from top (0-100)
  animatePop: boolean;
  addEmojis: boolean;
  /** Draw a rounded bar behind the whole phrase (subtitle-block styles). */
  boxed?: boolean;
  /** Bar fill — any CSS color, e.g. 'rgba(0,0,0,0.62)' or '#FFD34D'. */
  boxColor?: string;
}

export interface ProjectState {
  apiKey: string;
  media: MediaAsset | null;
  transcription: TranscriptionWord[];
  clips: VideoClip[];
  /** Motion-graphics overlays, see data/motion.ts */
  overlays: MotionOverlay[];
  /** Synthesised sound-effect cues, see data/sfx.ts */
  sfxCues: SfxCue[];
  activeClipId: string | null;
  captionStyle: CaptionStyle;
  playhead: number; // current time in seconds
  isPlaying: boolean;
  chatHistory: ChatMessage[];
  isTranscribing: boolean;
  isProcessingAi: boolean;
}
