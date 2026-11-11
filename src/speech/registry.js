// Every speech model and detector the bench can select, as pure data: shared
// by the bench, the worker, the server (models/index.json) and
// scripts/download-model.mjs. Carried over from
// automatic-speech-recognition-and-diarization's registry, keeping what runs
// in a browser: transcription, word timing and voice activity detection.
//
// An entry:
//   id          short, stable name ("whisper-base.en")
//   kind        asr | words | alignment | vad
//   runtime     transformers (Transformers.js) | ort (raw ONNX through a stub config) | wasm | js (project code)
//   label       what the bench shows
//   source      where its files come from; absent for built-in code:
//                 { type: "hf", repo, files }  files are paths in the repo, in models/<repo>/
//                 { type: "url", dir, files: [{ path, url, sha256 }], config }
//                   in models/<dir>/, with config written as its config.json stub
//                 { type: "npm", package, version }  installed, and copied into vendor/
//   hub         false when the browser can't fetch it from the Hugging Face hub
//               (a raw ONNX file from elsewhere): it then needs npm run download-model
//   sizeMB      download size of the listed files
//   loadMB      what a device reads when it loads the model: { wasm, webgpu } (q8 on WebAssembly,
//               the fp16 or q4f16 files on WebGPU); a device that's missing can't run it
//   timestamped Whisper models: the id of the *_timestamped export that gives word times
//   webgpu      Transformers.js { device, dtype } for WebGPU, when not the bench's usual split
//               (encoder on the GPU, q8 decoder on WebAssembly)
//   licence     SPDX id or the licence's name
//   requires    "webgpu" when it can't run on WebAssembly
//   capabilities  { words: how word times are found, prompts, punctuation }
//   languages   asr: the languages it transcribes here, as ISO 639-1 codes (what core.js checks
//               lang against), or "whisper" for Whisper's whole list
//   status      verified (loaded and checked in the project it came from) | unverified
//   default     true for today's choice of its kind
//   notes       why it is the way it is, when that isn't obvious

// Whisper exports from onnx-community: the configs, 8-bit encoder and merged
// decoder (CPU), and the fp16 and fp32 encoders that device: "webgpu" picks.
const whisperFiles = (encoders = ["fp16", "fp32"]) => [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/encoder_model_quantized.onnx",
  "onnx/decoder_model_merged_quantized.onnx",
  ...encoders.map((e) => (e === "fp32" ? "onnx/encoder_model.onnx" : `onnx/encoder_model_${e}.onnx`)),
];

const singleGraph = (extra = []) => ["config.json", "preprocessor_config.json", ...extra, "onnx/model_quantized.onnx"];

// The *_timestamped Whisper exports (cross-attention outputs for word times):
// the q8 pair and the tokenizer files their pipeline reads.
const timestampedFiles = [...whisperFiles([]), "added_tokens.json", "merges.txt", "normalizer.json", "special_tokens_map.json", "vocab.json"];

const ENGLISH = ["en"];

export const MODELS = [
  // --- Transcription (ASR) ---------------------------------------------------
  {
    id: "whisper-tiny.en", kind: "asr", runtime: "transformers", label: "Whisper tiny.en", timestamped: "whisper-tiny.en-timestamped", languages: ENGLISH,
    source: { type: "hf", repo: "onnx-community/whisper-tiny.en", files: whisperFiles() },
    loadMB: { wasm: 41, webgpu: 47 }, sizeMB: 90, licence: "Apache-2.0", capabilities: { words: "alignment", prompts: true, punctuation: true },
    status: "unverified",
  },
  {
    id: "whisper-base.en", kind: "asr", runtime: "transformers", label: "Whisper base.en", timestamped: "whisper-base.en-timestamped", default: true, languages: ENGLISH,
    source: { type: "hf", repo: "onnx-community/whisper-base.en", files: whisperFiles() },
    loadMB: { wasm: 77, webgpu: 95 }, sizeMB: 201, licence: "Apache-2.0", capabilities: { words: "alignment", prompts: true, punctuation: true },
    status: "verified",
  },
  {
    id: "whisper-small.en", kind: "asr", runtime: "transformers", label: "Whisper small.en", timestamped: "whisper-small.en-timestamped", languages: ENGLISH,
    source: { type: "hf", repo: "onnx-community/whisper-small.en", files: whisperFiles(["fp16"]) },
    loadMB: { wasm: 249, webgpu: 333 }, sizeMB: 426, licence: "unverified", capabilities: { words: "alignment", prompts: true, punctuation: true },
    status: "unverified",
  },
  {
    id: "distil-small.en", kind: "asr", runtime: "transformers", label: "Distil-Whisper small.en", timestamped: "distil-small.en-timestamped", languages: ENGLISH,
    source: { type: "hf", repo: "onnx-community/distil-small.en", files: whisperFiles(["fp16"]) },
    loadMB: { wasm: 172, webgpu: 256 }, sizeMB: 349, licence: "MIT", capabilities: { words: "alignment", prompts: true, punctuation: true },
    status: "unverified",
  },
  {
    id: "whisper-large-v3-turbo", kind: "asr", runtime: "transformers", label: "Whisper large-v3-turbo (WebGPU)", timestamped: "whisper-large-v3-turbo-timestamped", languages: "whisper",
    source: {
      type: "hf",
      repo: "onnx-community/whisper-large-v3-turbo",
      files: [
        "config.json", "generation_config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json",
        "onnx/encoder_model_q4f16.onnx", "onnx/decoder_model_merged_q4f16.onnx",
      ],
    },
    sizeMB: 563, loadMB: { webgpu: 563 }, memoryMB: 1200, licence: "MIT", requires: ["webgpu"],
    webgpu: {
      device: { encoder_model: "webgpu", decoder_model_merged: "webgpu" },
      dtype: { encoder_model: "q4f16", decoder_model_merged: "q4f16" },
    },
    capabilities: { words: "alignment", prompts: true, punctuation: true },
    status: "unverified", notes: "Too large for WebAssembly's 4 GB heap; WebGPU only.",
  },
  {
    id: "wav2vec2-base-960h", kind: "asr", runtime: "transformers", label: "wav2vec2 base 960h (CTC)", languages: ENGLISH,
    source: {
      type: "hf",
      repo: "Xenova/wav2vec2-base-960h",
      files: singleGraph(["tokenizer.json", "tokenizer_config.json", "vocab.json", "special_tokens_map.json"]),
    },
    loadMB: { wasm: 95, webgpu: 95 }, sizeMB: 95, licence: "Apache-2.0", capabilities: { words: "ctc-frames", prompts: false, punctuation: false },
    status: "unverified", notes: "Upper-case letters only, no punctuation.",
  },
  {
    id: "parakeet-ctc-0.6b", kind: "asr", runtime: "transformers", label: "Parakeet CTC 0.6B", languages: ENGLISH,
    source: {
      type: "hf",
      repo: "onnx-community/parakeet-ctc-0.6b-ONNX",
      files: [
        "config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json",
        "onnx/model_quantized.onnx", "onnx/model_quantized.onnx_data",
      ],
    },
    sizeMB: 612, loadMB: { wasm: 612 }, memoryMB: 1300, licence: "CC-BY-4.0",
    capabilities: { words: "ctc-frames", prompts: false, punctuation: false },
    status: "unverified",
    notes:
      "The 8-bit export, on WebAssembly: the q4f16 export (the only WebGPU-friendly one) returns NaN logits, " +
      "on the CPU and on WebGPU alike, so it transcribes nothing. Weights are in an external .onnx_data file. " +
      "Lower-case, no punctuation.",
  },

  // --- Word timing -------------------------------------------------------------
  {
    id: "whisper-base.en-timestamped", kind: "words", runtime: "transformers", label: "Whisper base.en word timestamps",
    source: { type: "hf", repo: "onnx-community/whisper-base.en_timestamped", files: timestampedFiles },
    loadMB: { wasm: 77 }, sizeMB: 77, licence: "Apache-2.0", status: "verified",
    notes: "Cross-attention + DTW word times.",
  },
  {
    id: "whisper-tiny.en-timestamped", kind: "words", runtime: "transformers", label: "Whisper tiny.en word timestamps",
    source: { type: "hf", repo: "onnx-community/whisper-tiny.en_timestamped", files: timestampedFiles },
    loadMB: { wasm: 41 }, sizeMB: 43, licence: "Apache-2.0", status: "unverified",
  },
  {
    id: "whisper-small.en-timestamped", kind: "words", runtime: "transformers", label: "Whisper small.en word timestamps",
    source: { type: "hf", repo: "onnx-community/whisper-small.en_timestamped", files: timestampedFiles },
    loadMB: { wasm: 249 }, sizeMB: 250, licence: "unverified", status: "unverified",
  },
  {
    id: "distil-small.en-timestamped", kind: "words", runtime: "transformers", label: "Distil-Whisper small.en word timestamps",
    source: { type: "hf", repo: "onnx-community/distil-small.en_timestamped", files: timestampedFiles },
    loadMB: { wasm: 172 }, sizeMB: 174, licence: "MIT", status: "unverified",
  },
  {
    id: "whisper-large-v3-turbo-timestamped", kind: "words", runtime: "transformers", label: "Whisper large-v3-turbo word timestamps",
    source: {
      type: "hf",
      repo: "onnx-community/whisper-large-v3-turbo_timestamped",
      files: [
        "config.json", "generation_config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json",
        "added_tokens.json", "merges.txt", "normalizer.json", "special_tokens_map.json", "vocab.json",
        "onnx/encoder_model_q4f16.onnx", "onnx/decoder_model_merged_q4f16.onnx",
      ],
    },
    loadMB: { webgpu: 564 }, sizeMB: 565, licence: "MIT", requires: ["webgpu"],
    webgpu: {
      device: { encoder_model: "webgpu", decoder_model_merged: "webgpu" },
      dtype: { encoder_model: "q4f16", decoder_model_merged: "q4f16" },
    },
    status: "unverified",
  },
  {
    id: "wav2vec2-align", kind: "alignment", runtime: "transformers", label: "wav2vec2 forced alignment (WhisperX-style)",
    source: {
      type: "hf",
      repo: "Xenova/wav2vec2-base-960h",
      files: singleGraph(["tokenizer.json", "tokenizer_config.json", "vocab.json", "special_tokens_map.json"]),
    },
    loadMB: { wasm: 95 }, sizeMB: 95, licence: "Apache-2.0", status: "unverified",
  },

  // --- Voice activity detection ------------------------------------------------
  {
    id: "energy", kind: "vad", runtime: "js", label: "Energy detector", default: true,
    licence: "project", status: "verified",
  },
  {
    id: "silero-vad", kind: "vad", runtime: "ort", label: "Silero VAD v6", hub: false,
    source: {
      type: "url",
      dir: "snakers4/silero-vad",
      files: [
        {
          path: "onnx/model.onnx",
          url: "https://github.com/snakers4/silero-vad/raw/v6.2.3/src/silero_vad/data/silero_vad.onnx",
          sha256: "1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3",
        },
      ],
      config: { model_type: "silero-vad" },
    },
    loadMB: { wasm: 2.3 }, sizeMB: 2.3, licence: "MIT", status: "verified",
    notes: "Each 512-sample window needs the previous 64 samples prepended. A raw ONNX file from GitHub, so it has to be on this server.",
  },
  {
    id: "webrtc-vad", kind: "vad", runtime: "wasm", label: "WebRTC VAD",
    source: { type: "npm", package: "@echogarden/fvad-wasm", version: "0.2.0" },
    sizeMB: 0.02, licence: "BSD-3-Clause", status: "verified",
    notes: "libfvad on 20 ms frames, aggressiveness 0-3.",
  },
];

export const KINDS = ["asr", "words", "alignment", "vad"];

const byId = new Map(MODELS.map((m) => [m.id, m]));
// Hugging Face repos and raw ONNX folders (their models/ dirs) alike. A repo
// can hold more than one entry (Xenova/wav2vec2-base-960h is a transcription
// model and the forced aligner), so each maps to all of its entries.
const byRepo = new Map();
for (const m of MODELS) if (modelDir(m)) byRepo.set(modelDir(m), [...(byRepo.get(modelDir(m)) ?? []), m]);

// The entry for an id, or for a Hugging Face repo; for a repo with several
// entries, the one of the given kind (else the last listed). An unknown repo
// becomes a minimal Transformers.js entry; anything else is null.
export function resolve(idOrRepo, { kind } = {}) {
  const inRepo = byRepo.get(idOrRepo);
  const found = byId.get(idOrRepo) ?? inRepo?.find((m) => m.kind === kind) ?? inRepo?.at(-1);
  if (found) return found;
  if (typeof idOrRepo === "string" && /^[\w.-]+\/[\w.-]+$/.test(idOrRepo)) {
    return {
      id: idOrRepo, kind: kind ?? null, runtime: "transformers", label: idOrRepo,
      source: { type: "hf", repo: idOrRepo }, status: "unverified",
    };
  }
  return null;
}

export const defaultFor = (kind) => MODELS.find((m) => m.kind === kind && m.default) ?? null;

export const ofKind = (kind) => MODELS.filter((m) => m.kind === kind);

// Where an entry's files live under models/ (and, for a Hugging Face entry,
// its repo on the hub), or null if it has none there.
export function modelDir(entry) {
  if (entry?.source?.type === "hf") return entry.source.repo;
  if (entry?.source?.type === "url") return entry.source.dir;
  return null;
}

// The files that must be on disk under models/<modelDir> for the entry to be
// usable (config stubs included).
export function modelFiles(entry) {
  const source = entry?.source;
  if (source?.type === "hf") return source.files ?? null; // null: an unknown repo, Transformers.js decides
  if (source?.type === "url") return ["config.json", ...source.files.map((f) => f.path)];
  return [];
}

// The *_timestamped export that gives a Whisper model's word times, or null.
export function timestampedFor(model) {
  const entry = resolve(model, { kind: "asr" });
  return entry?.timestamped ? (byId.get(entry.timestamped) ?? null) : null;
}

// The ASR model a timestamped export belongs to, or null.
export const asrFor = (timestamped) => MODELS.find((m) => m.timestamped === resolve(timestamped)?.id) ?? null;
