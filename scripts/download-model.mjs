// Downloads speech models from src/speech/registry.js into ./models, so the
// bench loads them from this server and works offline. Without them the
// bench fetches a model from the Hugging Face hub the first time it's used,
// and the browser keeps it.
//
//   node scripts/download-model.mjs                    the default model (Whisper base.en)
//   node scripts/download-model.mjs whisper-tiny.en silero-vad
//   node scripts/download-model.mjs onnx-community/whisper-tiny   (any Hugging Face repo of a Whisper export)
//   node scripts/download-model.mjs --list             every option, and what's downloaded
//   node scripts/download-model.mjs --check [ids]      that every listed file exists upstream, with sizes

import { MODELS, resolve } from "../src/speech/registry.js";
import { downloadEntry, get, hfUrl } from "./lib/download.mjs";
import { modelStatus } from "./lib/model-store.mjs";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const names = args.filter((a) => !a.startsWith("--"));
const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;

function entryFor(name) {
  const entry = resolve(name);
  if (!entry) throw new Error(`Unknown model "${name}"; see --list`);
  return entry;
}

async function list() {
  for (const entry of MODELS) {
    const status = await modelStatus(entry);
    const state = status.available ? "ready" : status.reason;
    const size = entry.sizeMB != null ? `${entry.sizeMB} MB` : "";
    const flagsText = [entry.default && "default", ...(entry.requires ?? [])].filter(Boolean).join(", ");
    console.log(`${entry.id.padEnd(36)} ${entry.kind.padEnd(10)} ${entry.runtime.padEnd(13)} ${size.padStart(9)}  ${entry.status.padEnd(10)} ${state.padEnd(15)} ${flagsText}`);
  }
}

async function check(entries) {
  let failed = 0;
  for (const entry of entries) {
    const source = entry.source;
    if (source?.type !== "hf" && source?.type !== "url") continue;
    const urls = source.type === "hf" ? (source.files ?? []).map((file) => [file, hfUrl(source.repo, file)]) : source.files.map((f) => [f.path, f.url]);
    let total = 0;
    const problems = [];
    for (const [file, url] of urls) {
      const res = await get(url, { method: "HEAD" });
      if (!res.ok) problems.push(`${file}: HTTP ${res.status}`);
      else total += Number(res.headers.get("x-linked-size") ?? res.headers.get("content-length") ?? 0);
    }
    if (problems.length) failed++;
    console.log(
      `${problems.length ? "FAIL" : "ok  "}  ${entry.id.padEnd(36)} ${mb(total).padStart(10)}` +
        (entry.sizeMB != null ? `  (registry ${entry.sizeMB} MB)` : "") +
        (problems.length ? `\n      ${problems.join("\n      ")}` : ""),
    );
  }
  process.exitCode = failed ? 1 : 0;
}

if (flags.has("--list")) await list();
else if (flags.has("--check")) await check(names.length ? names.map(entryFor) : MODELS);
else {
  const entries = names.length ? names.map(entryFor) : MODELS.filter((m) => m.default && m.source);
  for (const entry of entries) {
    console.log(entry.id);
    await downloadEntry(entry, { log: console.log });
  }
  console.log("\nModels ready in models/");
}
