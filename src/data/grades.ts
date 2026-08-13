/* Colour grades for Scene Restyle.
   A grade is a look applied to the *video frame only* — it must never touch
   caption styling. Clips store the grade id; this module owns how it paints. */

export interface GradeOverlay {
  color: string;
  alpha: number;
  blend: GlobalCompositeOperation;
}

export interface ColorGrade {
  id: string;
  name: string;
  /** Canvas 2D filter applied while drawing the video frame. */
  filter: string;
  /** Tint passes composited over the frame, in order. */
  overlays?: GradeOverlay[];
  /** Lifted blacks: matte alpha painted with `lighter`. */
  lift?: number;
}

export const GRADE_NONE = 'none';

export const GRADES: Record<string, ColorGrade> = {
  [GRADE_NONE]: {
    id: GRADE_NONE,
    name: 'Original',
    filter: 'none'
  },
  'cozy-craft': {
    id: 'cozy-craft',
    name: 'Cozy Craft',
    filter: 'saturate(1.06) contrast(0.9) brightness(1.05) sepia(0.2)',
    overlays: [{ color: '#ff9b4d', alpha: 0.14, blend: 'soft-light' }],
    lift: 0.07
  },
  'teal-orange': {
    id: 'teal-orange',
    name: 'Teal & Orange',
    filter: 'saturate(1.28) contrast(1.1)',
    overlays: [
      { color: '#00b4c8', alpha: 0.2, blend: 'soft-light' },
      { color: '#ff8a3d', alpha: 0.12, blend: 'overlay' }
    ]
  },
  'bleach-print': {
    id: 'bleach-print',
    name: 'Bleach Print',
    filter: 'grayscale(0.68) contrast(1.38) brightness(1.06)',
    overlays: [{ color: '#c8d2dc', alpha: 0.08, blend: 'soft-light' }]
  },
  'night-neon': {
    id: 'night-neon',
    name: 'Night Neon',
    filter: 'saturate(1.24) contrast(1.14) brightness(0.86)',
    overlays: [
      { color: '#2a1e6e', alpha: 0.3, blend: 'soft-light' },
      { color: '#ff3dda', alpha: 0.1, blend: 'overlay' }
    ],
    lift: 0.05
  }
};

export const isGradeId = (v: unknown): v is string =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(GRADES, v);

/** Paints a grade over the frame already drawn into `ctx`. */
export function paintGradeOverlays(
  ctx: CanvasRenderingContext2D,
  grade: ColorGrade,
  width: number,
  height: number
) {
  if (grade.lift) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(60, 56, 72, ${grade.lift})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  for (const o of grade.overlays ?? []) {
    ctx.save();
    ctx.globalCompositeOperation = o.blend;
    ctx.globalAlpha = o.alpha;
    ctx.fillStyle = o.color;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}
