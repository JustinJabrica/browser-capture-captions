// What the pages load must work from a static host under a sub-path (GitHub
// Pages serves the site at /<repo>/ and publishes vendor/, not node_modules/):
// no path under node_modules/, no URL that starts at the server's root, and
// every file scripts/vendor.mjs copies is one something imports.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VENDORED } from "../../scripts/vendor.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
const served = [...walk(join(root, "src")), ...walk(join(root, "page")), ...readdirSync(root).filter((f) => f.endsWith(".html")).map((f) => join(root, f))].filter((p) =>
  /\.(js|mjs|html|css)$/.test(p),
);
const name = (p) => relative(root, p).replace(/\\/g, "/");
const text = new Map(served.map((p) => [p, readFileSync(p, "utf8")]));

test("no served file names a path under node_modules", () => {
  const found = served.filter((p) => text.get(p).includes("node_modules"));
  assert.deepEqual(found.map(name), []);
});

test("no served file loads a URL from the server's root", () => {
  // src="/x", href="/x", url(/x), import "/x", from "/x", fetch("/x"), new URL("/x"...)
  const rooted = /(?:\b(?:src|href)\s*=\s*["']|url\(\s*["']?|\bfrom\s+["']|\bimport\s*\(?\s*["']|\b(?:fetch|Worker|URL|addModule)\(\s*["'`])\/(?!\/)/;
  const found = [];
  for (const p of served) {
    for (const [i, line] of text.get(p).split("\n").entries()) if (rooted.test(line)) found.push(`${name(p)}:${i + 1}`);
  }
  assert.deepEqual(found, []);
});

test("every vendored file is installed, and something loads from its folder", () => {
  // Some are named in parts (a folder plus a file name) or loaded by the file
  // beside them (a .wasm by its .js), so the folder is what's looked for.
  const all = [...text.values()].join("\n");
  for (const [from, to] of VENDORED) {
    assert.ok(existsSync(join(root, "node_modules", from)), `${from} is installed`);
    const folder = `vendor/${to.split("/")[0]}/`;
    assert.ok(all.includes(folder), `${folder} is loaded from by a page or module`);
  }
});
