import {
  Captions,
  Sparkles,
  Clapperboard,
  Palette,
  Camera,
  Layers,
  Scissors,
  Volume2,
  Music,
  type LucideIcon
} from 'lucide-react';
import { CaptionStyle } from '../types/video';

/* ==========================================================================
   Skill catalogue
   Each preset is addressed by a slash command (`/caption-focus-pull`).
   Presets that carry `commands` are executed locally by the editor; the rest
   fall through to the copilot as a natural-language `prompt`.
   ========================================================================== */

export type SkillCommand =
  | ({ type: 'UPDATE_STYLE' } & Partial<CaptionStyle>)
  | { type: 'ADJUST_PAN'; panOffset: number }
  | { type: 'APPLY_GRADE'; grade: string }
  | { type: 'ADD_MOTION'; kind: string; text?: string; subtext?: string; value?: number }
  | { type: 'CLEAR_MOTION'; kind?: string }
  | { type: 'REMOVE_SILENCE' }
  | { type: 'TRIM_SILENCE_EDGES' }
  | { type: 'ADD_SFX'; kind: string }
  | { type: 'CLEAR_SFX'; kind?: string }
  | { type: 'TRIM_CLIP'; start: number; end: number }
  | { type: 'HIGHLIGHT_WORDS'; words: string[] }
  | { type: 'DELETE_WORDS'; words: string[] }
  | { type: 'SET_DRIFT'; direction: 'left' | 'right' | 'none' };

/** How a preset tile paints its 9:16 thumbnail. Everything is drawn in CSS/SVG
 *  so the palette stays self-contained — no thumbnail assets to ship. */
export interface PresetPreview {
  /** Chooses the schematic drawn behind/over the frame. */
  kind: 'caption' | 'motion' | 'broll' | 'restyle' | 'camera' | 'overlay' | 'cut' | 'audio';
  /** CSS background for the fake video frame. */
  backdrop: string;
  /** Tint of the subject silhouette. */
  subject?: string;
  caption?: {
    lead?: string;
    main: string;
    font?: string;
    color?: string;
    accentColor?: string;
    italic?: boolean;
    uppercase?: boolean;
    weight?: number;
    /** Vertical placement, % from top. */
    y?: number;
    align?: 'center' | 'left';
    boxed?: boolean;
    /** Fill of the boxed label bar, e.g. '#FFD34D' (defaults to white). */
    boxColor?: string;
  };
  /** Free-form hint used by schematic kinds (arrow direction, bar count…). */
  motif?: string;
}

export interface SkillPreset {
  /** Slash command slug, without the leading slash. */
  id: string;
  name: string;
  description: string;
  preview: PresetPreview;
  /** Applied directly by the editor when present. */
  commands?: SkillCommand[];
  /** Sent to the copilot when there are no local commands. */
  prompt?: string;
  /** Capability the editor doesn't ship yet — shown disabled in the palette. */
  soon?: boolean;
}

export interface Skill {
  id: string;
  name: string;
  icon: LucideIcon;
  /** Accent used for the icon chip. */
  tint: string;
  blurb: string;
  presets: SkillPreset[];
}

const base: CaptionStyle = {
  fontFamily: 'Inter',
  fontSize: 62,
  primaryColor: '#FFFFFF',
  activeWordColor: '#FFE600',
  strokeColor: '#000000',
  strokeWidth: 8,
  uppercase: true,
  activeWordScale: 1.25,
  positionY: 70,
  animatePop: true,
  addEmojis: true,
  boxed: false
};

const styleCommand = (over: Partial<CaptionStyle>): SkillCommand[] => [
  { type: 'UPDATE_STYLE', ...base, ...over }
];

export const SKILLS: Skill[] = [
  {
    id: 'caption',
    name: 'Caption',
    icon: Captions,
    tint: '#cfc8ba',
    blurb: 'Kinetic subtitle styles burned into the 9:16 render.',
    presets: [
      {
        id: 'caption-focus-pull',
        name: 'Focus Pull',
        description: 'Small lead-in line with an oversized italic serif payoff word.',
        commands: styleCommand({
          fontFamily: 'Georgia, serif',
          fontSize: 74,
          primaryColor: '#FFFFFF',
          activeWordColor: '#FFFFFF',
          activeWordScale: 1.45,
          strokeWidth: 4,
          uppercase: false,
          positionY: 62
        }),
        preview: {
          kind: 'caption',
          backdrop: 'linear-gradient(165deg, #6d7f96, #38414f)',
          subject: 'rgba(20,24,32,0.55)',
          caption: {
            lead: 'It Takes',
            main: 'Focus',
            font: 'Georgia, serif',
            italic: true,
            uppercase: false,
            y: 62
          }
        }
      },
      {
        id: 'caption-editorial-left',
        name: 'Editorial Left',
        description: 'Left-aligned magazine styling, no outline, generous leading.',
        commands: styleCommand({
          fontFamily: 'Georgia, serif',
          fontSize: 66,
          primaryColor: '#F5F2EA',
          activeWordColor: '#F5F2EA',
          strokeWidth: 2,
          uppercase: false,
          activeWordScale: 1.15,
          positionY: 40,
          addEmojis: false
        }),
        preview: {
          kind: 'caption',
          backdrop: 'linear-gradient(165deg, #7a8ba0, #3d4653)',
          subject: 'rgba(18,22,30,0.5)',
          caption: {
            lead: 'a quiet',
            main: 'revolution',
            font: 'Georgia, serif',
            italic: true,
            uppercase: false,
            align: 'left',
            y: 34
          }
        }
      },
      {
        id: 'caption-hormozi-punch',
        name: 'Hormozi Punch',
        description: 'Heavy uppercase with a yellow active word and thick outline.',
        commands: styleCommand({
          fontFamily: 'Impact',
          fontSize: 72,
          activeWordColor: '#FFE600',
          strokeWidth: 10,
          activeWordScale: 1.35,
          positionY: 72
        }),
        preview: {
          kind: 'caption',
          backdrop: 'linear-gradient(165deg, #5c6b7d, #2b323c)',
          subject: 'rgba(16,20,26,0.55)',
          caption: {
            main: 'THIS CHANGES',
            font: 'Impact, sans-serif',
            accentColor: '#FFE600',
            uppercase: true,
            y: 70
          }
        }
      },
      {
        id: 'caption-boxed-hook',
        name: 'Boxed Hook',
        description: 'Solid label bar behind the text — reads on any background.',
        commands: styleCommand({
          fontFamily: 'Inter',
          fontSize: 56,
          primaryColor: '#0B0B0E',
          activeWordColor: '#0B0B0E',
          strokeColor: '#FFFFFF',
          strokeWidth: 14,
          activeWordScale: 1.1,
          positionY: 78,
          addEmojis: false
        }),
        preview: {
          kind: 'caption',
          backdrop: 'linear-gradient(165deg, #6f7f74, #313a36)',
          subject: 'rgba(16,22,20,0.5)',
          caption: {
            main: '24 HOURS SOLO',
            font: 'Inter, sans-serif',
            color: '#0B0B0E',
            uppercase: true,
            boxed: true,
            y: 74
          }
        }
      },
      {
        id: 'caption-neon-cyber',
        name: 'Neon Cyber',
        description: 'Monospace cyan with a magenta active word.',
        commands: styleCommand({
          fontFamily: 'monospace',
          fontSize: 60,
          primaryColor: '#00F0FF',
          activeWordColor: '#FF3DDA',
          strokeColor: '#05050A',
          strokeWidth: 10,
          positionY: 66,
          addEmojis: false
        }),
        preview: {
          kind: 'caption',
          backdrop: 'linear-gradient(165deg, #2b2350, #0d0b1c)',
          subject: 'rgba(90,60,180,0.35)',
          caption: {
            main: 'SIGNAL LOST',
            font: 'ui-monospace, monospace',
            color: '#00F0FF',
            accentColor: '#FF3DDA',
            uppercase: true,
            y: 66
          }
        }
      },
      {
        id: 'caption-reset',
        name: 'Reset Captions',
        description: 'Back to the default caption styling.',
        commands: styleCommand({}),
        preview: {
          kind: 'caption',
          backdrop: 'linear-gradient(165deg, #2a2a30, #121215)',
          motif: 'clear',
          caption: { main: 'Abc', font: 'Inter, sans-serif', uppercase: false, y: 62 }
        }
      },
      {
        id: 'caption-clean-minimal',
        name: 'Clean Minimal',
        description: 'Small, low-contrast captions that stay out of the way.',
        commands: styleCommand({
          fontFamily: 'Inter',
          fontSize: 44,
          primaryColor: '#FFFFFF',
          activeWordColor: '#FFFFFF',
          strokeWidth: 3,
          uppercase: false,
          activeWordScale: 1.05,
          positionY: 84,
          animatePop: false,
          addEmojis: false
        }),
        preview: {
          kind: 'caption',
          backdrop: 'linear-gradient(165deg, #8d9298, #43474d)',
          subject: 'rgba(20,22,26,0.45)',
          caption: {
            main: 'quietly, it worked',
            font: 'Inter, sans-serif',
            uppercase: false,
            y: 82
          }
        }
      },
      {
        id: 'caption-karaoke-follow',
        name: 'Karaoke Follow',
        description: 'Inactive words sit dim while the spoken word lights up — the classic karaoke tracking style.',
        commands: styleCommand({
          fontFamily: 'Inter',
          fontSize: 58,
          primaryColor: '#8E8E8C',
          activeWordColor: '#FFD34D',
          strokeColor: '#000000',
          strokeWidth: 8,
          uppercase: true,
          activeWordScale: 1.18,
          positionY: 74,
          addEmojis: false
        }),
        preview: {
          kind: 'caption',
          backdrop: 'linear-gradient(165deg, #4a5262, #1b1f27)',
          subject: 'rgba(16,20,26,0.5)',
          caption: {
            lead: 'the',
            main: 'WORD',
            font: 'Inter, sans-serif',
            accentColor: '#FFD34D',
            uppercase: true,
            y: 74
          }
        }
      },
      {
        id: 'caption-subtitle-block',
        name: 'Subtitle Block',
        description: 'Traditional subtitle bar — a translucent dark box that reads on any footage.',
        commands: styleCommand({
          fontFamily: 'Inter',
          fontSize: 52,
          primaryColor: '#FFFFFF',
          activeWordColor: '#FFFFFF',
          strokeColor: '#000000',
          strokeWidth: 6,
          uppercase: false,
          activeWordScale: 1.05,
          positionY: 82,
          animatePop: false,
          addEmojis: false,
          boxed: true,
          boxColor: 'rgba(0,0,0,0.62)'
        }),
        preview: {
          kind: 'caption',
          backdrop: 'linear-gradient(165deg, #7a8ba0, #3d4653)',
          subject: 'rgba(18,22,30,0.5)',
          caption: {
            main: 'subtitle block',
            font: 'Inter, sans-serif',
            color: '#FFFFFF',
            uppercase: false,
            boxed: true,
            boxColor: 'rgba(0,0,0,0.72)',
            y: 80
          }
        }
      },
      {
        id: 'caption-red-alert',
        name: 'Red Alert',
        description: 'Bold sans with the punch word in red — the business-TikTok highlight style.',
        commands: styleCommand({
          fontFamily: 'Space Grotesk',
          fontSize: 66,
          primaryColor: '#FFFFFF',
          activeWordColor: '#FF5A4E',
          strokeColor: '#000000',
          strokeWidth: 9,
          uppercase: true,
          activeWordScale: 1.3,
          positionY: 70,
          addEmojis: false
        }),
        preview: {
          kind: 'caption',
          backdrop: 'linear-gradient(165deg, #5c6575, #262b34)',
          subject: 'rgba(16,20,26,0.5)',
          caption: {
            main: 'HOOK',
            font: 'Space Grotesk, sans-serif',
            accentColor: '#FF5A4E',
            uppercase: true,
            y: 70
          }
        }
      },
      {
        id: 'caption-color-block',
        name: 'Color Block',
        description: 'Dark text on a solid brand-color bar — loud and instantly readable.',
        commands: styleCommand({
          fontFamily: 'Inter',
          fontSize: 58,
          primaryColor: '#0B0B0E',
          activeWordColor: '#0B0B0E',
          strokeColor: '#0B0B0E',
          strokeWidth: 2,
          uppercase: true,
          activeWordScale: 1.1,
          positionY: 76,
          addEmojis: false,
          boxed: true,
          boxColor: '#FFD34D'
        }),
        preview: {
          kind: 'caption',
          backdrop: 'linear-gradient(165deg, #6d7f96, #38414f)',
          subject: 'rgba(20,24,32,0.55)',
          caption: {
            main: 'NO EXCUSES',
            font: 'Inter, sans-serif',
            color: '#0B0B0E',
            uppercase: true,
            boxed: true,
            boxColor: '#FFD34D',
            y: 74
          }
        }
      },
      {
        id: 'caption-mono-data',
        name: 'Mono Data',
        description: 'Monospace numerals and stats with a warm orange active word.',
        commands: styleCommand({
          fontFamily: 'JetBrains Mono',
          fontSize: 54,
          primaryColor: '#FFFFFF',
          activeWordColor: '#FF9A3D',
          strokeColor: '#000000',
          strokeWidth: 8,
          uppercase: true,
          activeWordScale: 1.2,
          positionY: 68,
          addEmojis: false
        }),
        preview: {
          kind: 'caption',
          backdrop: 'linear-gradient(165deg, #2c3542, #12151b)',
          subject: 'rgba(14,18,24,0.5)',
          caption: {
            main: '10,000',
            font: 'ui-monospace, monospace',
            accentColor: '#FF9A3D',
            uppercase: true,
            y: 68
          }
        }
      },
      {
        id: 'caption-script-elegant',
        name: 'Script Elegant',
        description: 'Handwritten cursive for beauty, travel and lifestyle edits.',
        commands: styleCommand({
          fontFamily: 'Brush Script MT, Segoe Script, cursive',
          fontSize: 64,
          primaryColor: '#F5F1E8',
          activeWordColor: '#F5F1E8',
          strokeColor: '#1B1B1F',
          strokeWidth: 2,
          uppercase: false,
          activeWordScale: 1.1,
          positionY: 66,
          animatePop: false,
          addEmojis: false
        }),
        preview: {
          kind: 'caption',
          backdrop: 'linear-gradient(165deg, #b9a78e, #5c4f3e)',
          subject: 'rgba(50,38,24,0.4)',
          caption: {
            main: 'wander',
            font: 'cursive',
            italic: true,
            uppercase: false,
            y: 64
          }
        }
      },
      {
        id: 'caption-two-tone-pop',
        name: 'Two-Tone Pop',
        description: 'White fill with a red outline — the YouTube-punch heavyweight look.',
        commands: styleCommand({
          fontFamily: 'Impact',
          fontSize: 72,
          primaryColor: '#FFFFFF',
          activeWordColor: '#FFFFFF',
          strokeColor: '#FF5A4E',
          strokeWidth: 10,
          uppercase: true,
          activeWordScale: 1.25,
          positionY: 68,
          addEmojis: false
        }),
        preview: {
          kind: 'caption',
          backdrop: 'linear-gradient(165deg, #4e3f3d, #201a19)',
          subject: 'rgba(30,18,16,0.5)',
          caption: {
            main: 'HOLD UP',
            font: 'Impact, sans-serif',
            accentColor: '#FF5A4E',
            uppercase: true,
            y: 68
          }
        }
      },
      {
        id: 'caption-light-invert',
        name: 'Light Invert',
        description: 'Black text with a white outline — stays readable on bright footage.',
        commands: styleCommand({
          fontFamily: 'Inter',
          fontSize: 60,
          primaryColor: '#111114',
          activeWordColor: '#111114',
          strokeColor: '#FFFFFF',
          strokeWidth: 10,
          uppercase: true,
          activeWordScale: 1.2,
          positionY: 72,
          addEmojis: false
        }),
        preview: {
          kind: 'caption',
          backdrop: 'linear-gradient(165deg, #e8e4da, #9a9488)',
          subject: 'rgba(40,38,32,0.25)',
          caption: {
            main: 'BRIGHT DAY',
            font: 'Inter, sans-serif',
            color: '#111114',
            uppercase: true,
            y: 72
          }
        }
      },
      {
        id: 'caption-zoom-punch',
        name: 'Zoom Punch',
        description: 'The spoken word balloons huge against a minimal backdrop.',
        commands: styleCommand({
          fontFamily: 'Space Grotesk',
          fontSize: 60,
          primaryColor: '#FFFFFF',
          activeWordColor: '#FFFFFF',
          strokeColor: '#000000',
          strokeWidth: 7,
          uppercase: true,
          activeWordScale: 1.65,
          positionY: 68,
          addEmojis: false
        }),
        preview: {
          kind: 'caption',
          backdrop: 'linear-gradient(165deg, #3a3f48, #171a1f)',
          subject: 'rgba(16,20,26,0.45)',
          caption: {
            lead: 'it is a',
            main: 'BIG',
            font: 'Space Grotesk, sans-serif',
            uppercase: true,
            y: 68
          }
        }
      },
      {
        id: 'caption-emoji-pop',
        name: 'Emoji Pop',
        description: 'Playful rounded captions with a reaction emoji above the punch word.',
        commands: styleCommand({
          fontFamily: 'Inter',
          fontSize: 58,
          primaryColor: '#FFFFFF',
          activeWordColor: '#3ECF8E',
          strokeColor: '#000000',
          strokeWidth: 8,
          uppercase: false,
          activeWordScale: 1.3,
          positionY: 74,
          addEmojis: true
        }),
        preview: {
          kind: 'caption',
          backdrop: 'linear-gradient(165deg, #3f5a4e, #16211c)',
          subject: 'rgba(14,24,20,0.5)',
          caption: {
            main: '🔥 literally fire',
            font: 'Inter, sans-serif',
            accentColor: '#3ECF8E',
            uppercase: false,
            y: 72
          }
        }
      }
    ]
  },
  {
    id: 'motion-graphics',
    name: 'Motion Graphics',
    icon: Sparkles,
    tint: '#d9a441',
    blurb: 'Animated titles, counters and lower thirds.',
    presets: [
      {
        id: 'motion-kinetic-title',
        name: 'Kinetic Title',
        description: 'Word-by-word title card that snaps in on the beat.',
        commands: [{ type: 'ADD_MOTION', kind: 'kinetic-title' }],
        preview: {
          kind: 'motion',
          backdrop: 'linear-gradient(165deg, #3b3560, #14121f)',
          caption: { main: 'BIG IDEA', font: 'Inter, sans-serif', uppercase: true, y: 46 },
          motif: 'stack'
        }
      },
      {
        id: 'motion-lower-third',
        name: 'Lower Third',
        description: 'Name and title bar that slides in from the left edge.',
        commands: [{ type: 'ADD_MOTION', kind: 'lower-third' }],
        preview: {
          kind: 'motion',
          backdrop: 'linear-gradient(165deg, #4a5262, #1b1f27)',
          subject: 'rgba(16,20,26,0.5)',
          motif: 'lower-third'
        }
      },
      {
        id: 'motion-stat-counter',
        name: 'Stat Counter',
        description: 'Number that rolls up to the figure being spoken.',
        commands: [{ type: 'ADD_MOTION', kind: 'stat-counter' }],
        preview: {
          kind: 'motion',
          backdrop: 'linear-gradient(165deg, #2f4a45, #101a1c)',
          caption: { main: '10,000', font: 'Inter, sans-serif', accentColor: '#3ECF8E', y: 48 },
          motif: 'counter'
        }
      },
      {
        id: 'motion-progress-ring',
        name: 'Progress Ring',
        description: 'Corner ring that tracks how much of the short is left.',
        commands: [{ type: 'ADD_MOTION', kind: 'progress-ring' }],
        preview: {
          kind: 'motion',
          backdrop: 'linear-gradient(165deg, #3d3550, #16131e)',
          motif: 'ring'
        }
      },
      {
        id: 'motion-clear',
        name: 'Remove All',
        description: 'Strips every motion graphic from the clip.',
        commands: [{ type: 'CLEAR_MOTION' }],
        preview: {
          kind: 'motion',
          backdrop: 'linear-gradient(165deg, #2a2a30, #121215)',
          motif: 'clear'
        }
      }
    ]
  },
  {
    id: 'auto-broll',
    name: 'Auto B-Roll',
    icon: Clapperboard,
    tint: '#8fb896',
    blurb: 'Cutaway footage matched to what is being said.',
    presets: [
      {
        id: 'broll-keyword-cutaway',
        name: 'Keyword Cutaway',
        description: 'Inserts a cutaway whenever a concrete noun is spoken.',
        soon: true,
        preview: {
          kind: 'broll',
          backdrop: 'linear-gradient(165deg, #46596b, #1a2129)',
          motif: 'split'
        }
      },
      {
        id: 'broll-picture-in-picture',
        name: 'Picture in Picture',
        description: 'Keeps the speaker in a corner card over the cutaway.',
        soon: true,
        preview: {
          kind: 'broll',
          backdrop: 'linear-gradient(165deg, #3f5a5e, #161f22)',
          motif: 'pip'
        }
      },
      {
        id: 'broll-full-bleed',
        name: 'Full Bleed',
        description: 'Cuts entirely to footage while the audio keeps running.',
        soon: true,
        preview: {
          kind: 'broll',
          backdrop: 'linear-gradient(165deg, #5b5140, #1f1a13)',
          motif: 'full'
        }
      }
    ]
  },
  {
    id: 'scene-restyle',
    name: 'Scene Restyle',
    icon: Palette,
    tint: '#c4694a',
    blurb: 'Colour grades and stylised looks for the whole frame.',
    presets: [
      {
        id: 'restyle-cozy-craft',
        name: 'Cozy Craft',
        description: 'Warm, soft-contrast grade with lifted blacks.',
        commands: [{ type: 'APPLY_GRADE', grade: 'cozy-craft' }],
        preview: {
          kind: 'restyle',
          backdrop: 'linear-gradient(165deg, #d9a273, #6b4630)',
          subject: 'rgba(60,32,18,0.4)',
          motif: 'warm'
        }
      },
      {
        id: 'restyle-teal-orange',
        name: 'Teal & Orange',
        description: 'Cinematic split tone — cool shadows, warm skin.',
        commands: [{ type: 'APPLY_GRADE', grade: 'teal-orange' }],
        preview: {
          kind: 'restyle',
          backdrop: 'linear-gradient(165deg, #e08f5a, #12414d)',
          subject: 'rgba(10,50,60,0.35)',
          motif: 'split-tone'
        }
      },
      {
        id: 'restyle-bleach-print',
        name: 'Bleach Print',
        description: 'Desaturated high-contrast documentary look.',
        commands: [{ type: 'APPLY_GRADE', grade: 'bleach-print' }],
        preview: {
          kind: 'restyle',
          backdrop: 'linear-gradient(165deg, #9a9a9a, #232323)',
          subject: 'rgba(0,0,0,0.4)',
          motif: 'mono'
        }
      },
      {
        id: 'restyle-night-neon',
        name: 'Night Neon',
        description: 'Deep blues with magenta rim light.',
        commands: [{ type: 'APPLY_GRADE', grade: 'night-neon' }],
        preview: {
          kind: 'restyle',
          backdrop: 'linear-gradient(165deg, #3a1e5c, #0a1030)',
          subject: 'rgba(120,40,160,0.4)',
          motif: 'neon'
        }
      },
      {
        id: 'restyle-original',
        name: 'Original',
        description: 'Removes the colour grade and restores the untouched footage.',
        commands: [{ type: 'APPLY_GRADE', grade: 'none' }],
        preview: {
          kind: 'restyle',
          backdrop: 'linear-gradient(165deg, #8a97a6, #39414c)',
          subject: 'rgba(20,24,32,0.45)',
          motif: 'none'
        }
      }
    ]
  },
  {
    id: 'camera-movement',
    name: 'Camera Movement',
    icon: Camera,
    tint: '#cfc8ba',
    blurb: 'Reframe and drift the 9:16 crop across the source frame.',
    presets: [
      {
        id: 'camera-center-lock',
        name: 'Center Lock',
        description: 'Holds the crop dead centre on the speaker.',
        commands: [{ type: 'ADJUST_PAN', panOffset: 0 }],
        preview: {
          kind: 'camera',
          backdrop: 'linear-gradient(165deg, #4c5666, #191d24)',
          motif: 'center'
        }
      },
      {
        id: 'camera-punch-left',
        name: 'Punch Left',
        description: 'Shifts the crop toward the left third of the source.',
        commands: [{ type: 'ADJUST_PAN', panOffset: -60 }],
        preview: {
          kind: 'camera',
          backdrop: 'linear-gradient(165deg, #4c5666, #191d24)',
          motif: 'left'
        }
      },
      {
        id: 'camera-punch-right',
        name: 'Punch Right',
        description: 'Shifts the crop toward the right third of the source.',
        commands: [{ type: 'ADJUST_PAN', panOffset: 60 }],
        preview: {
          kind: 'camera',
          backdrop: 'linear-gradient(165deg, #4c5666, #191d24)',
          motif: 'right'
        }
      },
      {
        id: 'camera-slow-drift',
        name: 'Slow Drift',
        description: 'Gentle horizontal drift from left to right across the shot.',
        commands: [{ type: 'SET_DRIFT', direction: 'left' }],
        preview: {
          kind: 'camera',
          backdrop: 'linear-gradient(165deg, #4c5666, #191d24)',
          motif: 'drift'
        }
      }
    ]
  },
  {
    id: 'floating-overlay',
    name: 'Floating Overlay',
    icon: Layers,
    tint: '#d9a441',
    blurb: 'Cards, arrows and stickers layered over the frame.',
    presets: [
      {
        id: 'overlay-comment-card',
        name: 'Comment Card',
        description: 'Social comment bubble that pops in and settles.',
        commands: [{ type: 'ADD_MOTION', kind: 'comment-card', text: 'This is gold 😍', subtext: '@viral_clip' }],
        preview: {
          kind: 'overlay',
          backdrop: 'linear-gradient(165deg, #4e5a6b, #1b2027)',
          subject: 'rgba(16,20,26,0.5)',
          motif: 'card'
        }
      },
      {
        id: 'overlay-arrow-callout',
        name: 'Arrow Callout',
        description: 'Hand-drawn arrow pointing at part of the frame.',
        commands: [{ type: 'ADD_MOTION', kind: 'arrow-callout', text: 'Look here' }],
        preview: {
          kind: 'overlay',
          backdrop: 'linear-gradient(165deg, #57606e, #1e2229)',
          subject: 'rgba(16,20,26,0.45)',
          motif: 'arrow'
        }
      },
      {
        id: 'overlay-emoji-burst',
        name: 'Emoji Burst',
        description: 'Reaction emojis that burst on emphasised words.',
        commands: [{ type: 'ADD_MOTION', kind: 'emoji-burst', text: '🔥' }],
        preview: {
          kind: 'overlay',
          backdrop: 'linear-gradient(165deg, #6b5570, #241c28)',
          motif: 'emoji'
        }
      }
    ]
  },
  {
    id: 'rough-cut',
    name: 'Rough Cut',
    icon: Scissors,
    tint: '#c4694a',
    blurb: 'Structural edits to pacing and dead air.',
    presets: [
      {
        id: 'cut-remove-silence',
        name: 'Remove Silence',
        description: 'Analyses the audio and cuts every pause longer than ~0.35s.',
        commands: [{ type: 'REMOVE_SILENCE' }],
        preview: {
          kind: 'cut',
          backdrop: 'linear-gradient(165deg, #3f4653, #15181d)',
          motif: 'silence'
        }
      },
      {
        id: 'cut-remove-filler',
        name: 'Remove Filler',
        description: 'Cuts um, uh, like and you know from the transcript.',
        commands: [
          { type: 'DELETE_WORDS', words: ['um', 'uh', 'like', 'you', 'know', 'basically', 'literally'] }
        ],
        preview: {
          kind: 'cut',
          backdrop: 'linear-gradient(165deg, #4a3f53, #17131c)',
          motif: 'filler'
        }
      },
      {
        id: 'cut-tighten-pacing',
        name: 'Tighten Pacing',
        description: 'Trims silence off the head and tail so it opens on speech.',
        commands: [{ type: 'TRIM_SILENCE_EDGES' }],
        preview: {
          kind: 'cut',
          backdrop: 'linear-gradient(165deg, #3d4c46, #131b18)',
          motif: 'tighten'
        }
      }
    ]
  },
  {
    id: 'sound-effect',
    name: 'Sound Effect',
    icon: Volume2,
    tint: '#8fb896',
    blurb: 'Transitions, risers and impacts on the cut points.',
    presets: [
      {
        id: 'sfx-whoosh-transition',
        name: 'Whoosh Transition',
        description: 'Airy whoosh on every cut in the timeline.',
        commands: [{ type: 'ADD_SFX', kind: 'whoosh' }],
        preview: {
          kind: 'audio',
          backdrop: 'linear-gradient(165deg, #2f4a45, #101a1c)',
          motif: 'whoosh'
        }
      },
      {
        id: 'sfx-impact-hit',
        name: 'Impact Hit',
        description: 'Low impact hit placed at the playhead.',
        commands: [{ type: 'ADD_SFX', kind: 'impact' }],
        preview: {
          kind: 'audio',
          backdrop: 'linear-gradient(165deg, #46394f, #17121c)',
          motif: 'impact'
        }
      },
      {
        id: 'sfx-riser-build',
        name: 'Riser Build',
        description: 'Tension riser building into the playhead.',
        commands: [{ type: 'ADD_SFX', kind: 'riser' }],
        preview: {
          kind: 'audio',
          backdrop: 'linear-gradient(165deg, #3b4560, #12161f)',
          motif: 'riser'
        }
      },
      {
        id: 'sfx-clear',
        name: 'Remove All',
        description: 'Strips every sound effect from the timeline.',
        commands: [{ type: 'CLEAR_SFX' }],
        preview: {
          kind: 'audio',
          backdrop: 'linear-gradient(165deg, #2a2a30, #121215)',
          motif: 'clear'
        }
      }
    ]
  },
  {
    id: 'background-music',
    name: 'Background Music',
    icon: Music,
    tint: '#8fb896',
    blurb: 'Beds that duck under the voice track.',
    presets: [
      {
        id: 'music-lofi-bed',
        name: 'Lo-fi Bed',
        description: 'Warm lo-fi loop ducked 18dB under speech.',
        soon: true,
        preview: {
          kind: 'audio',
          backdrop: 'linear-gradient(165deg, #4d3f5c, #18131f)',
          motif: 'lofi'
        }
      },
      {
        id: 'music-drive-beat',
        name: 'Drive Beat',
        description: 'Up-tempo percussion for fast-cut edits.',
        soon: true,
        preview: {
          kind: 'audio',
          backdrop: 'linear-gradient(165deg, #5c3540, #1e1015)',
          motif: 'drive'
        }
      },
      {
        id: 'music-ambient-pad',
        name: 'Ambient Pad',
        description: 'Sparse pad that keeps the voice front and centre.',
        soon: true,
        preview: {
          kind: 'audio',
          backdrop: 'linear-gradient(165deg, #354a55, #111a1f)',
          motif: 'ambient'
        }
      }
    ]
  }
];

/** Flat index of every preset, keyed by slash slug. */
export const PRESETS_BY_ID: Record<string, { skill: Skill; preset: SkillPreset }> = {};

function rebuildIndex(): void {
  for (const key of Object.keys(PRESETS_BY_ID)) delete PRESETS_BY_ID[key];
  for (const skill of SKILLS) {
    for (const preset of skill.presets) {
      PRESETS_BY_ID[preset.id] = { skill, preset };
    }
  }
}

/* -------------------------------------------------------- custom presets --
   Styles saved from the caption builder persist in localStorage and inject
   themselves into the Caption skill so the palette and slash commands see
   them exactly like the built-in ones. */
const CUSTOM_STORAGE_KEY = 'edith.custom-caption-presets-v1';
const CUSTOM_ID_PREFIX = 'caption-custom-';

function loadCustomPresets(): SkillPreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is SkillPreset =>
        !!p &&
        typeof p.id === 'string' &&
        p.id.startsWith(CUSTOM_ID_PREFIX) &&
        typeof p.name === 'string' &&
        typeof p.description === 'string' &&
        !!p.preview
    );
  } catch {
    return [];
  }
}

function persistCustomPresets(presets: SkillPreset[]): void {
  try {
    localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // storage unavailable (private mode / quota) — save is best-effort
  }
}

const captionSkill = SKILLS.find((s) => s.id === 'caption');
if (captionSkill) {
  captionSkill.presets.push(...loadCustomPresets());
}
rebuildIndex();

/** Derives a palette thumbnail from a caption style. */
function previewFromStyle(style: CaptionStyle): PresetPreview {
  return {
    kind: 'caption',
    backdrop: 'linear-gradient(165deg, #4c5666, #191d24)',
    subject: 'rgba(16,20,26,0.5)',
    caption: {
      main: 'Aa',
      font: style.fontFamily,
      color: style.primaryColor,
      accentColor: style.activeWordColor,
      uppercase: style.uppercase,
      boxed: style.boxed,
      boxColor: style.boxColor,
      y: Math.min(90, Math.max(20, style.positionY ?? 70))
    }
  };
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'custom';

/** Builds a palette-ready custom preset from the current caption style. */
export function buildCustomCaptionPreset(name: string, style: CaptionStyle): SkillPreset {
  const clean = name.trim() || 'Custom Style';
  return {
    id: `${CUSTOM_ID_PREFIX}${slugify(clean)}-${Date.now().toString(36)}`,
    name: clean,
    description: 'Custom style saved from the caption builder.',
    commands: [{ type: 'UPDATE_STYLE', ...style }],
    preview: previewFromStyle(style)
  };
}

/** Persists a new custom preset and adds it to the Caption skill. */
export function saveCustomCaptionPreset(preset: SkillPreset): void {
  const caption = SKILLS.find((s) => s.id === 'caption');
  if (!caption) return;
  caption.presets.push(preset);
  persistCustomPresets(listCustomCaptionPresets());
  rebuildIndex();
}

/** Saved custom presets, newest last. */
export function listCustomCaptionPresets(): SkillPreset[] {
  const caption = SKILLS.find((s) => s.id === 'caption');
  return (caption?.presets ?? []).filter((p) => p.id.startsWith(CUSTOM_ID_PREFIX));
}

/** Removes a saved custom preset from storage and the palette. */
export function deleteCustomCaptionPreset(id: string): void {
  const caption = SKILLS.find((s) => s.id === 'caption');
  if (!caption) return;
  caption.presets = caption.presets.filter((p) => p.id !== id);
  persistCustomPresets(listCustomCaptionPresets());
  rebuildIndex();
}

/** Pulls a leading `/slug` off a composer message. */
export function parseSlashCommand(text: string): { preset: SkillPreset; skill: Skill; rest: string } | null {
  const match = /^\/([a-z0-9-]+)\s*/i.exec(text.trim());
  if (!match) return null;
  const hit = PRESETS_BY_ID[match[1].toLowerCase()];
  if (!hit) return null;
  return { ...hit, rest: text.trim().slice(match[0].length).trim() };
}

/** Case-insensitive substring match over slug, name and description. */
export function searchPresets(skill: Skill, query: string): SkillPreset[] {
  const q = query.trim().toLowerCase();
  if (!q) return skill.presets;
  return skill.presets.filter(
    (p) =>
      p.id.includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q)
  );
}
