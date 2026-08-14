/* Motion graphics — animated overlays composited onto the preview canvas.
   Everything is driven by the timeline playhead, so the preview and the
   exported recording stay in sync automatically. */

export type MotionKind =
  | 'kinetic-title'
  | 'lower-third'
  | 'stat-counter'
  | 'progress-ring'
  | 'comment-card'
  | 'arrow-callout'
  | 'emoji-burst';

export interface MotionOverlay {
  id: string;
  kind: MotionKind;
  /** Timeline seconds. */
  start: number;
  end: number;
  text?: string;
  subtext?: string;
  /** Target figure for the counter. */
  value?: number;
  color?: string;
}

export const MOTION_KINDS: MotionKind[] = [
  'kinetic-title',
  'lower-third',
  'stat-counter',
  'progress-ring',
  'comment-card',
  'arrow-callout',
  'emoji-burst'
];

export const isMotionKind = (v: unknown): v is MotionKind =>
  typeof v === 'string' && (MOTION_KINDS as string[]).includes(v);

const ACCENT = '#7C6CFF';

/* ---------------------------------------------------------------- easing -- */
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const easeOutBack = (p: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

/* ------------------------------------------------------------- utilities -- */
const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) => {
  const rad = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
};

/** Largest font size at which `text` fits `maxWidth`. */
const fitFontSize = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  weight: number,
  family: string,
  start: number
) => {
  let size = start;
  for (let i = 0; i < 24 && size > 8; i++) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size *= 0.92;
  }
  return size;
};

/* --------------------------------------------------------------- drawing -- */
function drawKineticTitle(
  ctx: CanvasRenderingContext2D,
  o: MotionOverlay,
  t: number,
  W: number,
  H: number
) {
  const words = (o.text || 'YOUR HOOK HERE').toUpperCase().split(/\s+/).filter(Boolean);
  const dur = Math.max(0.4, o.end - o.start);
  const local = t - o.start;

  // Words land one after another, then the whole card fades on the tail.
  const stagger = Math.min(0.16, (dur * 0.55) / Math.max(1, words.length));
  const tailFade = clamp01((o.end - t) / 0.35);

  const family = 'Inter, Impact, sans-serif';
  const maxW = W * 0.84;
  let size = W * 0.13;
  for (const w of words) size = Math.min(size, fitFontSize(ctx, w, maxW, 900, family, W * 0.13));

  const lineH = size * 1.06;
  const blockH = lineH * words.length;
  const top = H * 0.34 - blockH / 2;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  words.forEach((word, i) => {
    const appear = i * stagger;
    const p = clamp01((local - appear) / 0.26);
    if (p <= 0) return;

    const scale = 0.72 + 0.28 * easeOutBack(p);
    const y = top + lineH * i + lineH / 2;

    ctx.save();
    ctx.globalAlpha = p * tailFade;
    ctx.translate(W / 2, y);
    ctx.scale(scale, scale);
    ctx.font = `900 ${size}px ${family}`;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = size * 0.14;
    ctx.strokeText(word, 0, 0);
    ctx.fillStyle = i === words.length - 1 ? o.color || ACCENT : '#FFFFFF';
    ctx.fillText(word, 0, 0);
    ctx.restore();
  });

  ctx.restore();
}

function drawLowerThird(
  ctx: CanvasRenderingContext2D,
  o: MotionOverlay,
  t: number,
  W: number,
  H: number
) {
  const local = t - o.start;
  const inP = easeOutCubic(clamp01(local / 0.45));
  const outP = easeOutCubic(clamp01((o.end - t) / 0.35));
  const reveal = Math.min(inP, outP);
  if (reveal <= 0) return;

  const family = 'Inter, sans-serif';
  const name = o.text || 'Speaker Name';
  const role = o.subtext || '';

  const padX = W * 0.045;
  const nameSize = W * 0.052;
  const roleSize = W * 0.032;
  const barH = role ? H * 0.082 : H * 0.055;
  const y = H * 0.8;

  ctx.font = `700 ${nameSize}px ${family}`;
  const nameW = ctx.measureText(name).width;
  ctx.font = `500 ${roleSize}px ${family}`;
  const roleW = role ? ctx.measureText(role).width : 0;
  const barW = Math.min(W * 0.86, Math.max(nameW, roleW) + padX * 2);

  const x = -barW * (1 - reveal) + W * 0.07 * reveal;

  ctx.save();
  ctx.globalAlpha = reveal;

  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = W * 0.03;
  ctx.shadowOffsetY = H * 0.004;
  ctx.fillStyle = 'rgba(12,12,16,0.82)';
  roundRect(ctx, x, y, barW, barH, W * 0.014);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Accent edge wipes in slightly ahead of the text.
  ctx.fillStyle = o.color || ACCENT;
  roundRect(ctx, x, y, W * 0.011, barH, W * 0.006);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const textX = x + padX;

  if (role) {
    ctx.font = `700 ${nameSize}px ${family}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(name, textX, y + barH * 0.34);
    ctx.font = `500 ${roleSize}px ${family}`;
    ctx.fillStyle = 'rgba(255,255,255,0.68)';
    ctx.fillText(role, textX, y + barH * 0.7);
  } else {
    ctx.font = `700 ${nameSize}px ${family}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(name, textX, y + barH / 2);
  }

  ctx.restore();
}

function drawStatCounter(
  ctx: CanvasRenderingContext2D,
  o: MotionOverlay,
  t: number,
  W: number,
  H: number
) {
  const dur = Math.max(0.4, o.end - o.start);
  const local = t - o.start;
  const target = o.value ?? 10000;

  const countP = easeOutCubic(clamp01(local / (dur * 0.7)));
  const shown = Math.round(target * countP);
  const fade = Math.min(clamp01(local / 0.2), clamp01((o.end - t) / 0.3));
  if (fade <= 0) return;

  // Small pop as the number lands.
  const settle = clamp01((local - dur * 0.7) / 0.25);
  const scale = 1 + 0.06 * (1 - Math.abs(settle * 2 - 1)) * (countP >= 1 ? 1 : 0);

  const family = 'Inter, sans-serif';
  const text = shown.toLocaleString('en-US');
  const size = fitFontSize(ctx, text, W * 0.78, 900, family, W * 0.19);

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.translate(W / 2, H * 0.42);
  ctx.scale(scale, scale);

  ctx.font = `900 ${size}px ${family}`;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = size * 0.12;
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = o.color || '#3ECF8E';
  ctx.fillText(text, 0, 0);

  if (o.text) {
    const labelSize = size * 0.24;
    ctx.font = `600 ${labelSize}px ${family}`;
    ctx.lineWidth = labelSize * 0.18;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(o.text.toUpperCase(), 0, size * 0.72);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(o.text.toUpperCase(), 0, size * 0.72);
  }

  ctx.restore();
}

function drawProgressRing(
  ctx: CanvasRenderingContext2D,
  o: MotionOverlay,
  t: number,
  W: number,
  H: number
) {
  const span = Math.max(0.001, o.end - o.start);
  const p = clamp01((t - o.start) / span);

  const r = W * 0.062;
  const cx = W - r - W * 0.07;
  const cy = r + H * 0.045;
  const lw = r * 0.26;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = W * 0.02;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.26)';
  ctx.lineWidth = lw;
  ctx.stroke();

  ctx.shadowColor = 'transparent';
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
  ctx.strokeStyle = o.color || '#FFFFFF';
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.restore();
}

function drawCommentCard(
  ctx: CanvasRenderingContext2D,
  o: MotionOverlay,
  t: number,
  W: number,
  H: number
) {
  const local = t - o.start;
  const dur = Math.max(0.5, o.end - o.start);
  // Pops in, holds, then eases out on the tail.
  const inP = easeOutBack(clamp01(local / 0.42));
  const fade = Math.min(inP, clamp01((o.end - t) / 0.3));
  if (fade <= 0) return;

  const family = 'Inter, sans-serif';
  const comment = (o.text || 'This is insane 😍').trim();
  const handle = (o.subtext || '@viewer').trim();
  const cardW = W * 0.74;
  const cardH = H * 0.14;
  const cardX = (W - cardW) / 2;
  const cardY = H * 0.64;
  const padX = W * 0.045;
  const avatarR = cardH * 0.28;
  const avatarX = cardX + padX + avatarR;
  const avatarY = cardY + cardH * 0.38;

  ctx.save();
  ctx.globalAlpha = fade;

  // Card
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = W * 0.03;
  ctx.shadowOffsetY = H * 0.004;
  ctx.fillStyle = 'rgba(14,14,18,0.9)';
  ctx.translate(W / 2, cardY + cardH / 2);
  ctx.scale(inP, inP);
  ctx.translate(-W / 2, -(cardY + cardH / 2));
  roundRect(ctx, cardX, cardY, cardW, cardH, W * 0.02);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Accent edge on the left of the card.
  ctx.fillStyle = o.color || ACCENT;
  roundRect(ctx, cardX, cardY, W * 0.012, cardH, W * 0.006);
  ctx.fill();

  // Avatar: circle with the handle's initial.
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
  ctx.fillStyle = o.color || ACCENT;
  ctx.fill();
  ctx.font = `700 ${avatarR * 1.1}px ${family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText((handle.replace('@', '')[0] || 'V').toUpperCase(), avatarX, avatarY + avatarR * 0.05);

  // Handle + comment, wrapped to two lines.
  const textX = avatarX + avatarR + padX * 0.9;
  const maxW = cardX + cardW - padX - textX;
  const handleSize = W * 0.028;
  const bodySize = W * 0.032;

  ctx.textAlign = 'left';
  ctx.font = `600 ${handleSize}px ${family}`;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(handle, textX, avatarY - avatarR * 0.55);

  // Greedy wrap so a long comment never overflows the card.
  ctx.font = `500 ${bodySize}px ${family}`;
  const words = comment.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const probe = cur ? cur + ' ' + w : w;
    if (ctx.measureText(probe).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = probe;
    }
    if (lines.length === 2) break;
  }
  if (cur && lines.length < 2) lines.push(cur);
  if (lines.length === 0) lines.push(comment);

  lines.forEach((line, i) => {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(line, textX, avatarY + i * bodySize * 1.25 + bodySize * 0.35);
  });

  ctx.restore();
}

function drawArrowCallout(
  ctx: CanvasRenderingContext2D,
  o: MotionOverlay,
  t: number,
  W: number,
  H: number
) {
  const local = t - o.start;
  const fade = Math.min(clamp01(local / 0.15), clamp01((o.end - t) / 0.3));
  if (fade <= 0) return;

  // Hand-drawn sweep from the top-right corner down toward the subject.
  const P0 = { x: W * 0.84, y: H * 0.18 };
  const P1 = { x: W * 0.66, y: H * 0.42 };
  const P2 = { x: W * 0.46, y: H * 0.54 };

  const drawP = easeOutCubic(clamp01(local / 0.55));
  const stroke = (o.color || ACCENT);
  const lw = Math.max(6, W * 0.016);

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = W * 0.012;

  // Progressive draw-on: stroke the quadratic curve up to `drawP`.
  const SEGS = 26;
  ctx.beginPath();
  let prev: { x: number; y: number } | null = null;
  for (let i = 0; i <= SEGS; i++) {
    const q = i / SEGS;
    if (q > drawP) break;
    const u = 1 - q;
    const x = u * u * P0.x + 2 * u * q * P1.x + q * q * P2.x;
    const y = u * u * P0.y + 2 * u * q * P1.y + q * q * P2.y;
    if (!prev) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    prev = { x, y };
  }
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Arrowhead once the sweep reaches the tip.
  if (drawP >= 1) {
    const dir = {
      x: P2.x - P1.x,
      y: P2.y - P1.y
    };
    const len = Math.hypot(dir.x, dir.y) || 1;
    const ux = dir.x / len;
    const uy = dir.y / len;
    const wing = Math.max(10, W * 0.035);
    const a = Math.PI / 6;

    ctx.beginPath();
    ctx.moveTo(P2.x, P2.y);
    ctx.lineTo(P2.x - wing * Math.cos(a) * ux - wing * Math.sin(a) * uy, P2.y - wing * Math.cos(a) * uy + wing * Math.sin(a) * ux);
    ctx.moveTo(P2.x, P2.y);
    ctx.lineTo(P2.x - wing * Math.cos(a) * ux + wing * Math.sin(a) * uy, P2.y - wing * Math.cos(a) * uy - wing * Math.sin(a) * ux);
    ctx.stroke();
  }

  // Label pill near the tail, fades in once the arrow has drawn most of the way.
  const label = (o.text || 'Look here').trim();
  const labelP = clamp01((drawP - 0.7) / 0.3);
  if (labelP > 0) {
    ctx.globalAlpha = fade * labelP;
    ctx.font = `600 ${W * 0.03}px Inter, sans-serif`;
    const tw = ctx.measureText(label).width;
    const pad = W * 0.02;
    const bw = tw + pad * 2;
    const bh = W * 0.052;
    const bx = P0.x - bw - W * 0.03;
    const by = P0.y - bh / 2;

    ctx.fillStyle = 'rgba(14,14,18,0.88)';
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + bw / 2, by + bh / 2 + 1);
  }

  ctx.restore();
}

function drawEmojiBurst(
  ctx: CanvasRenderingContext2D,
  o: MotionOverlay,
  t: number,
  W: number,
  H: number
) {
  const local = t - o.start;
  const fade = Math.min(clamp01(local / 0.15), clamp01((o.end - t) / 0.25));
  if (fade <= 0) return;

  const emoji = (o.text || '🔥').trim();
  const cx = W * 0.68;
  const cy = H * 0.3;
  const size = W * 0.17;

  // Pop in with a slight overshoot, then a gentle settle bounce.
  const pop = easeOutBack(clamp01(local / 0.35));
  const bounce = 1 + 0.06 * Math.sin((local - 0.35) / 0.18) * (local > 0.35 && local < 0.8 ? 1 : 0);
  const scale = pop * bounce;

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // Soft ring pulses outward behind the emoji.
  const ringP = clamp01(local / 0.7);
  ctx.beginPath();
  ctx.arc(0, 0, size * (0.55 + ringP * 0.9), 0, Math.PI * 2);
  ctx.strokeStyle = o.color || ACCENT;
  ctx.globalAlpha = fade * (1 - ringP) * 0.35;
  ctx.lineWidth = W * 0.012;
  ctx.stroke();
  ctx.globalAlpha = fade;

  ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 0, size * 0.06);
  ctx.restore();
}

/** Composites every active overlay for the given timeline position. */
export function drawMotionOverlays(
  ctx: CanvasRenderingContext2D,
  overlays: MotionOverlay[],
  timelineTime: number,
  W: number,
  H: number
) {
  if (!overlays?.length) return;

  for (const o of overlays) {
    if (timelineTime < o.start || timelineTime > o.end) continue;

    ctx.save();
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    switch (o.kind) {
      case 'kinetic-title':
        drawKineticTitle(ctx, o, timelineTime, W, H);
        break;
      case 'lower-third':
        drawLowerThird(ctx, o, timelineTime, W, H);
        break;
      case 'stat-counter':
        drawStatCounter(ctx, o, timelineTime, W, H);
        break;
      case 'progress-ring':
        drawProgressRing(ctx, o, timelineTime, W, H);
        break;
      case 'comment-card':
        drawCommentCard(ctx, o, timelineTime, W, H);
        break;
      case 'arrow-callout':
        drawArrowCallout(ctx, o, timelineTime, W, H);
        break;
      case 'emoji-burst':
        drawEmojiBurst(ctx, o, timelineTime, W, H);
        break;
    }

    ctx.restore();
  }
}

/* -------------------------------------------------------------- defaults -- */
/** First number mentioned in the transcript, for the counter. */
const firstNumberIn = (words: string[]): number | null => {
  for (const w of words) {
    const cleaned = w.replace(/[^0-9.]/g, '');
    if (!cleaned) continue;
    const n = Number(cleaned);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return null;
};

export interface MotionContext {
  words: string[];
  duration: number;
  shortTitle?: string;
}

/** Sensible content for a preset, derived from the project where possible. */
export function motionDefaults(kind: MotionKind, ctx: MotionContext): Omit<MotionOverlay, 'id'> {
  const dur = Math.max(1, ctx.duration || 15);

  switch (kind) {
    case 'kinetic-title': {
      const fromTranscript = ctx.words.slice(0, 3).join(' ').trim();
      return {
        kind,
        start: 0,
        end: Math.min(2.6, dur),
        text: ctx.shortTitle || fromTranscript || 'YOUR HOOK HERE'
      };
    }
    case 'lower-third':
      return {
        kind,
        start: Math.min(1.2, dur * 0.1),
        end: Math.min(1.2 + 4, dur),
        text: 'Speaker Name',
        subtext: 'Founder & CEO'
      };
    case 'stat-counter': {
      const n = firstNumberIn(ctx.words);
      return {
        kind,
        start: Math.min(1, dur * 0.08),
        end: Math.min(1 + 3, dur),
        value: n ?? 10000
      };
    }
    case 'progress-ring':
      return { kind, start: 0, end: dur };
    case 'comment-card': {
      const fromTranscript = ctx.words.slice(0, 8).join(' ').trim();
      return {
        kind,
        start: Math.min(0.6, dur * 0.06),
        end: Math.min(0.6 + 3.2, dur),
        text: fromTranscript ? `"${fromTranscript}…"` : 'This is insane 😍',
        subtext: '@creator'
      };
    }
    case 'arrow-callout': {
      const fromTranscript = ctx.words.slice(0, 3).join(' ').trim();
      return {
        kind,
        start: Math.min(1, dur * 0.1),
        end: Math.min(1 + 2.6, dur),
        text: fromTranscript ? `“${fromTranscript}”` : 'Look here'
      };
    }
    case 'emoji-burst':
      return {
        kind,
        start: Math.min(0.4, dur * 0.04),
        end: Math.min(0.4 + 1.3, dur),
        text: '🔥'
      };
  }
}
