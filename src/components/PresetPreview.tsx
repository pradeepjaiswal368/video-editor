import React from 'react';
import { PresetPreview as PreviewSpec } from '../data/skills';

/* A 9:16 thumbnail drawn entirely in CSS + inline SVG, so the skills palette
   ships no image assets. Each `kind` paints a different schematic over a fake
   video frame. */

const Subject: React.FC<{ tint?: string }> = ({ tint }) => (
  <span className="pv-subject" style={{ background: tint || 'rgba(15,18,24,0.5)' }} />
);

const Motif: React.FC<{ spec: PreviewSpec }> = ({ spec }) => {
  const { kind, motif } = spec;

  if (kind === 'camera') {
    const x = motif === 'left' ? '8%' : motif === 'right' ? '42%' : '25%';
    return (
      <>
        <span className={`pv-crop ${motif === 'drift' ? 'is-drifting' : ''}`} style={{ left: x }} />
        {motif === 'drift' && <span className="pv-crop-trail" />}
      </>
    );
  }

  if (kind === 'broll') {
    if (motif === 'pip') return <span className="pv-pip" />;
    if (motif === 'split') return <span className="pv-splitline" />;
    return <span className="pv-fullbleed" />;
  }

  if (kind === 'overlay') {
    if (motif === 'card') return <span className="pv-card" />;
    if (motif === 'emoji') return <span className="pv-emoji">🔥</span>;
    return (
      <svg className="pv-arrow" viewBox="0 0 60 60" fill="none" aria-hidden>
        <path
          d="M6 52C18 38 26 20 44 12"
          stroke="#FFD34D"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path d="M32 10h14v14" stroke="#FFD34D" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (kind === 'cut') {
    return (
      <span className="pv-strip">
        <i style={{ flexGrow: 3 }} />
        <i className="is-gap" style={{ flexGrow: 1 }} />
        <i style={{ flexGrow: 4 }} />
        <i className="is-gap" style={{ flexGrow: 1 }} />
        <i style={{ flexGrow: 2 }} />
      </span>
    );
  }

  if (kind === 'audio' && motif === 'clear') return <span className="pv-clear">⊘</span>;

  if (kind === 'audio') {
    // Deterministic, and shaped by what the preset actually does — a riser
    // ramps up, an impact spikes, a bed stays flat.
    const N = 18;
    const seed = (motif ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const envelope = (i: number) => {
      const t = i / (N - 1);
      switch (motif) {
        case 'riser':
          return 0.15 + t * 0.85;
        case 'impact':
          return 0.18 + Math.exp(-Math.pow((t - 0.3) * 4.5, 2)) * 0.82;
        case 'whoosh':
          return 0.2 + Math.sin(Math.PI * t) * 0.7;
        case 'drive':
          return i % 4 === 0 ? 0.95 : 0.4;
        case 'ambient':
          return 0.32;
        default:
          return 0.62;
      }
    };
    const bars = Array.from({ length: N }, (_, i) => {
      const jitter = 0.72 + Math.abs(Math.sin(i * 1.7 + seed)) * 0.28;
      return Math.round(Math.max(8, Math.min(100, envelope(i) * jitter * 100)));
    });
    return (
      <span className="pv-wave">
        {bars.map((h, i) => (
          <i key={i} style={{ height: `${h}%` }} />
        ))}
      </span>
    );
  }

  if (motif === 'clear' && kind === 'caption') return <span className="pv-clear">⊘</span>;

  if (kind === 'motion') {
    if (motif === 'clear') return <span className="pv-clear">⊘</span>;
    if (motif === 'ring') return <span className="pv-ring" />;
    if (motif === 'lower-third') return <span className="pv-lower3" />;
    if (motif === 'counter') return null; // the caption block carries it
    return <span className="pv-stack" />;
  }

  if (kind === 'restyle') {
    if (motif === 'none') return null; // untouched footage is the point
    return <span className={`pv-grade pv-grade-${motif}`} />;
  }

  return null;
};

export const PresetPreview: React.FC<{ spec: PreviewSpec }> = ({ spec }) => {
  const c = spec.caption;

  return (
    <div className="preset-thumb" style={{ background: spec.backdrop }}>
      {spec.subject && <Subject tint={spec.subject} />}
      <Motif spec={spec} />

      {c && (
        <div
          className={`pv-caption ${c.align === 'left' ? 'is-left' : ''} ${c.boxed ? 'is-boxed' : ''}`}
          style={{ top: `${c.y ?? 68}%` }}
        >
          {c.lead && (
            <span className="pv-lead" style={{ fontFamily: c.font }}>
              {c.lead}
            </span>
          )}
          <span
            className="pv-main"
            style={{
              fontFamily: c.font,
              color: c.accentColor || c.color || '#fff',
              fontStyle: c.italic ? 'italic' : undefined,
              textTransform: c.uppercase ? 'uppercase' : 'none'
            }}
          >
            {c.main}
          </span>
        </div>
      )}
    </div>
  );
};
