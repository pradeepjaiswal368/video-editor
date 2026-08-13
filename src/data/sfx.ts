/* Sound effects, synthesised with WebAudio.
   Rendering them procedurally avoids shipping (and licensing) audio assets,
   and the resulting AudioBuffers can be scheduled into either the preview
   context or the recording context used by the exporter. */

export type SfxKind = 'whoosh' | 'impact' | 'riser';

export interface SfxCue {
  id: string;
  kind: SfxKind;
  /** Timeline seconds at which the effect starts. */
  at: number;
  gain?: number;
}

export const SFX_KINDS: SfxKind[] = ['whoosh', 'impact', 'riser'];

export const isSfxKind = (v: unknown): v is SfxKind =>
  typeof v === 'string' && (SFX_KINDS as string[]).includes(v);

export const SFX_DURATION: Record<SfxKind, number> = {
  whoosh: 0.7,
  impact: 0.9,
  riser: 1.6
};

const RATE = 48000;

/** Fills a buffer with white noise. */
function noiseBuffer(ctx: OfflineAudioContext, seconds: number) {
  const buf = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const data = buf.getChannelData(0);
  // Deterministic LCG so a given effect always renders identically.
  let seed = 22222;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 0xffffffff) * 2 - 1;
  }
  return buf;
}

function renderWhoosh(ctx: OfflineAudioContext, dur: number) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, dur);

  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 1.1;
  band.frequency.setValueAtTime(320, 0);
  band.frequency.exponentialRampToValueAtTime(4200, dur * 0.55);
  band.frequency.exponentialRampToValueAtTime(420, dur);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, 0);
  gain.gain.exponentialRampToValueAtTime(0.55, dur * 0.45);
  gain.gain.exponentialRampToValueAtTime(0.0001, dur);

  src.connect(band).connect(gain).connect(ctx.destination);
  src.start(0);
}

function renderImpact(ctx: OfflineAudioContext, dur: number) {
  // Low body: pitch-dropping sine.
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, 0);
  osc.frequency.exponentialRampToValueAtTime(38, dur * 0.5);

  // Body and click overlap at t=0, so both are scaled to keep the sum
  // comfortably under full scale rather than clipping.
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.62, 0);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, dur * 0.85);

  osc.connect(bodyGain).connect(ctx.destination);
  osc.start(0);
  osc.stop(dur);

  // Transient click so it cuts through dialogue.
  const click = ctx.createBufferSource();
  click.buffer = noiseBuffer(ctx, 0.06);
  const clickFilter = ctx.createBiquadFilter();
  clickFilter.type = 'lowpass';
  clickFilter.frequency.value = 2600;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.3, 0);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, 0.06);

  click.connect(clickFilter).connect(clickGain).connect(ctx.destination);
  click.start(0);
}

function renderRiser(ctx: OfflineAudioContext, dur: number) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, dur);

  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 3.2;
  band.frequency.setValueAtTime(240, 0);
  band.frequency.exponentialRampToValueAtTime(6500, dur * 0.94);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, 0);
  gain.gain.exponentialRampToValueAtTime(0.5, dur * 0.9);
  gain.gain.exponentialRampToValueAtTime(0.0001, dur); // clean cut at the top

  src.connect(band).connect(gain).connect(ctx.destination);
  src.start(0);

  // Rising tone underneath for tension.
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(110, 0);
  osc.frequency.exponentialRampToValueAtTime(880, dur * 0.94);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.0001, 0);
  oscGain.gain.exponentialRampToValueAtTime(0.14, dur * 0.9);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, dur);

  osc.connect(oscGain).connect(ctx.destination);
  osc.start(0);
  osc.stop(dur);
}

const cache = new Map<SfxKind, AudioBuffer>();

/** Renders (and memoises) one effect. */
export async function renderSfx(kind: SfxKind): Promise<AudioBuffer> {
  const hit = cache.get(kind);
  if (hit) return hit;

  const dur = SFX_DURATION[kind];
  const ctx = new OfflineAudioContext(1, Math.ceil(dur * RATE), RATE);

  if (kind === 'whoosh') renderWhoosh(ctx, dur);
  else if (kind === 'impact') renderImpact(ctx, dur);
  else renderRiser(ctx, dur);

  const buffer = await ctx.startRendering();
  cache.set(kind, buffer);
  return buffer;
}

export async function renderAllSfx(): Promise<Record<SfxKind, AudioBuffer>> {
  const entries = await Promise.all(SFX_KINDS.map(async (k) => [k, await renderSfx(k)] as const));
  return Object.fromEntries(entries) as Record<SfxKind, AudioBuffer>;
}

/**
 * Schedules cues into any AudioContext, relative to a timeline origin.
 * Used by both the preview player and the exporter.
 */
export function scheduleCues(
  ctx: BaseAudioContext,
  destination: AudioNode,
  cues: SfxCue[],
  buffers: Partial<Record<SfxKind, AudioBuffer>>,
  timelineOrigin: number,
  contextOrigin: number
): AudioBufferSourceNode[] {
  const started: AudioBufferSourceNode[] = [];

  for (const cue of cues) {
    const buffer = buffers[cue.kind];
    if (!buffer) continue;

    const when = contextOrigin + (cue.at - timelineOrigin);
    if (when < contextOrigin - 0.05) continue; // already passed

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = cue.gain ?? 0.85;
    src.connect(gain).connect(destination);
    src.start(Math.max(when, contextOrigin));
    started.push(src);
  }

  return started;
}
