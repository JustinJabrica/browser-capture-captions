// Downloads one registry entry's files into models/, for
// scripts/download-model.mjs.

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { modelDir, resolve } from "../../src/speech/registry.js";
import { MODELS_DIR } from "./model-store.mjs";

export const hfUrl = (repo, file) => `https://huggingface.co/${repo}/resolve/main/${file}`;
const exists = (path) => stat(path).then(() => true, () => false);

export const get = (url, init = {}) => fetch(url, { ...init, redirect: "follow" });

// Streams a URL to a file through a .part file, returning its sha256 and
// size. onBytes(n) reports each chunk; signal stops the download.
export async function save(url, dest, { onBytes, signal } = {}) {
  const res = await get(url, { signal });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  await mkdir(dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  const hash = createHash("sha256");
  let bytes = 0;
  const body = Readable.fromWeb(res.body);
  body.on("data", (chunk) => {
    hash.update(chunk);
    bytes += chunk.length;
    onBytes?.(chunk.length);
  });
  try {
    await pipeline(body, createWriteStream(part), { signal });
  } catch (err) {
    await rm(part, { force: true });
    throw err;
  }
  await rename(part, dest);
  return { sha256: hash.digest("hex"), bytes };
}

// Downloads what's missing of an entry. log(line) narrates; onProgress({
// file, received }) reports bytes as they arrive (received counts the whole
// entry). Resolves to the bytes downloaded.
export async function downloadEntry(entry, { log = () => {}, onProgress, signal } = {}) {
  const source = entry.source;
  if (!source) {
    log("  nothing to download (built in)");
    return 0;
  }
  if (source.type === "npm") {
    log(`  installed with npm (${source.package}@${source.version}), and copied into vendor/`);
    return 0;
  }
  const dir = join(MODELS_DIR, modelDir(entry));
  const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;
  let received = 0;
  const counting = (file) => (n) => {
    received += n;
    onProgress?.({ file, received });
  };

  if (source.type === "url") {
    for (const file of source.files) {
      const dest = join(dir, file.path);
      if (await exists(dest)) {
        log(`  skip   ${file.path} (already downloaded)`);
        continue;
      }
      const { sha256, bytes } = await save(file.url, dest, { onBytes: counting(file.path), signal });
      if (file.sha256 && sha256 !== file.sha256) {
        await rm(dest);
        throw new Error(`${entry.id}/${file.path}: sha256 ${sha256}, expected ${file.sha256}`);
      }
      log(`  saved  ${file.path} (${mb(bytes)})${file.sha256 ? "" : `  sha256 ${sha256} (not pinned yet)`}`);
    }
    // Raw ONNX models load through Transformers.js with a stub config.
    await writeFile(join(dir, "config.json"), `${JSON.stringify(source.config)}\n`);
    return received;
  }

  // Hugging Face. An unknown repo is taken to be a Whisper export.
  const files = source.files ?? resolve("whisper-base.en").source.files;
  for (const file of files) {
    const dest = join(dir, file);
    if (await exists(dest)) {
      log(`  skip   ${file} (already downloaded)`);
      continue;
    }
    const { bytes } = await save(hfUrl(source.repo, file), dest, { onBytes: counting(file), signal });
    log(`  saved  ${file} (${mb(bytes)})`);
  }
  return received;
}
