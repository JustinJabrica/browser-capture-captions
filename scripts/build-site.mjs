// Builds the site GitHub Pages publishes (.github/workflows/pages.yml) into
// _site/: the files the pages load (scripts/lib/site-files.mjs), as they are
// in the repo, and two things a static host needs that the local server does
// without.
//
//   node scripts/build-site.mjs [out]      (default _site/)
//
// - models/index.json, written as a file: server.mjs works it out at each
//   request. It lists no models, since none are published (they are tens of
//   MB each and the Hugging Face hub has them), so the page fetches the one it
//   uses from the hub, and the browser keeps it.
// - Cross-origin isolation. server.mjs sends COOP and COEP headers, so
//   transcription runs with multi-threaded WebAssembly; GitHub Pages can't
//   send headers. coi-serviceworker (MIT) is a service worker that adds them
//   to every response it serves, so the page reloads once on the first visit
//   and is isolated from then on. It sits at the site's root, so its scope is
//   the whole site, and the two pages load it first. The page is told to use
//   COEP: require-corp, as server.mjs does: the shim's default elsewhere than
//   Chrome and Firefox is credentialless, which Safari doesn't support.
//
// Run as a script, it vendors first (scripts/vendor.mjs), so _site/ has the
// libraries package-lock.json names even when npm ran no install scripts.

import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, modelsIndex } from "./lib/model-store.mjs";
import { COI_SERVICE_WORKER, siteFiles } from "./lib/site-files.mjs";
import { vendor } from "./vendor.mjs";

export const SITE_DIR = join(ROOT, "_site");
export const PAGES = ["index.html", "guide.html"];

// What goes in each page's <head>, before page/load-check.js.
const ANCHOR = '<script src="page/load-check.js"></script>';
export const SHIM_TAGS = ["<script>window.coi = { coepCredentialless: () => false };</script>", `<script src="${COI_SERVICE_WORKER[1]}"></script>`];

export function injectShim(html, name = "page") {
  const at = html.indexOf(ANCHOR);
  if (at < 0) throw new Error(`${name} has no ${ANCHOR} to put the service worker before`);
  const indent = /[ \t]*$/.exec(html.slice(0, at))[0];
  const eol = html.includes("\r\n") ? "\r\n" : "\n";
  return html.slice(0, at) + SHIM_TAGS.map((tag) => `${tag}${eol}${indent}`).join("") + html.slice(at);
}

export async function buildSite({ out = SITE_DIR, quiet = false } = {}) {
  // out is emptied first, so it can't be the repo or a folder that holds it.
  out = resolve(out);
  const rel = relative(out, ROOT);
  if (!rel || (!rel.startsWith("..") && !isAbsolute(rel))) throw new Error(`Won't build into ${out}: it holds the repo`);
  rmSync(out, { recursive: true, force: true });
  const files = siteFiles();
  let bytes = 0;
  const copy = (from, to) => {
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    bytes += statSync(to).size;
  };
  for (const path of files) copy(join(ROOT, path), join(out, path));

  copy(join(ROOT, "node_modules", COI_SERVICE_WORKER[0]), join(out, COI_SERVICE_WORKER[1]));
  for (const name of PAGES) writeFileSync(join(out, name), injectShim(readFileSync(join(out, name), "utf8"), name));

  // No folder holds any model: modelsIndex() of a folder that isn't there.
  const index = JSON.stringify(await modelsIndex(join(out, "models", "none")));
  mkdirSync(join(out, "models"), { recursive: true });
  writeFileSync(join(out, "models", "index.json"), index);

  const count = files.length + 2;
  if (!quiet) console.log(`${out}: ${count} files, ${(bytes / 1e6).toFixed(1)} MB`);
  return { out, count, bytes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    vendor();
    await buildSite({ out: process.argv[2] ? resolve(process.argv[2]) : SITE_DIR });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
