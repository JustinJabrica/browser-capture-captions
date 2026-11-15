// The site npm run build:site makes for GitHub Pages: the files the pages
// load and nothing else, a models/index.json that lists no models, and the
// service worker that makes the pages cross-origin isolated, loaded first.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { buildSite, injectShim, PAGES, SHIM_TAGS } from "../../scripts/build-site.mjs";
import { ROOT } from "../../scripts/lib/model-store.mjs";
import { COI_SERVICE_WORKER, siteFiles } from "../../scripts/lib/site-files.mjs";

let out;
before(async () => {
  out = join(mkdtempSync(join(tmpdir(), "build-site-")), "_site");
  await buildSite({ out, quiet: true });
});
after(() => rmSync(join(out, ".."), { recursive: true, force: true }));

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });

test("the site holds the files the pages load, the service worker and models/index.json, and nothing else", () => {
  const built = walk(out).map((p) => relative(out, p).replace(/\\/g, "/")).sort();
  const expected = [...siteFiles(), COI_SERVICE_WORKER[1], "models/index.json"].sort();
  assert.deepEqual(built, expected);
  assert.ok(!built.some((p) => /^(node_modules|scripts|\.)/.test(p) || p.split("/").some((part) => part.startsWith("."))), "a file the site shouldn't publish");
});

test("the files are copied as they are, the pages aside", () => {
  for (const path of siteFiles()) if (!PAGES.includes(path)) assert.ok(readFileSync(join(out, path)).equals(readFileSync(join(ROOT, path))), path);
});

test("models/index.json lists no models: they come from the Hugging Face hub", () => {
  assert.deepEqual(JSON.parse(readFileSync(join(out, "models", "index.json"), "utf8")), { models: [] });
});

test("both pages load the service worker before anything else runs, with COEP: require-corp", () => {
  for (const name of PAGES) {
    const html = readFileSync(join(out, name), "utf8");
    const at = SHIM_TAGS.map((tag) => html.indexOf(tag));
    assert.ok(at.every((i) => i > html.indexOf("<head>")), `${name}: the shim's tags aren't in <head>`);
    assert.ok(at[0] < at[1] && at[1] < html.indexOf("page/load-check.js") && at[1] < html.indexOf('type="module"'), `${name}: the shim isn't first`);
    assert.match(SHIM_TAGS[0], /coepCredentialless: \(\) => false/);
    // The tags are all that changed.
    const eol = html.includes("\r\n") ? "\r\n" : "\n";
    assert.equal(html.replace(SHIM_TAGS.map((tag) => `${tag}${eol}    `).join(""), ""), readFileSync(join(ROOT, name), "utf8"));
  }
});

test("the shim keeps the anchor's indentation, and a page without the anchor fails the build", () => {
  assert.equal(injectShim('<head>\n\t<script src="page/load-check.js"></script>'), `<head>\n\t${SHIM_TAGS.join("\n\t")}\n\t<script src="page/load-check.js"></script>`);
  assert.throws(() => injectShim("<head></head>", "x.html"), /x\.html has no/);
});

test("the build won't empty the repo or a folder that holds it", async () => {
  await assert.rejects(buildSite({ out: ROOT, quiet: true }), /holds the repo/);
  await assert.rejects(buildSite({ out: join(ROOT, ".."), quiet: true }), /holds the repo/);
});
