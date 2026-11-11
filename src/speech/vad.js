// Voice activity detection: which 20 ms frames of 16 kHz audio hold speech.
// The live Segmenter (audio.js) asks a detector about each frame as it
// arrives; whole files are scored frame by frame and turned into speech
// regions. Shared by the browser (page, workers) and the Node tests.
//
// A detector is { id, threshold, push(frame), flush(), close() }:
//   push(frame)  a 320-sample Float32Array -> its speech score, 0-1, or a
//                Promise of it (Silero answers from a worker, a window late);
//                the frame is speech when the score reaches threshold
//   flush()      the stream has ended: score what is still buffered
//                (a Promise for asynchronous detectors)
//   close()      frees the detector
// The energy detector has no object: the Segmenter applies its rule itself,
// exactly as before detectors were selectable.

import { FVAD_URL } from "../deps.js";
import { useModelSource } from "./model-env.js";

export const FRAME = 320; // 20 ms
const FRAME_SECONDS = FRAME / 16000;

// Settings (core.js config): vad is a registry id; vadLevel is WebRTC's
// aggressiveness, 0-3; vadThreshold is Silero's speech probability.
export const VAD_IDS = ["energy", "webrtc-vad", "silero-vad"];

// --- Energy ----------------------------------------------------------------

// The Segmenter's energy rule. The noise floor adapts on quiet frames, and
// (in the Segmenter) only between utterances.
export class EnergyRule {
  noise = 0.002;
  // -> { rms, loud }: loud is the energy detector's "speech".
  measure(frame) {
    let energy = 0;
    for (const s of frame) energy += s * s;
    const rms = Math.sqrt(energy / frame.length);
    return { rms, loud: rms > Math.max(this.noise * 3.5, 0.006) };
  }
  adapt(rms) {
    const rate = rms < this.noise ? 0.1 : 0.01;
    this.noise = Math.max(1e-4, this.noise * (1 - rate) + rms * rate);
  }
}

// The energy rule as a detector, for whole files: there are no utterances,
// so the floor adapts on every quiet frame.
export function createEnergyDetector() {
  const rule = new EnergyRule();
  return {
    id: "energy",
    threshold: 0.5,
    push(frame) {
      const { rms, loud } = rule.measure(frame);
      if (!loud) rule.adapt(rms);
      return loud ? 1 : 0;
    },
    flush() {},
    close() {},
  };
}

// --- WebRTC ----------------------------------------------------------------

// libfvad (WebRTC's detector) compiled to WebAssembly. Synchronous; level
// 0-3: higher levels reject more non-speech, and can clip quiet words.
export async function createWebRtcDetector({ level = 2, url = FVAD_URL } = {}) {
  const { default: fvad } = await import(url);
  const m = await fvad();
  const handle = m._fvad_new();
  if (!handle) throw new Error("WebRTC VAD could not start");
  m._fvad_set_sample_rate(handle, 16000);
  if (m._fvad_set_mode(handle, level) < 0) {
    m._fvad_free(handle);
    throw new Error(`WebRTC VAD has no level ${level} (0-3)`);
  }
  const pointer = m._malloc(FRAME * 2);
  const pcm = new Int16Array(FRAME);
  return {
    id: "webrtc-vad",
    level,
    threshold: 0.5,
    push(frame) {
      for (let i = 0; i < FRAME; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(frame[i] * 32768)));
      m.HEAP16.set(pcm, pointer >> 1); // HEAP16 is re-read: it changes if memory grows
      return m._fvad_process(handle, pointer, FRAME) > 0 ? 1 : 0;
    },
    flush() {},
    close() {
      m._free(pointer);
      m._fvad_free(handle);
    },
  };
}

// --- Silero ----------------------------------------------------------------

// Silero VAD v6 is a raw ONNX model, loaded through Transformers.js with a
// stub config. It scores 512-sample (32 ms) windows, each fed with the 64
// samples before it, and carries a recurrent state from window to window.
const WINDOW = 512;
const CONTEXT = 64;

export async function loadSilero(transformers, { model = "snakers4/silero-vad", device = "wasm", localModelPath, allowRemoteModels = false, wasmPaths, onProgress } = {}) {
  const { env, PreTrainedModel, Tensor } = transformers;
  useModelSource(env, { localModelPath, allowRemoteModels, wasmPaths });
  const session = await PreTrainedModel.from_pretrained(model, { dtype: "fp32", device, progress_callback: onProgress });
  return { session, Tensor };
}

// A stream of audio in, window probabilities out. push() and flush() resolve
// to the [window, probability] pairs they completed, in order.
export function sileroStream({ session, Tensor }) {
  const sr = new Tensor("int64", BigInt64Array.from([16000n]), []);
  let state = new Tensor("float32", new Float32Array(2 * 128), [2, 1, 128]);
  let buffer = new Float32Array(CONTEXT + WINDOW); // [context | window being filled]
  let filled = 0;
  let next = 0; // index of the window being filled
  let queue = Promise.resolve();

  async function score(input, index) {
    const out = await session({ input: new Tensor("float32", input, [1, CONTEXT + WINDOW]), state, sr });
    state = out.stateN;
    return [index, out.output.data[0]];
  }
  // Windows run one at a time, in order.
  const run = (inputs) => (queue = queue.then(async () => {
    const done = [];
    for (const [input, index] of inputs) done.push(await score(input, index));
    return done;
  }));

  return {
    push(samples) {
      const inputs = [];
      let offset = 0;
      while (offset < samples.length) {
        const n = Math.min(WINDOW - filled, samples.length - offset);
        buffer.set(samples.subarray(offset, offset + n), CONTEXT + filled);
        filled += n;
        offset += n;
        if (filled === WINDOW) {
          inputs.push([buffer, next++]);
          const following = new Float32Array(CONTEXT + WINDOW);
          following.set(buffer.subarray(WINDOW)); // the last 64 samples become the context
          buffer = following;
          filled = 0;
        }
      }
      return inputs.length ? run(inputs) : queue.then(() => []);
    },
    // Scores the partial window left at the end, padded with silence.
    flush() {
      if (!filled) return queue.then(() => []);
      const input = buffer;
      buffer = new Float32Array(CONTEXT + WINDOW);
      filled = 0;
      return run([[input, next++]]);
    },
  };
}

// Frame-level detector over window probabilities that arrive asynchronously
// (from a stream in this thread, or from a worker). A 20 ms frame takes the
// probability of the window holding its last sample, so its answer can wait
// for the frames after it; flush() scores the last, partial window.
function windowedDetector({ id, threshold, send, finish, close }) {
  const probs = [];
  const waiting = new Map(); // window -> resolvers
  let samples = 0;
  return {
    id,
    threshold,
    receive(pairs) {
      for (const [index, p] of pairs) {
        probs[index] = p;
        for (const resolve of waiting.get(index) ?? []) resolve(p);
        waiting.delete(index);
      }
    },
    push(frame) {
      samples += frame.length;
      const index = Math.floor((samples - 1) / WINDOW);
      send(frame);
      if (probs[index] !== undefined) return probs[index];
      return new Promise((resolve) => {
        if (!waiting.has(index)) waiting.set(index, []);
        waiting.get(index).push(resolve);
      });
    },
    flush: finish,
    close,
  };
}

// Silero in this thread (Node, and the Whisper worker for whole files).
export function createSileroDetector(silero, { threshold = 0.5 } = {}) {
  const stream = sileroStream(silero);
  const detector = windowedDetector({
    id: "silero-vad",
    threshold,
    send: (frame) => stream.push(frame).then((pairs) => detector.receive(pairs)),
    finish: () => stream.flush().then((pairs) => detector.receive(pairs)),
    close() {},
  });
  return detector;
}

// Silero in its own small worker (live mode in the browser), so it never
// waits behind Whisper. paths: { transformersUrl, wasmPaths, model,
// localModelPath, allowRemoteModels } (core.js's detectorOptions()).
export async function createSileroWorkerDetector({ threshold = 0.5, ...paths } = {}) {
  const worker = new Worker(new URL("vad-worker.js", import.meta.url), { type: "module" });
  let flushed = null;
  const detector = windowedDetector({
    id: "silero-vad",
    threshold,
    send: (frame) => worker.postMessage({ type: "samples", samples: frame }),
    finish: () => {
      worker.postMessage({ type: "flush" });
      return new Promise((resolve) => (flushed = resolve));
    },
    close: () => worker.terminate(),
  });
  await new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if (data.type === "ready") resolve();
      else if (data.type === "load-error") reject(new Error(data.message));
      else if (data.type === "probs") detector.receive(data.pairs);
      else if (data.type === "flushed") flushed?.();
    };
    worker.onerror = (event) => {
      event.preventDefault();
      reject(new Error(event.message || "The speech detector worker failed to start"));
    };
    worker.postMessage({ type: "load", config: paths });
  }).catch((err) => {
    worker.terminate();
    throw err;
  });
  return detector;
}

// The live detector for core.js settings, or null for the energy rule.
// paths: what Silero's worker needs (see createSileroWorkerDetector).
export async function createLiveDetector({ vad = "energy", vadLevel = 2, vadThreshold = 0.5 } = {}, paths = {}) {
  if (vad === "energy") return null;
  if (vad === "webrtc-vad") return createWebRtcDetector({ level: vadLevel });
  if (vad === "silero-vad") return createSileroWorkerDetector({ threshold: vadThreshold, ...paths });
  throw new Error(`Unknown voice activity detector: ${vad}`);
}

// --- Whole recordings ---------------------------------------------------------

// Every whole 20 ms frame's speech score.
export async function frameScores(audio, detector) {
  const scores = [];
  for (let offset = 0; offset + FRAME <= audio.length; offset += FRAME) {
    scores.push(detector.push(audio.subarray(offset, offset + FRAME)));
  }
  await detector.flush();
  return Promise.all(scores);
}

// Speech regions, [[start, end]] in seconds, from frame scores. Pauses
// shorter than bridge are joined over; bursts shorter than minSpeech dropped.
export function speechRegions(scores, threshold = 0.5, { bridge = 0.2, minSpeech = 0.12 } = {}) {
  const raw = [];
  let start = -1;
  scores.forEach((score, f) => {
    if (score >= threshold) {
      if (start < 0) start = f;
    } else if (start >= 0) {
      raw.push([start, f]);
      start = -1;
    }
  });
  if (start >= 0) raw.push([start, scores.length]);
  const joined = [];
  for (const [a, b] of raw) {
    const last = joined[joined.length - 1];
    if (last && (a - last[1]) * FRAME_SECONDS < bridge) last[1] = b;
    else joined.push([a, b]);
  }
  const round = (f) => Math.round(f * FRAME_SECONDS * 1000) / 1000;
  return joined.filter(([a, b]) => (b - a) * FRAME_SECONDS >= minSpeech).map(([a, b]) => [round(a), round(b)]);
}

// --- Whole files: checking gaps and trimming parts ---------------------------

// How much silence is kept around detected speech when a part is trimmed or
// a gap is checked, so a late start or a soft ending isn't cut off.
export const SPEECH_PAD = 0.3;

// The speech inside [start, end], padded and clipped to it: { start, end },
// or null when the detector heard nothing there.
export function speechWithin(regions, start, end, pad = SPEECH_PAD) {
  let first = Infinity;
  let last = -Infinity;
  for (const [a, b] of regions) {
    if (b <= start || a >= end) continue;
    first = Math.min(first, a);
    last = Math.max(last, b);
  }
  if (first === Infinity) return null;
  return { start: Math.max(start, first - pad), end: Math.min(end, last + pad) };
}

// fileVad applied to planned parts (planFileParts). "off" leaves them;
// "gaps" keeps an uncovered stretch only where the detector heard speech,
// trimmed to it; "trim" does that and also trims silence off the ends of the
// diarizer's turns (a turn with no detected speech is kept whole: the
// detector can miss what the diarizer heard). Dropped gaps come back in
// skipped, for diagnostics.
export function applyFileVad(parts, regions, mode = "off") {
  if (mode === "off" || !regions) return { parts, skipped: [] };
  const kept = [];
  const skipped = [];
  for (const part of parts) {
    if (!part.unconfirmed && mode !== "trim") {
      kept.push(part);
      continue;
    }
    const speech = speechWithin(regions, part.start, part.end);
    if (speech) kept.push({ ...part, ...speech, ...(speech.start !== part.start || speech.end !== part.end ? { trimmed: [part.start, part.end] } : {}) });
    else if (part.unconfirmed) skipped.push(part);
    else kept.push(part);
  }
  return { parts: kept, skipped };
}
