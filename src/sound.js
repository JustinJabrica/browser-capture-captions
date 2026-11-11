// What the sound itself is like, on plain arrays: loudness as broadcasters
// measure it (ITU-R BS.1770), the noise floor and the loud level, how high
// in frequency the sound reaches, the stretches of sound between pauses,
// and how a take's channels relate to each other (several microphones, or
// one delivered twice). No DOM, so the unit tests use it too.

import { align, envelope, waveMatch } from "./metrics.js";

// --- Loudness (ITU-R BS.1770) -------------------------------------------------------

// BS.1770's two K-weighting filters, as published for 48 kHz: a high shelf
// for the head's effect, then a high-pass (Tables 1 and 2).
const K48 = [
  { b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [-1.69065929318241, 0.73248077421585] },
  { b: [1.0, -2.0, 1.0], a: [-1.99004745483398, 0.99007225036621] },
];

// A biquad's analogue prototype from its 48 kHz coefficients: the bilinear
// transform's K (tan of the corner frequency), Q, and for the shelf its two
// gains. Undoing the transform at 48 kHz and redoing it at another rate gives
// "the same frequency response that the specified filter provides at 48 kHz",
// as BS.1770 asks of other rates.
function prototype({ b, a }) {
  const [a1, a2] = a;
  const k2 = (1 + a1 + a2) / (1 - a1 + a2);
  const a0 = 4 / (1 - a1 + a2);
  const kq = a0 - 1 - k2; // K / Q
  const f0 = (Math.atan(Math.sqrt(k2)) * 48000) / Math.PI;
  const vh = k2 - (b[1] * a0) / 2;
  const vb = ((b[0] - b[2]) * a0) / (2 * kq);
  return { f0, q: Math.sqrt(k2) / kq, vh, vb };
}
const PROTOTYPES = K48.map(prototype);

// The two K-weighting biquads at sampleRate: [{ b: [b0, b1, b2], a: [a1, a2] }, ...].
export function kWeighting(sampleRate) {
  return PROTOTYPES.map(({ f0, q, vh, vb }, stage) => {
    const k = Math.tan((Math.PI * f0) / sampleRate);
    const a0 = 1 + k / q + k * k;
    const a = [(2 * (k * k - 1)) / a0, (1 - k / q + k * k) / a0];
    // The high-pass keeps BS.1770's plain [1, -2, 1] at every rate.
    const b = stage === 0 ? [(vh + (vb * k) / q + k * k) / a0, (2 * (k * k - vh)) / a0, (vh - (vb * k) / q + k * k) / a0] : [1, -2, 1];
    return { b, a };
  });
}

// BS.1770's loudness of a take, every channel weighted 1 (as it weights the
// left, right and centre channels): integrated over the take with its two
// gates (blocks of 400 ms every 100 ms, quieter than -70 LUFS left out, then
// those 10 LU below the rest), and the loudest single block (momentary
// loudness, as EBU R 128 calls it). -Infinity when every block is gated out.
export function loudness(channels, sampleRate) {
  const length = channels[0]?.length ?? 0;
  const step = Math.round(sampleRate / 10);
  const steps = Math.floor(length / step);
  const power = new Float64Array(steps); // K-weighted energy in each 100 ms, summed over the channels
  const filters = kWeighting(sampleRate);
  for (const channel of channels) {
    // Two biquads in series, direct form I: x the input, y the shelf's output, z the high-pass's.
    let [x1, x2, y1, y2, z1, z2] = [0, 0, 0, 0, 0, 0];
    const [{ b: p, a: q }, { b: r, a: s }] = filters;
    for (let i = 0; i < steps * step; i++) {
      const x = channel[i];
      const y = p[0] * x + p[1] * x1 + p[2] * x2 - q[0] * y1 - q[1] * y2;
      x2 = x1;
      x1 = x;
      const z = r[0] * y + r[1] * y1 + r[2] * y2 - s[0] * z1 - s[1] * z2;
      y2 = y1;
      y1 = y;
      z2 = z1;
      z1 = z;
      power[Math.floor(i / step)] += z * z;
    }
  }
  const blocks = [];
  for (let j = 0; j + 4 <= steps; j++) blocks.push((power[j] + power[j + 1] + power[j + 2] + power[j + 3]) / (4 * step));
  const lufs = (z) => (z > 0 ? -0.691 + 10 * Math.log10(z) : -Infinity);
  const gated = (list, gate) => list.filter((z) => lufs(z) > gate);
  const mean = (list) => list.reduce((sum, z) => sum + z, 0) / list.length;
  // A loop, not Math.max(...): an hour holds 36,000 blocks, too many arguments for some engines.
  const maxMomentary = lufs(blocks.reduce((max, z) => (z > max ? z : max), 0));
  const loud = gated(blocks, -70);
  if (!loud.length) return { integrated: -Infinity, maxMomentary, blocks: blocks.length };
  const relative = lufs(mean(loud)) - 10;
  return { integrated: lufs(mean(gated(loud, relative))), maxMomentary, blocks: blocks.length };
}

// --- Levels over time -----------------------------------------------------------------

// The quiet and the loud level, in dBFS, from the RMS of windowMs windows:
// the 10th percentile (the noise floor, between words and in pauses) and
// the 95th (speech at its usual loudest). How far apart they are is how far
// the sound stands out from the noise. -Infinity is digital silence.
export function levelSpread(samples, sampleRate, { windowMs = 20 } = {}) {
  const env = envelope(samples, sampleRate, 1000 / windowMs);
  if (!env.length) return { floorDb: null, loudDb: null, spreadDb: null };
  const sorted = [...env].sort((x, y) => x - y);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
  const floorDb = db(at(0.1));
  const loudDb = db(at(0.95));
  return { floorDb, loudDb, spreadDb: Number.isFinite(floorDb) && Number.isFinite(loudDb) ? loudDb - floorDb : null };
}

// The stretches of sound, as [start, end] in seconds: windowMs windows
// louder than thresholdDb, with pauses shorter than minPauseMs bridged and
// sounds shorter than minSoundMs dropped. Not speech detection: any sound
// counts, but it's where a transcriber would find words.
export function soundSegments(samples, sampleRate, { thresholdDb = -50, windowMs = 10, minSoundMs = 100, minPauseMs = 300 } = {}) {
  const env = envelope(samples, sampleRate, 1000 / windowMs);
  const level = 10 ** (thresholdDb / 20);
  const raw = [];
  let from = null;
  env.forEach((x, i) => {
    if (x >= level && from == null) from = i;
    if (x < level && from != null) {
      raw.push([from, i]);
      from = null;
    }
  });
  if (from != null) raw.push([from, env.length]);
  const merged = [];
  for (const seg of raw) {
    const last = merged.at(-1);
    if (last && (seg[0] - last[1]) * windowMs < minPauseMs) last[1] = seg[1];
    else merged.push([...seg]);
  }
  return merged.filter(([s, e]) => (e - s) * windowMs >= minSoundMs).map(([s, e]) => [(s * windowMs) / 1000, (e * windowMs) / 1000]);
}

// --- Frequency ----------------------------------------------------------------------------

// In-place radix-2 FFT of re + i·im (length a power of two).
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

// The take's average power spectrum (Hann windows of `size` samples, half
// overlapping, over the first limitS seconds), smoothed over `smooth` bins.
export function spectrum(samples, sampleRate, { size = 4096, limitS = 30, smooth = 9 } = {}) {
  const n = Math.min(samples.length, Math.round(limitS * sampleRate));
  const bins = size / 2 + 1;
  const power = new Float64Array(bins);
  const hann = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  let count = 0;
  for (let start = 0; start + size <= n; start += size / 2) {
    for (let i = 0; i < size; i++) {
      re[i] = samples[start + i] * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < bins; k++) power[k] += re[k] * re[k] + im[k] * im[k];
    count++;
  }
  if (!count) return null;
  const half = smooth >> 1;
  const out = new Float64Array(bins);
  for (let k = 0; k < bins; k++) {
    let sum = 0;
    let m = 0;
    for (let j = Math.max(0, k - half); j <= Math.min(bins - 1, k + half); j++, m++) sum += power[j];
    out[k] = sum / m / count;
  }
  return { power: out, hzPerBin: sampleRate / size };
}

// How high the sound reaches: the highest frequency whose smoothed power is
// within rangeDb of the strongest frequency (above 20 Hz, so a DC offset
// doesn't count). A codec's or a resampler's low-pass shows as a lower
// figure for the file than for the tap. null for a take shorter than one
// window; 0 for digital silence.
export function bandwidth(samples, sampleRate, { rangeDb = 60, ...options } = {}) {
  const s = spectrum(samples, sampleRate, options);
  if (!s) return null;
  const from = Math.ceil(20 / s.hzPerBin);
  let max = 0;
  for (let k = from; k < s.power.length; k++) if (s.power[k] > max) max = s.power[k];
  if (!max) return 0;
  const floor = max * 10 ** (-rangeDb / 10);
  for (let k = s.power.length - 1; k >= from; k--) if (s.power[k] >= floor) return k * s.hzPerBin;
  return 0;
}

// --- Channels -----------------------------------------------------------------------------

// How a second channel relates to the first: whether it's the same signal
// (one microphone delivered as two channels), and if not, how much later
// (positive) or earlier its sound arrives and how alike the waveforms are
// there. For two microphones in one room, the lag is the extra distance the
// sound travelled (about 3 ms a metre) plus any difference in the devices'
// own delays. Uses the first limitS seconds.
export function channelPair(a, b, sampleRate, { maxLagS = 1, limitS = 30 } = {}) {
  let same = a.length === b.length;
  for (let i = 0; same && i < a.length; i++) if (a[i] !== b[i]) same = false;
  if (same) return { identical: true, lagS: 0, score: 1 };
  const coarse = align(a, sampleRate, b, sampleRate, { maxLagS, limitS });
  // align() is good to the millisecond; the waveform search covers that and a little more.
  const fine = waveMatch(a, b, sampleRate, coarse.lagS, { radius: Math.ceil(sampleRate * 0.002), limitS });
  return { identical: false, lagS: fine.lagS, score: fine.score, envelopeScore: coarse.score };
}

// Of the windowMs windows where any channel is louder than thresholdDb, the
// share in which each channel is the loudest by more than tieDb, and the
// share where the loudest two are within tieDb of each other (tied: the same
// sound in both, or a voice as loud in each). With a microphone in front of
// each speaker, a rough "who spoke how much". -> { shares: [per channel], tied }
export function loudestShares(channels, sampleRate, { thresholdDb = -50, windowMs = 20, tieDb = 1 } = {}) {
  const envs = channels.map((c) => envelope(c, sampleRate, 1000 / windowMs));
  const level = 10 ** (thresholdDb / 20);
  const tie = 10 ** (tieDb / 20);
  const wins = new Array(channels.length).fill(0);
  let tied = 0;
  let counted = 0;
  for (let i = 0; i < (envs[0]?.length ?? 0); i++) {
    let best = 0;
    for (let c = 1; c < envs.length; c++) if (envs[c][i] > envs[best][i]) best = c;
    if (envs[best][i] < level) continue;
    let second = 0;
    for (let c = 0; c < envs.length; c++) if (c !== best && envs[c][i] > second) second = envs[c][i];
    counted++;
    if (envs.length > 1 && envs[best][i] <= second * tie) tied++;
    else wins[best]++;
  }
  return counted ? { shares: wins.map((w) => w / counted), tied: tied / counted } : { shares: wins, tied: 0 };
}
