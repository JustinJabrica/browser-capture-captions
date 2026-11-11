// What of the registry is on disk: shared by scripts/download-model.mjs, the
// server's models/index.json and scripts/build-site.mjs.

import { stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MODELS, modelDir, modelFiles } from "../../src/speech/registry.js";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const MODELS_DIR = join(ROOT, "models");

const exists = (path) => stat(path).then((s) => s.isFile(), () => false);

// { id, available, missing?, reason? } for one entry: available means its
// files are all under dir (models/ by default).
export async function modelStatus(entry, dir = MODELS_DIR) {
  const source = entry.source;
  if (!source) return { id: entry.id, available: true };
  if (source.type === "npm") {
    const ok = await exists(join(ROOT, "node_modules", source.package, "package.json"));
    return ok ? { id: entry.id, available: true } : { id: entry.id, available: false, reason: "not-installed" };
  }
  const files = modelFiles(entry) ?? [];
  const missing = [];
  for (const file of files) if (!(await exists(join(dir, modelDir(entry), file)))) missing.push(file);
  if (!missing.length) return { id: entry.id, available: true };
  return { id: entry.id, available: false, reason: "not-downloaded", missing };
}

// What the pages read from models/index.json: { models: [folder] }, the
// folders under dir (one per Hugging Face repo) that hold every file of a
// registry entry. A page loads those from this server and anything else from
// the Hugging Face hub.
export async function modelsIndex(dir = MODELS_DIR) {
  const here = new Set();
  for (const entry of MODELS) {
    if (!modelDir(entry)) continue;
    if ((await modelStatus(entry, dir)).available) here.add(modelDir(entry));
  }
  return { models: [...here].sort() };
}
