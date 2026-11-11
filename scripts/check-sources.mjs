// Checks every outside link in the explainers (page/explain/sources*.js):
// fetches each one and lists those that don't answer with a success.
//
//   node scripts/check-sources.mjs       (exits 1 if any link fails)
//
// Some sites refuse scripted requests (403, or a bot check) although the page
// is fine in a browser; those are listed separately, as "refused".

import { SOURCES } from "../page/explain/sources.js";

const urls = new Map(); // url -> topic ids citing it
for (const [id, list] of Object.entries(SOURCES)) {
  for (const s of list) urls.set(s.url, [...(urls.get(s.url) ?? []), id]);
}

async function check(url) {
  const attempt = async (method) => {
    const response = await fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(20000), headers: { "User-Agent": "Mozilla/5.0 (capture bench source check)" } });
    return response.status;
  };
  try {
    let status = await attempt("HEAD");
    if (status >= 400) status = await attempt("GET"); // some servers don't do HEAD
    return status;
  } catch (err) {
    return err.name === "TimeoutError" ? "timeout" : err.message;
  }
}

const failed = [];
const refused = [];
const queue = [...urls.keys()];
async function worker() {
  while (queue.length) {
    const url = queue.shift();
    const status = await check(url);
    if (typeof status === "number" && status < 400) continue;
    (status === 403 || status === 429 ? refused : failed).push({ url, status, topics: urls.get(url) });
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

console.log(`${urls.size} links checked.`);
for (const [title, list] of [["Failed", failed], ["Refused (check by hand)", refused]]) {
  if (!list.length) continue;
  console.log(`\n${title}:`);
  for (const { url, status, topics } of list) console.log(`  ${status}  ${url}\n        cited by ${topics.join(", ")}`);
}
process.exit(failed.length ? 1 : 0);
