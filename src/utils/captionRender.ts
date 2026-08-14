import { CaptionStyle, TranscriptionWord } from '../types/video';

/* Shared caption rendering. Both the video player's draw loop and the style
   builder's live preview call this, so a preview is always pixel-identical to
   what gets burned into the export. */

/**
 * Draws one caption phrase (a small window of words) at the style's position.
 * The active word — the one whose [start, end] window contains `curTime` — is
 * drawn in its accent color and scaled per `activeWordScale`.
 */
export function renderCaptionPhrase(
  ctx: CanvasRenderingContext2D,
  windowWords: TranscriptionWord[],
  style: CaptionStyle,
  curTime: number,
  W: number,
  H: number,
  emojiFor?: (word: string) => string
): void {
  if (!windowWords.length) return;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const fontName = style.fontFamily || 'Montserrat, Impact, sans-serif';
  const rawFontSize = style.fontSize || 60; // px on 1080 canvas
  const strokeColor = style.strokeColor || '#000000';
  const strokeWidth = style.strokeWidth || 8;

  const yPos = (style.positionY / 100) * H;

  /* Canvas only accepts numeric or standard CSS weights here — the keyword
     `black` is invalid, and an invalid font string makes the browser silently
     keep the previous font. That is why active-word scaling never took effect. */
  const scale = style.animatePop === false ? 1 : style.activeWordScale || 1.25;

  const fontFor = (active: boolean) =>
    active ? `900 ${rawFontSize * scale}px ${fontName}` : `700 ${rawFontSize}px ${fontName}`;

  // Pass 1 — measure every word with the font it will actually be drawn in,
  // so a scaled-up active word can't throw the centring off.
  const gap = rawFontSize * 0.3;
  const items = windowWords.map((w) => {
    const active = curTime >= w.start && curTime <= w.end;
    const text = style.uppercase ? w.word.toUpperCase() : w.word;
    ctx.font = fontFor(active);
    return { text, active, word: w.word, width: ctx.measureText(text).width };
  });

  const totalWidth = items.reduce((sum, it) => sum + it.width, 0) + gap * Math.max(0, items.length - 1);

  // Background bar (subtitle-block styles) sits behind the whole phrase.
  if (style.boxed) {
    const padX = rawFontSize * 0.55;
    const padY = rawFontSize * 0.3;
    const boxH = rawFontSize * (style.animatePop === false ? 1 : scale) + padY * 2;
    const boxW = totalWidth + padX * 2;
    const boxX = (W - boxW) / 2;
    const boxY = yPos - boxH / 2;
    const r = rawFontSize * 0.16;

    ctx.save();
    ctx.fillStyle = style.boxColor || 'rgba(0,0,0,0.62)';
    ctx.beginPath();
    ctx.moveTo(boxX + r, boxY);
    ctx.arcTo(boxX + boxW, boxY, boxX + boxW, boxY + boxH, r);
    ctx.arcTo(boxX + boxW, boxY + boxH, boxX, boxY + boxH, r);
    ctx.arcTo(boxX, boxY + boxH, boxX, boxY, r);
    ctx.arcTo(boxX, boxY, boxX + boxW, boxY, r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Pass 2 — draw.
  let cursorX = (W - totalWidth) / 2;

  items.forEach((it) => {
    ctx.save();
    ctx.font = fontFor(it.active);
    ctx.fillStyle = it.active ? style.activeWordColor || '#FFE600' : style.primaryColor || '#FFFFFF';

    const centerX = cursorX + it.width / 2;

    if (strokeWidth > 0) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeText(it.text, centerX, yPos);
    }
    ctx.fillText(it.text, centerX, yPos);
    ctx.restore();

    // Emoji sits above the phrase in its own font, drawn outside the word's
    // font state so it cannot leak into the next word.
    if (it.active && style.addEmojis && emojiFor) {
      const emoji = emojiFor(it.word);
      if (emoji) {
        ctx.save();
        ctx.font = `${rawFontSize * 1.5}px Arial`;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(emoji, W / 2, yPos - rawFontSize * 2);
        ctx.restore();
      }
    }

    cursorX += it.width + gap;
  });
}
