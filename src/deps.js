// Where the page finds what it loads at run time, other than its own
// modules: the libraries scripts/vendor.mjs copies into vendor/, and the
// speech models' folder. Every URL is worked out from this file's own
// address, so the bench works the same at a server's root and under a
// sub-path (GitHub Pages serves it at /<repo>/), and workers, which import
// maps don't reach, get plain URLs in a message.
//
// (Mediabunny is imported statically, by src/container.js and
// src/webcodecs-recorder.js, from ../vendor/mediabunny/mediabunny.mjs.)

const here = new URL(".", import.meta.url);

// Transformers.js, with ONNX Runtime Web's JavaScript inside it.
export const TRANSFORMERS_URL = new URL("../vendor/transformers/transformers.js", here).href;

// ONNX Runtime's WebAssembly build: the loader module and the binary.
const ORT_DIR = new URL("../vendor/ort/", here).href;
export const ORT_WASM_PATHS = {
  mjs: `${ORT_DIR}ort-wasm-simd-threaded.asyncify.mjs`,
  wasm: `${ORT_DIR}ort-wasm-simd-threaded.asyncify.wasm`,
};

// libfvad (WebRTC's voice activity detector); fvad.wasm sits beside it.
export const FVAD_URL = new URL("../vendor/fvad/fvad.js", here).href;

// Models downloaded to this server (npm run download-model), one folder per
// Hugging Face repo, and the list of which are there.
export const MODELS_URL = new URL("../models/", here).href;
export const MODELS_INDEX_URL = new URL("../models/index.json", here).href;
