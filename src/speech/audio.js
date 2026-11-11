// The speech engine's audio, all at 16 kHz mono: resampling to it, cutting a
// live stream into utterances, and decoding and chunking whole files. Carried
// over from automatic-speech-recognition-and-diarization's src/audio.js,
// without its own capture: here the audio comes from the bench's tap
// (src/captions/tap-feed.js). No DOM until decodeAudioFile() is called, so
// the rest runs in Node too.

import { EnergyRule } from "./vad.js";

export const SAMPLE_RATE = 16000;

// Streaming windowed-sinc resampler (low-pass + rate change in one step).
// Firefox can't feed a microphone into an AudioContext running at a
// different rate (before Firefox 148), so capture happens at the device's own
// rate and is converted here.
export class Resampler {
  constructor(inRate, outRate, zeroCrossings = 16, phases = 128) {
    this.step = inRate / outRate;
    const cutoff = Math.min(1, outRate / inRate) * 0.95;
    this.half = Math.ceil(zeroCrossings / cutoff);
    this.phases = phases;
    this.table = [];
    for (let p = 0; p <= phases; p++) {
      const frac = p / phases;
      const taps = new Float32Array(this.half * 2);
      let sum = 0;
      for (let k = 0; k < taps.length; k++) {
        const d = k - this.half + 1 - frac; // distance from the output point
        const x = d * cutoff;
        const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
        const window = 0.5 + 0.5 * Math.cos((Math.PI * d) / this.half);
        taps[k] = sinc * window;
        sum += taps[k];
      }
      for (let k = 0; k < taps.length; k++) taps[k] /= sum;
      this.table.push(taps);
    }
    this.buffer = new Float32Array(this.half); // start with zero history
    this.position = this.half - 1;
  }

  process(input) {
    const buf = new Float32Array(this.buffer.length + input.length);
    buf.set(this.buffer);
    buf.set(input, this.buffer.length);

    const out = [];
    let t = this.position;
    while (Math.floor(t) + this.half < buf.length) {
      const center = Math.floor(t);
      const taps = this.table[Math.round((t - center) * this.phases)];
      const start = center - this.half + 1;
      let acc = 0;
      for (let k = 0; k < taps.length; k++) acc += buf[start + k] * taps[k];
      out.push(acc);
      t += this.step;
    }

    const keepFrom = Math.max(0, Math.floor(t) - this.half + 1);
    this.buffer = buf.slice(keepFrom);
    this.position = t - keepFrom;
    return Float32Array.from(out);
  }
}

function captureError(code, err) {
  return Object.assign(new Error(err?.message ?? String(err)), { code });
}

// Cuts the 16 kHz stream into utterances, using voice activity detection on
// 20 ms frames. Without a detector it uses its energy rule, whose noise floor
// adapts while nobody is speaking; a detector (vad.js) decides instead, and
// the energy rule only drives the sound handler. Handlers get the sample
// offset where each utterance starts, counted from the first push, and
// optionally vad(score, speech) for every frame. A detector that answers
// asynchronously (Silero) delays the handlers; flush() then returns a Promise
// that resolves once the last frames are decided.
export class Segmenter {
  frameSize = 320; // 20 ms
  frameMs = 20;

  constructor(handlers, { silenceMs, maxSegmentMs, detector = null }) {
    this.handlers = handlers;
    this.detector = detector;
    this.decided = null; // the chain of an asynchronous detector's answers
    this.energy = new EnergyRule();
    this.startFrames = 6; // 120 ms of voice starts an utterance
    this.endFrames = Math.ceil(silenceMs / this.frameMs);
    this.trailFrames = 10; // keep 200 ms of trailing silence
    this.preRollFrames = 15; // and 300 ms before the start
    this.minVoicedFrames = 12; // utterances under 240 ms of voice are noise
    this.maxFrames = Math.floor(maxSegmentMs / this.frameMs);
    this.pending = new Float32Array(0);
    this.preRoll = [];
    this.frames = null;
    this.run = 0;
    this.segmentId = 0;
    this.framesSeen = 0;
  }

  push(pcm) {
    const data = new Float32Array(this.pending.length + pcm.length);
    data.set(this.pending);
    data.set(pcm, this.pending.length);
    let offset = 0;
    for (; offset + this.frameSize <= data.length; offset += this.frameSize) {
      this.#next(data.slice(offset, offset + this.frameSize));
    }
    this.pending = data.slice(offset);
  }

  // Ends the current utterance early (stop() was called), trimming trailing
  // silence as a natural end would. Returns a Promise when the detector is
  // still deciding frames.
  flush() {
    if (!this.decided) {
      if (this.frames) this.#endSegment(this.silent);
      return undefined;
    }
    const last = this.detector.flush();
    return Promise.all([this.decided, last]).then(() => {
      if (this.frames) this.#endSegment(this.silent);
    });
  }

  // Ends the current utterance where it is and carries on listening: for a
  // boundary the caller sets (a take starting, pausing or stopping), so no
  // utterance spans it. Unlike flush() it leaves the detector's own state
  // alone. Returns a Promise when the detector is still deciding frames; the
  // utterance then ends with the frames heard by the time it resolves.
  cut() {
    if (!this.decided) {
      if (this.frames) this.#endSegment(this.silent);
      return undefined;
    }
    return this.decided.then(() => {
      if (this.frames) this.#endSegment(this.silent);
    });
  }

  #next(frame) {
    if (!this.detector) return this.#frame(frame, null);
    const score = this.detector.push(frame);
    if (!this.decided && typeof score === "number") return this.#frame(frame, score);
    this.decided = (this.decided ?? Promise.resolve()).then(() => score).then((s) => this.#frame(frame, s));
  }

  // score: the detector's answer for this frame, or null for the energy rule.
  #frame(frame, score) {
    this.framesSeen++;
    const { rms, loud } = this.energy.measure(frame);
    const voiced = score === null ? loud : score >= this.detector.threshold;
    if (rms > Math.max(this.energy.noise * 2, 0.003)) this.handlers.sound();
    this.handlers.vad?.(score ?? (loud ? 1 : 0), voiced);

    if (!this.frames) {
      this.preRoll.push(frame);
      if (this.preRoll.length > this.preRollFrames) this.preRoll.shift();
      if (voiced) this.run++;
      else this.run = 0;
      if (!loud) this.energy.adapt(rms);
      if (this.run >= this.startFrames) {
        this.frames = this.preRoll;
        this.preRoll = [];
        this.startSample = (this.framesSeen - this.frames.length) * this.frameSize;
        this.voiced = this.run;
        this.silent = 0;
        this.segmentId++;
        this.handlers.speechStart(this.segmentId, this.startSample);
      }
      return;
    }

    this.frames.push(frame);
    if (voiced) {
      this.voiced++;
      this.silent = 0;
    } else {
      this.silent++;
    }
    if (this.silent >= this.endFrames || this.frames.length >= this.maxFrames) {
      this.#endSegment(this.silent);
    } else {
      this.handlers.progress(this.segmentId, this.frames.length * this.frameMs, () =>
        concat(this.frames),
      );
    }
  }

  #endSegment(silent) {
    const frames = this.frames;
    const keep = frames.length - Math.max(0, silent - this.trailFrames);
    const id = this.segmentId;
    const voiced = this.voiced;
    this.frames = null;
    this.run = 0;
    if (voiced >= this.minVoicedFrames) {
      this.handlers.segment(id, concat(frames.slice(0, keep)), this.startSample);
    } else {
      this.handlers.discard(id);
    }
  }
}

// Decodes an audio or video file (Blob, File, ArrayBuffer, typed array or
// URL) to 16 kHz mono. Rejects with code "audio-capture" if it can't be
// decoded, or "file-too-long" past maxSeconds.
export async function decodeAudioFile(source, { maxSeconds = Infinity } = {}) {
  let decoded;
  try {
    let data;
    if (source instanceof ArrayBuffer) data = source.slice(0); // decoding detaches its input
    else if (ArrayBuffer.isView(source)) data = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    else if (source instanceof Blob) data = await source.arrayBuffer();
    else {
      const response = await fetch(source);
      if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
      data = await response.arrayBuffer();
    }
    // An OfflineAudioContext resamples to its own rate while decoding.
    decoded = await new OfflineAudioContext(1, 1, SAMPLE_RATE).decodeAudioData(data);
  } catch (err) {
    throw captureError("audio-capture", err);
  }
  if (decoded.duration > maxSeconds) {
    const minutes = (s) => `${Math.round(s / 60)} min`;
    throw captureError("file-too-long", `The recording is ${minutes(decoded.duration)}; the limit is ${minutes(maxSeconds)}`);
  }
  const mono = new Float32Array(decoded.length);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const channel = decoded.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / decoded.numberOfChannels;
  }
  return mono;
}

// Splits 16 kHz audio into [start, end) sample ranges of about `target`
// seconds, each cut at the quietest 100 ms of its last `search` seconds.
export function chunkBounds(audio, { target = 20, search = 3 } = {}) {
  const window = SAMPLE_RATE / 10;
  const bounds = [];
  let position = 0;
  while (audio.length - position > (target + search) * SAMPLE_RATE) {
    const latest = position + target * SAMPLE_RATE;
    let cut = latest;
    let quietest = Infinity;
    for (let s = latest - search * SAMPLE_RATE; s + window <= latest; s += window / 2) {
      let energy = 0;
      for (let i = s; i < s + window; i++) energy += audio[i] * audio[i];
      if (energy < quietest) [quietest, cut] = [energy, s + window / 2];
    }
    bounds.push([position, cut]);
    position = cut;
  }
  bounds.push([position, audio.length]);
  return bounds;
}

export function concat(chunks) {
  let length = 0;
  for (const c of chunks) length += c.length;
  const out = new Float32Array(length);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
