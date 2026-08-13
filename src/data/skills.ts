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
  | { type: 'HIGHLIGHT_WORDS'; words: string[] };

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
  addEmojis: true
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
        prompt: 'Insert b-roll cutaways on the concrete nouns in the transcript, roughly 1.5s each.',
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
        prompt: 'Add picture-in-picture b-roll with the speaker inset in the bottom-right corner.',
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
        prompt: 'Cut away to full-frame b-roll during the explanation, keeping the original audio.',
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
        description: 'Gentle horizontal drift across the shot.',
        prompt: 'Slowly drift the 9:16 crop from left to right across the clip.',
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
        prompt: 'Overlay a social media comment card that pops in during the hook.',
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
        prompt: 'Add a hand-drawn arrow callout pointing at the subject.',
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
        prompt: 'Add an emoji burst reaction on the most emphasised word.',
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
          { type: 'HIGHLIGHT_WORDS', words: ['um', 'uh', 'like', 'you', 'know', 'basically', 'literally'] }
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
        prompt: 'Add a warm lo-fi music bed ducked well under the voice track.',
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
        prompt: 'Add an up-tempo percussive music bed suited to fast cuts.',
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
        prompt: 'Add a sparse ambient pad underneath the narration.',
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
for (const skill of SKILLS) {
  for (const preset of skill.presets) {
    PRESETS_BY_ID[preset.id] = { skill, preset };
  }
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
