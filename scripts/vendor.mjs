// Copies the files the pages load from the installed packages into vendor/,
// so nothing in the browser asks for a path under node_modules/: a static
// host (GitHub Pages) publishes vendor/ and not node_modules/, and the pages
// work the same from both. Runs after every npm install (postinstall).
//
//   node scripts/vendor.mjs
//
// vendor/ isn't committed: it is made from package-lock.json's versions.

import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

// [from, under node_modules/] -> [to, under vendor/]
export const VENDORED = [
  // Reading, remuxing and writing media files.
  ["mediabunny/dist/bundles/mediabunny.mjs", "mediabunny/mediabunny.mjs"],
  // Transformers.js with ONNX Runtime Web's JavaScript inside it (transformers.web.js
  // imports onnxruntime-web by name, which a page can't resolve), and the
  // WebAssembly build it runs models with: the one pair src/deps.js names.
  ["@huggingface/transformers/dist/transformers.js", "transformers/transformers.js"],
  ["onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs", "ort/ort-wasm-simd-threaded.asyncify.mjs"],
  ["onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm", "ort/ort-wasm-simd-threaded.asyncify.wasm"],
  // WebRTC's voice activity detector (libfvad), for the webrtc-vad setting.
  ["@echogarden/fvad-wasm/fvad.js", "fvad/fvad.js"],
  ["@echogarden/fvad-wasm/fvad.wasm", "fvad/fvad.wasm"],
];

export function vendor({ quiet = false } = {}) {
  const out = join(root, "vendor");
  rmSync(out, { recursive: true, force: true });
  let bytes = 0;
  for (const [from, to] of VENDORED) {
    const source = join(root, "node_modules", from);
    if (!existsSync(source)) throw new Error(`${from} isn't installed: run npm install`);
    const target = join(out, to);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    bytes += statSync(target).size;
  }
  if (!quiet) console.log(`vendor/: ${VENDORED.length} file${VENDORED.length === 1 ? "" : "s"}, ${(bytes / 1e6).toFixed(1)} MB`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    vendor();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
