// Measurements of a take, on plain arrays: levels, silence, clipping, how the
// recorded file's audio lines up with the lossless tap, frame timing, and the
// synthetic source's A/V sync. No DOM, so the unit tests use it too.

// 0.5 -> -6.02. Silence is -Infinity, which callers show as "silent".
export const dbfs = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

// A sample at or past this counts as clipped: the converter's ceiling, give
// or take the rounding of a 16-bit or float encoder.
const CLIP = 0.999;

// Peak and RMS of one channel, how many samples touch full scale, and the
// DC offset (the mean: how far the whole waveform sits off zero).
export function levels(samples) {
  let peak = 0;
  let sum = 0;
  let total = 0;
  let clipped = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = Math.abs(samples[i]);
    if (x > peak) peak = x;
    if (x >= CLIP) clipped++;
    sum += samples[i] * samples[i];
    total += samples[i];
  }
  const rms = samples.length ? Math.sqrt(sum / samples.length) : 0;
  return { peak, rms, peakDb: dbfs(peak), rmsDb: dbfs(rms), clipped, clippedShare: samples.length ? clipped / samples.length : 0, dc: samples.length ? total / samples.length : 0 };
}

// The average of the channels.
export function mixDown(channels) {
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0]?.length ?? 0);
  for (const channel of channels) {
    for (let i = 0; i < out.length; i++) out[i] += channel[i] / channels.length;
  }
  return out;
}

// A waveform's outline for drawing: the lowest and highest sample in each of
// `buckets` equal slices, as [min0, max0, min1, max1, ...] rounded to 3 places.
export function overview(samples, buckets = 400) {
  const out = [];
  const size = samples.length / buckets;
  for (let b = 0; b < buckets && size > 0; b++) {
    let min = 0;
    let max = 0;
    for (let i = Math.floor(b * size); i < Math.floor((b + 1) * size); i++) {
      if (samples[i] < min) min = samples[i];
      if (samples[i] > max) max = samples[i];
    }
    out.push(Math.round(min * 1000) / 1000, Math.round(max * 1000) / 1000);
  }
  return out;
}

// RMS in consecutive bins of 1/rate seconds, over at most limitS seconds.
export function envelope(samples, sampleRate, rate, limitS = Infinity) {
  const size = Math.max(1, Math.round(sampleRate / rate));
  const count = Math.floor(Math.min(samples.length, limitS * sampleRate) / size);
  const out = new Float32Array(count);
  for (let b = 0; b < count; b++) {
    let sum = 0;
    for (let i = b * size; i < (b + 1) * size; i++) sum += samples[i] * samples[i];
    out[b] = Math.sqrt(sum / size);
  }
  return out;
}

// The share of windowMs windows whose RMS is under thresholdDb.
export function silenceShare(samples, sampleRate, { thresholdDb = -50, windowMs = 20 } = {}) {
  const env = envelope(samples, sampleRate, 1000 / windowMs);
  if (!env.length) return 1;
  const floor = 10 ** (thresholdDb / 20);
  let quiet = 0;
  for (const x of env) if (x < floor) quiet++;
  return quiet / env.length;
}

// Pearson correlation of x[i] with y[i + lag], over where both exist.
export function correlationAt(x, y, lag, limit = Infinity) {
  const start = Math.max(0, -lag);
  const end = Math.min(x.length, y.length - lag, start + limit);
  const n = end - start;
  if (n < 2) return 0;
  let sx = 0;
  let sy = 0;
  for (let i = start; i < end; i++) {
    sx += x[i];
    sy += y[i + lag];
  }
  const mx = sx / n;
  const my = sy / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = start; i < end; i++) {
    const a = x[i] - mx;
    const b = y[i + lag] - my;
    sxy += a * b;
    sxx += a * a;
    syy += b * b;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

// The lag with the highest correlation. A sound that repeats (a beep every
// second, a test tone) matches as well a whole period out, so of the lags
// scoring within `tie` of the best, the one nearest zero wins.
function bestLag(x, y, from, to, limit, tie = 0.01) {
  const scores = [];
  let max = -Infinity;
  for (let lag = from; lag <= to; lag++) {
    const score = correlationAt(x, y, lag, limit);
    scores.push(score);
    if (score > max) max = score;
  }
  let best = { lag: 0, score: -Infinity };
  scores.forEach((score, i) => {
    const lag = from + i;
    if (score >= max - tie && (best.score === -Infinity || Math.abs(lag) < Math.abs(best.lag))) best = { lag, score };
  });
  return best;
}

// Where a's sound appears in b, relative to where it is in a, in seconds:
// negative when b starts later in the sound (it missed the beginning). Found
// by correlating loudness envelopes, first at 10 ms over ±maxLagS, then at
// 1 ms around the best match. score is that match's correlation (1 = the
// loudness follows exactly). Uses the first limitS seconds. Of equally good
// matches (a repeating sound), the nearest is taken.
export function align(a, aRate, b, bRate, { maxLagS = 1, limitS = 120 } = {}) {
  const ca = envelope(a, aRate, 100, limitS);
  const cb = envelope(b, bRate, 100, limitS);
  const coarse = bestLag(ca, cb, -Math.round(maxLagS * 100), Math.round(maxLagS * 100));
  const fa = envelope(a, aRate, 1000, limitS);
  const fb = envelope(b, bRate, 1000, limitS);
  const fine = bestLag(fa, fb, coarse.lag * 10 - 15, coarse.lag * 10 + 15, Infinity, 0);
  // bestLag pairs a[i] with b[i + lag], so a sound at bin i of a is at bin i + lag of b.
  return { lagS: fine.lag / 1000, score: Number.isFinite(fine.score) ? fine.score : 0 };
}

// The waveform correlation of two signals at the same rate, around lagS
// (from align) ± radius samples: how alike the sound itself is, not just its
// loudness. A lossy codec keeps this high (above 0.9 for speech at normal
// bitrates); noise suppression or a different source drops it.
export function waveMatch(a, b, sampleRate, lagS, { radius = 16, limitS = 30 } = {}) {
  const centre = Math.round(lagS * sampleRate);
  const best = bestLag(a, b, centre - radius, centre + radius, limitS * sampleRate, 0);
  return { lagS: best.lag / sampleRate, score: Number.isFinite(best.score) ? best.score : 0 };
}

// Frame timing from presentation timestamps (seconds, any order): the median
// interval and the frame rate it implies, and gaps longer than 1.5 intervals
// counted as dropped frames (a gap of 3 intervals is 2 dropped).
export function frameTiming(timestamps) {
  const t = [...timestamps].sort((x, y) => x - y);
  return intervalTiming(t.slice(1).map((x, i) => x - t[i]), t.length);
}

// frameTiming's figures from the intervals between frames, for `frames`
// frames (which may come in several runs, with no interval between runs).
function intervalTiming(all, frames) {
  const intervals = all.filter((d) => d > 0);
  if (!intervals.length) return { frames, fps: null, medianInterval: null, dropped: 0, gaps: 0, maxGapS: null, jitterS: null };
  const sorted = [...intervals].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)];
  let dropped = 0;
  let gaps = 0;
  for (const d of intervals) {
    if (d > median * 1.5) {
      gaps++;
      dropped += Math.round(d / median) - 1;
    }
  }
  const mean = intervals.reduce((s, d) => s + d, 0) / intervals.length;
  const jitter = Math.sqrt(intervals.reduce((s, d) => s + (d - mean) ** 2, 0) / intervals.length);
  return { frames, fps: 1 / median, medianInterval: median, dropped, gaps, maxGapS: sorted.at(-1), jitterS: jitter };
}

const median = (list) => {
  if (!list.length) return null;
  const sorted = [...list].sort((x, y) => x - y);
  return sorted[Math.floor(sorted.length / 2)];
};

// One camera's frames as the page saw them, in runs (a pause starts a new
// run): [[{ captured, presented, count }, ...], ...], times in seconds.
// captured is when the camera took the frame, where the browser says
// (null otherwise); presented when it reached the page; count the element's
// own running total of frames. Returns frameTiming's figures (from the
// capture times when every frame has one, else the presentation times; no
// interval spans two runs), the frames the page never saw (gaps in the
// count), and the median delay from capture to presentation.
export function cameraTiming(runs) {
  const frames = runs.flat();
  const clock = frames.length && frames.every((f) => f.captured != null) ? "capture" : "presentation";
  const time = (f) => (clock === "capture" ? f.captured : f.presented);
  const intervals = runs.flatMap((run) => run.slice(1).map((f, i) => time(f) - time(run[i])));
  const missed = runs.reduce((n, run) => (run.length && run[0].count != null ? n + Math.max(0, run.at(-1).count - run[0].count + 1 - run.length) : n), 0);
  const delays = frames.filter((f) => f.captured != null).map((f) => f.presented - f.captured);
  return { ...intervalTiming(intervals, frames.length), clock, missed, delayS: median(delays) };
}

// How far apart two cameras take their frames: for each of b's frames, the
// time from the nearest of a's (positive when b's comes later), as the
// median of all. Unsynchronised cameras sit anywhere within half a frame
// interval of each other; the same camera opened twice, at 0.
export function frameOffset(a, b) {
  const sorted = [...a].sort((x, y) => x - y);
  if (!sorted.length || !b.length) return null;
  const offsets = b.map((t) => {
    let lo = 0;
    let hi = sorted.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    const after = sorted[lo];
    const before = sorted[Math.max(0, lo - 1)];
    return Math.abs(t - before) <= Math.abs(t - after) ? t - before : t - after;
  });
  return median(offsets);
}

// The frame numbers read from a recording, in presentation order: how many
// frames are missing between them and how many show a number already shown.
export function sequenceStats(codes) {
  const read = codes.filter((c) => c != null);
  let missing = 0;
  let repeated = 0;
  let backwards = 0;
  for (let i = 1; i < read.length; i++) {
    const step = read[i] - read[i - 1];
    if (step === 0) repeated++;
    else if (step > 1) missing += step - 1;
    else if (step < 0) backwards++;
  }
  return { frames: codes.length, unreadable: codes.length - read.length, first: read[0] ?? null, last: read.at(-1) ?? null, missing, repeated, backwards };
}

// When each beep starts, in seconds: the 1 ms loudness rises past
// thresholdDb (by default 12 dB under the loudest moment, and no lower than
// -45 dBFS), at least minGapS after the previous onset.
export function onsets(samples, sampleRate, { thresholdDb = null, minGapS = 0.3 } = {}) {
  const env = envelope(samples, sampleRate, 1000);
  let max = 0;
  for (const x of env) if (x > max) max = x;
  const level = thresholdDb != null ? 10 ** (thresholdDb / 20) : Math.max(max * 10 ** (-12 / 20), 10 ** (-45 / 20));
  const times = [];
  let last = -Infinity;
  for (let i = 1; i < env.length; i++) {
    if (env[i] >= level && env[i - 1] < level && i / 1000 - last >= minGapS) {
      times.push(i / 1000);
      last = i / 1000;
    }
  }
  return times;
}

// When the flash patch turns on: [{ t, flash }] frames -> the times of each
// dark-to-bright change.
export function flashEdges(frames) {
  const sorted = [...frames].sort((x, y) => x.t - y.t);
  return sorted.filter((f, i) => f.flash && i > 0 && !sorted[i - 1].flash).map((f) => f.t);
}

// Pairs each flash with the nearest beep within maxS. offsets are beep minus
// flash: positive when the sound comes after the picture.
export function avOffsets(flashTimes, beepTimes, { maxS = 0.5 } = {}) {
  const offsets = [];
  for (const f of flashTimes) {
    let best = null;
    for (const b of beepTimes) if (best == null || Math.abs(b - f) < Math.abs(best - f)) best = b;
    if (best != null && Math.abs(best - f) <= maxS) offsets.push(best - f);
  }
  if (!offsets.length) return { pairs: 0, medianS: null, minS: null, maxS: null, offsets };
  const sorted = [...offsets].sort((x, y) => x - y);
  return { pairs: offsets.length, medianS: sorted[Math.floor(sorted.length / 2)], minS: sorted[0], maxS: sorted.at(-1), offsets };
}
