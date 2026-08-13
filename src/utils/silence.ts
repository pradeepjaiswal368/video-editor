/* Silence detection over decoded PCM.
   The analysis half is pure so it can be exercised without a real media file. */

export interface Region {
  start: number;
  end: number;
}

export interface SilenceOptions {
  /** Analysis window, seconds. */
  windowSec?: number;
  /** Ignore silences shorter than this. */
  minDurationSec?: number;
  /** Shrink each detected silence by this much at both ends so speech
      onsets and tails are never clipped. */
  paddingSec?: number;
  /** Level below the loudest window that still counts as silence. */
  rangeDb?: number;
  /** Absolute floor — nothing above this is ever treated as silence. */
  floorDb?: number;
}

const DEFAULTS: Required<SilenceOptions> = {
  windowSec: 0.02,
  minDurationSec: 0.35,
  paddingSec: 0.06,
  rangeDb: 32,
  floorDb: -50
};

/** Windowed RMS in dBFS. */
export function windowLevelsDb(
  samples: Float32Array,
  sampleRate: number,
  windowSec: number
): Float32Array {
  const win = Math.max(1, Math.round(sampleRate * windowSec));
  const count = Math.max(1, Math.ceil(samples.length / win));
  const out = new Float32Array(count);

  for (let w = 0; w < count; w++) {
    const from = w * win;
    const to = Math.min(samples.length, from + win);
    let sum = 0;
    for (let i = from; i < to; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / Math.max(1, to - from));
    out[w] = 20 * Math.log10(rms + 1e-9);
  }
  return out;
}

/**
 * Finds silent regions. The threshold adapts to the loudest part of the
 * material, so a quietly-recorded video isn't reported as entirely silent.
 */
export function findSilences(
  samples: Float32Array,
  sampleRate: number,
  options: SilenceOptions = {}
): { silences: Region[]; thresholdDb: number } {
  const o = { ...DEFAULTS, ...options };
  const levels = windowLevelsDb(samples, sampleRate, o.windowSec);

  let peak = -Infinity;
  for (const l of levels) if (l > peak) peak = l;

  const thresholdDb = Math.max(o.floorDb, peak - o.rangeDb);
  const silences: Region[] = [];

  let runStart = -1;
  for (let i = 0; i <= levels.length; i++) {
    const quiet = i < levels.length && levels[i] <= thresholdDb;

    if (quiet && runStart === -1) runStart = i;

    if (!quiet && runStart !== -1) {
      const start = runStart * o.windowSec;
      const end = i * o.windowSec;
      if (end - start >= o.minDurationSec) {
        const padded = { start: start + o.paddingSec, end: end - o.paddingSec };
        if (padded.end > padded.start) silences.push(padded);
      }
      runStart = -1;
    }
  }

  return { silences, thresholdDb };
}

/** Everything in [from, to] that is not covered by `regions`. */
export function invertRegions(regions: Region[], from: number, to: number): Region[] {
  const sorted = [...regions].sort((a, b) => a.start - b.start);
  const out: Region[] = [];
  let cursor = from;

  for (const r of sorted) {
    const s = Math.max(from, r.start);
    const e = Math.min(to, r.end);
    if (e <= cursor) continue;
    if (s > cursor) out.push({ start: cursor, end: s });
    cursor = Math.max(cursor, e);
  }

  if (cursor < to) out.push({ start: cursor, end: to });
  return out;
}

/** Silence at the very start and end of a range, if any. */
export function edgeSilence(
  silences: Region[],
  from: number,
  to: number,
  tolerance = 0.12
): { head: number; tail: number } {
  let head = from;
  let tail = to;

  for (const r of silences) {
    if (r.start <= from + tolerance && r.end > head) head = Math.min(r.end, to);
    if (r.end >= to - tolerance && r.start < tail) tail = Math.max(r.start, from);
  }

  return { head, tail: Math.max(tail, head) };
}

/** Decodes any media blob to mono PCM at a low rate — enough for level analysis. */
export async function decodeToMono(blob: Blob, targetRate = 16000): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  const ctx = new Ctor();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer);
  } finally {
    void ctx.close();
  }

  const offline = new OfflineAudioContext(
    1,
    Math.max(1, Math.floor(decoded.duration * targetRate)),
    targetRate
  );
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  return offline.startRendering();
}
