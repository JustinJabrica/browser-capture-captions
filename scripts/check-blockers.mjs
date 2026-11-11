// Checks that no ad or tracker blocker would block the bench's own files.
// Blockers' lists include rules for any site, by file name: EasyPrivacy's
// "/analyse.js" blocked src/analyse.js (now src/take-report.js) in a Firefox
// with uBlock Origin, so nothing on the page ran. This downloads the lists
// uBlock Origin turns on by default and matches every file the pages load.
//
//   node scripts/check-blockers.mjs       (exits 1 if any file would be blocked)
//
// A rough Adblock Plus syntax matcher: only rules that block a first-party
// request on any site, so domain-anchored rules (||example.com), rules
// limited to other sites, modifier rules (redirects, permissions, removeparam
// and the like) and regex rules are skipped. Exceptions (@@) are listed.

import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const LISTS = [
  "https://easylist.to/easylist/easylist.txt",
  "https://easylist.to/easylist/easyprivacy.txt",
  "https://ublockorigin.github.io/uAssets/filters/filters.txt",
  "https://ublockorigin.github.io/uAssets/filters/privacy.txt",
];

// Every file the bench and the guide can load, the libraries copied into vendor/ included.
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? files(p) : [p];
  });
}
const paths = [
  "index.html",
  "guide.html",
  ...files(join(root, "page")),
  ...files(join(root, "src")),
  ...files(join(root, "test", "fixtures")),
  ...files(join(root, "vendor")),
].map((p) => relative(root, resolve(root, p)).replace(/\\/g, "/"));
const urls = paths.map((p) => `http://127.0.0.1:8100/${p}`);

function toRegex(pattern) {
  if (pattern.startsWith("||")) return null; // domain-anchored
  let re = "";
  let i = 0;
  if (pattern.startsWith("|")) {
    re += "^";
    i = 1;
  }
  for (; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") re += ".*";
    else if (c === "^") re += "(?:[^\\w.%-]|$)";
    else if (c === "|" && i === pattern.length - 1) re += "$";
    else re += c.replace(/[.+?{}()[\]\\/$|]/g, "\\$&");
  }
  return new RegExp(re, "i");
}

const TYPES = ["script", "image", "stylesheet", "css", "xmlhttprequest", "xhr", "media", "subdocument", "frame", "ping", "font", "websocket", "other", "object", "document", "doc"];
const LOADED = ["script", "stylesheet", "css", "image", "media", "xmlhttprequest", "xhr"];

function rules(text, list) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("!") || line.startsWith("[") || /#[@?$%]?#/.test(line)) continue;
    const exception = line.startsWith("@@");
    const body = exception ? line.slice(2) : line;
    const [pattern, options = ""] = body.split(/\$(?=[^/]*$)/);
    if (!pattern || (pattern.startsWith("/") && pattern.endsWith("/") && pattern.length > 2)) continue;
    const opts = options.split(",").filter(Boolean);
    if (opts.includes("third-party") || opts.includes("3p")) continue;
    if (opts.some((o) => /^(redirect|redirect-rule|permissions|removeparam|csp|header|replace|urlskip|uritransform|urltransform|badfilter|generichide|elemhide|specifichide|ghide|ehide|shide)\b/.test(o))) continue;
    const sites = opts.find((o) => o.startsWith("domain=") || o.startsWith("from="));
    if (sites) {
      const list = sites.split("=")[1].split("|");
      if (list.some((d) => !d.startsWith("~")) || list.some((d) => /127\.0\.0\.1|localhost/.test(d))) continue;
    }
    const types = opts.filter((o) => TYPES.includes(o.replace(/^~/, "")));
    if (types.length && !types.some((t) => LOADED.includes(t))) continue;
    const re = toRegex(pattern);
    if (re) out.push({ re, line, list, exception });
  }
  return out;
}

const all = [];
for (const url of LISTS) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) {
    console.error(`Couldn't download ${url}: HTTP ${response.status}`);
    process.exit(2);
  }
  all.push(...rules(await response.text(), url.split("/").slice(-2).join("/")));
}

let blocked = 0;
for (const url of urls) {
  const hits = all.filter((r) => r.re.test(url));
  const blocks = hits.filter((h) => !h.exception);
  const allowed = hits.some((h) => h.exception);
  if (!blocks.length) continue;
  if (!allowed) blocked++;
  console.log(`${allowed ? "allowed by an exception" : "BLOCKED"}  ${url.replace("http://127.0.0.1:8100", "")}`);
  for (const h of hits.slice(0, 5)) console.log(`    ${h.exception ? "allow" : "block"}  ${h.line}   (${h.list})`);
}
console.log(`${urls.length} files checked against ${all.length.toLocaleString()} rules from ${LISTS.length} lists: ${blocked} would be blocked.`);
process.exit(blocked ? 1 : 0);
