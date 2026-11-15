// Every file the bench and the guide can load, the libraries copied into
// vendor/ included: what scripts/build-site.mjs publishes and what
// scripts/check-blockers.mjs matches against blockers' lists. One list, so the
// two can't drift apart.

import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT } from "./model-store.mjs";

// The service worker that makes the published site cross-origin isolated
// (scripts/build-site.mjs): [from, under node_modules/] -> [to, at the site's root].
export const COI_SERVICE_WORKER = ["coi-serviceworker/coi-serviceworker.js", "coi-serviceworker.js"];

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

// Paths relative to the repo's root, with forward slashes, in a stable order.
export function siteFiles(root = ROOT) {
  return [
    "index.html",
    "guide.html",
    ...["page", "src", join("test", "fixtures"), "vendor"].flatMap((dir) => walk(join(root, dir)).map((p) => relative(root, p))),
  ].map((p) => p.replace(/\\/g, "/"));
}
