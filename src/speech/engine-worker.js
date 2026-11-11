// Module worker that hosts the models off the main thread: the transcription
// engine (Whisper or CTC, from asr-engine.js), word alignment, and the speech
// detectors for whole files.
//
// In:  { type: "load", config }
//      { type: "transcribe" | "speech", id, audio, options }
//      { type: "file-open", fileId, audio } | { type: "file-close", fileId }
//      (audio is a Float32Array, or { fileId, start, end } in samples)
// Out: { type: "progress", model: "asr" | "aligner", ... } | { type: "ready", info } | { type: "load-error", message }
//      { type: "result", id, ... } | { type: "error", id, message, language }
//
// config: { model, localModelPath, allowRemoteModels, from (the transcription
// model and where it is, from core.js's modelSource()), alignment and silero
// (the same for those models), words, dtype, device, transformersUrl, wasmPaths }

import { LanguageError } from "./whisper-engine.js";
import { createAsrEngine } from "./asr-engine.js";
import { createAligner } from "./align/aligner.js";
import { sameOriginPath } from "./model-env.js";
import { resolve } from "./registry.js";
import { createEnergyDetector, createSileroDetector, createWebRtcDetector, frameScores, loadSilero, speechRegions } from "./vad.js";

let enginePromise = null;
const files = new Map(); // whole recordings, sent once by transcribeFile()

// ONNX Runtime work (loading a model, running one) happens one task at a time.
let busy = Promise.resolve();
function exclusive(task) {
  const run = busy.then(task);
  busy = run.catch(() => {});
  return run;
}

self.onmessage = async ({ data }) => {
  switch (data.type) {
    case "load":
      enginePromise ??= exclusive(() => load(data.config));
      try {
        const engine = await enginePromise;
        self.postMessage({ type: "ready", info: engine.info });
      } catch (err) {
        enginePromise = null;
        self.postMessage({ type: "load-error", message: messageOf(err) });
      }
      break;

    case "file-open":
      files.set(data.fileId, data.audio);
      break;

    case "file-close":
      files.delete(data.fileId);
      break;

    case "transcribe":
    case "speech":
      try {
        const audio = audioOf(data.audio);
        const result =
          data.type === "transcribe"
            ? await exclusive(async () => (await enginePromise).transcribe(audio, data.options))
            : await exclusive(() => detectSpeech(audio, data.options));
        self.postMessage({ type: "result", id: data.id, ...result });
      } catch (err) {
        self.postMessage({
          type: "error",
          id: data.id,
          message: messageOf(err),
          language: err instanceof LanguageError,
        });
      }
      break;
  }
};

function audioOf(audio) {
  if (audio instanceof Float32Array) return audio;
  const file = files.get(audio.fileId);
  if (!file) throw new Error("That file is no longer open");
  return file.subarray(audio.start, audio.end);
}

// A model's files, as the loaders take them.
const sourceOf = ({ model, localModelPath, allowRemoteModels }) => ({ model, localModelPath: sameOriginPath(localModelPath), allowRemoteModels });

// Speech regions over a whole recording, for transcribeFile().
let loadConfig = null;
let sileroPromise = null;
async function detectSpeech(audio, { vad = "energy", vadLevel = 2, vadThreshold = 0.5 } = {}) {
  let detector;
  if (vad === "silero-vad") {
    sileroPromise ??= import(loadConfig.transformersUrl).then((transformers) =>
      loadSilero(transformers, { ...sourceOf(loadConfig.silero), wasmPaths: loadConfig.wasmPaths, device: "wasm" }),
    );
    detector = createSileroDetector(await sileroPromise.catch((err) => {
      sileroPromise = null;
      throw err;
    }), { threshold: vadThreshold });
  } else if (vad === "webrtc-vad") {
    detector = await createWebRtcDetector({ level: vadLevel });
  } else {
    detector = createEnergyDetector();
  }
  try {
    return { vad, regions: speechRegions(await frameScores(audio, detector), detector.threshold) };
  } finally {
    detector.close();
  }
}

async function load(config) {
  loadConfig = config;
  const transformers = await import(config.transformersUrl);
  const options = {
    ...sourceOf(config),
    dtype: config.dtype,
    device: config.device,
    wasmPaths: config.wasmPaths,
    onProgress: (p) => self.postMessage({ type: "progress", model: "asr", ...p }),
  };

  const entry = resolve(config.model);
  const gpuOnly = Boolean(entry?.requires?.includes("webgpu"));
  let engine = null;
  let fallback;
  if (config.device === "webgpu" || gpuOnly) {
    try {
      engine = await createAsrEngine(transformers, { ...options, ...(await webGpuOptions(config.dtype, entry)) });
      // Compiles the GPU shaders now rather than on the first utterance, and
      // proves the GPU path works before it is relied on.
      await engine.transcribe(new Float32Array(16000));
      engine.info.device = "webgpu";
    } catch (err) {
      await engine?.dispose().catch(() => {});
      engine = null;
      // A WebGPU-only model is too big for WebAssembly, so there's nothing to fall back to.
      if (gpuOnly) throw new Error(`${entry.label} needs WebGPU, and it failed: ${messageOf(err)}`);
      fallback = `WebGPU failed (${messageOf(err)}), using WebAssembly`;
    }
  }
  if (!engine) {
    const gpu = config.device === "webgpu";
    engine = await createAsrEngine(transformers, {
      ...options,
      device: gpu ? "wasm" : config.device,
      dtype: gpu || config.dtype === "auto" ? "q8" : config.dtype,
    });
  }
  engine.info.fallback = fallback;
  engine.info.from = config.from;
  engine.info.crossOriginIsolated = self.crossOriginIsolated;
  engine.info.threads = transformers.env.backends?.onnx?.wasm?.numThreads ?? 1;
  return withWords(engine, config, transformers, options);
}

// Applies config.words to an engine's results. Word times come from the
// engine itself (a Whisper timestamped export, or a CTC model's frames), or
// from forced alignment of its text with wav2vec2 ("align"). A job asks for
// them with options.words; interim results don't.
async function withWords(engine, config, transformers, options) {
  const transcribe = engine.transcribe;
  const kind = engine.info.kind === "ctc" ? "frames" : engine.info.words ? "whisper" : null;
  let aligner = null;
  if (config.words === "align" && kind !== "frames") {
    aligner = await createAligner(transformers, {
      ...options,
      ...sourceOf(config.alignment),
      dtype: "q8",
      device: "wasm",
      onProgress: (p) => self.postMessage({ type: "progress", model: "aligner", ...p }),
    });
  }
  const source = config.words === "off" ? null : aligner ? "align" : kind;
  engine.info.wordsFrom = source;
  engine.transcribe = async (audio, jobOptions = {}) => {
    const wanted = Boolean(source && jobOptions.words);
    const result = await transcribe(audio, { ...jobOptions, words: wanted && !aligner });
    if (wanted && aligner && result.text) result.words = await aligner.align(audio, result.text);
    if (!wanted) delete result.words;
    return result;
  };
  return engine;
}

// Whisper on WebGPU: the encoder, which does most of the work, runs on the
// GPU. The decoder stays on WebAssembly with the same q8 file as the CPU path:
// its GPU-friendly versions are over 100 MB, and in the speech bench's testing
// were barely faster in Edge and much slower in Firefox. A model whose
// registry entry lists its own WebGPU setup (large-v3-turbo) uses that
// instead. The CTC models (wav2vec2, Parakeet CTC) have no WebGPU setup, so
// they fall back to WebAssembly.
async function webGpuOptions(dtype, entry) {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error("no WebGPU adapter");
  if (entry?.webgpu) return { device: entry.webgpu.device, dtype: dtype === "auto" ? entry.webgpu.dtype : dtype };
  // Whisper models (and their timestamped exports) use the split below; others need their own.
  if (entry && !entry.capabilities?.prompts && entry.kind !== "words") throw new Error(`no WebGPU setup is listed for ${entry.label}`);
  const f16 = adapter.features.has("shader-f16");
  return {
    device: { encoder_model: "webgpu", decoder_model_merged: "wasm" },
    dtype: dtype === "auto" ? { encoder_model: f16 ? "fp16" : "fp32", decoder_model_merged: "q8" } : dtype,
  };
}

function messageOf(err) {
  return err instanceof Error ? err.message : String(err);
}
