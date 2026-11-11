// The explanations cover everything on the bench, and hold together: every
// setting, measurement, column, button, chip and logged event has a topic,
// every related link and code source points at a topic, and every source is
// a well-formed citation.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { APIS } from "../../src/capabilities.js";
import { CODE } from "../../page/explain/code-sources.js";
import { allArticles, article } from "../../page/explain/lookup.js";
import { SOURCES } from "../../page/explain/sources.js";
import { SECTIONS, TOPICS } from "../../page/explain/topics.js";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const all = (re, text) => [...text.matchAll(re)].map((m) => m[1]);
const missing = (ids) => [...new Set(ids)].filter((id) => !TOPICS[id]);

test("every topic has a known section, a name and a short answer, in allowed markup", () => {
  const sections = new Set(SECTIONS.map(([k]) => k));
  for (const [id, t] of Object.entries(TOPICS)) {
    assert.ok(sections.has(t.section), `${id}: section ${t.section}`);
    assert.ok(t.name && t.short, `${id}: name and short`);
    for (const key of ["short", "what", "how", "best", "support"]) {
      const tags = all(/<\/?([a-z0-9]+)/gi, t[key] ?? "");
      assert.deepEqual(tags.filter((tag) => !["b", "i", "code"].includes(tag)), [], `${id}.${key} uses only <b>, <i> and <code>`);
    }
  }
});

test("related links, code sources and cited sources all point at topics", () => {
  const broken = Object.entries(TOPICS).flatMap(([id, t]) => (t.related ?? []).filter((r) => !TOPICS[r]).map((r) => `${id} → ${r}`));
  assert.deepEqual(broken, []);
  assert.deepEqual(missing(Object.keys(CODE)), [], "code-sources.js ids");
  assert.deepEqual(missing(Object.keys(SOURCES)), [], "sources ids");
});

test("every source is a citation with a title and an https link", () => {
  for (const [id, list] of Object.entries(SOURCES)) {
    assert.ok(Array.isArray(list) && list.length, `${id}: a list`);
    for (const s of list) {
      assert.ok(s.title && s.where, `${id}: title and where`);
      assert.match(s.url, /^https:\/\//, `${id}: ${s.url}`);
    }
  }
});

test("every setting in the parameter panel has a topic", () => {
  const app = read("page/app.js");
  const keys = all(/key: "(\w+)",\s*(?:label: "[^"]*",\s*)?type:/g, app);
  assert.ok(keys.length > 30, `${keys.length} parameters found`);
  assert.deepEqual(missing(keys), []);
  assert.deepEqual(missing(all(/id: "(\w+)",\s*title:/g, app).map((g) => `group-${g}`)), [], "tabs");
});

test("every control, chip and view the bench explains has a topic", () => {
  const explain = read("page/explain.js");
  const byId = all(/"[^"\n]+": "([a-z][\w-]*)",/g, explain.slice(explain.indexOf("...byId({"), explain.indexOf("}),", explain.indexOf("...byId({"))));
  assert.ok(byId.length > 20, `${byId.length} controls found`);
  assert.deepEqual(missing(byId), [], "controls");
  assert.deepEqual(missing(all(/, "([\w-]+)"\]/g, explain.slice(explain.indexOf("const TERMS"), explain.indexOf("const TERM_HOSTS")))), [], "terms");
  assert.deepEqual(missing(Object.values({ a: "tag-unsupported", b: "tag-not-as-asked", c: "tag-imported" })), [], "tags");
  const html = read("index.html");
  assert.deepEqual(missing(all(/name="source" value="(\w+)"/g, html).map((v) => `source-${v}`)), [], "sources");
  assert.deepEqual(missing(all(/name="view" value="(\w+)"/g, html).map((v) => `view-${v}`)), [], "views");
  assert.deepEqual(missing(all(/data-filter="(\w+)"/g, html).map((v) => `log-${v}`)), [], "log filters");
});

test("every measurement, Takes column and download has a topic", () => {
  const card = read("page/take-view.js");
  const metricTopics = all(/, "((?:m-|event-)[\w-]+|mimeType|timeslice|webrtc|ccWords)"\]/g, card);
  assert.ok(all(/textButton\("(\w+)"/g, card).length >= 4, "the transcript's downloads");
  assert.ok(metricTopics.length > 25, `${metricTopics.length} measurements found`);
  assert.deepEqual(missing(metricTopics), [], "measurements");
  assert.deepEqual(missing(all(/data-explain="([\w-]+)"/g, card)), [], "card captions");
  const compare = read("page/compare.js");
  assert.deepEqual(missing(all(/^ {2}\[\s*"(\w+)",/gm, compare).map((k) => `col-${k}`)), [], "columns");
  assert.deepEqual(missing(["file", "seekable", "audio", "video", "tap", "pcm16k", "report", ...all(/textButton\("(\w+)"/g, card)].map((k) => `download-${k}`)), [], "downloads");
});

test("every event the log can show has a topic", () => {
  const app = read("page/app.js") + read("page/captions.js");
  const named = all(/log\.add\("(?:call|life|result|error)", "([^"]+)"/g, app);
  // Named at run time: the recorder's events, the track events, the capture method and the loopback's.
  const dynamic = ["start", "dataavailable", "pause", "resume", "stop", "error", "configure", "config", "ended", "mute", "unmute", "connectionstatechange", "captureStream()", "mozCaptureStream()", "Web Audio + canvas.captureStream()", "Web Audio"];
  assert.deepEqual(missing([...named, ...dynamic].map((n) => `event-${n}`)), []);
});

test("every API the Browser view lists has a topic", () => {
  assert.deepEqual(missing(APIS.map(([name]) => `api-${name}`)), []);
});

test("the guide lists every topic once, and articles carry their sources", () => {
  const listed = allArticles().flatMap((s) => s.articles.map((a) => a.id));
  assert.equal(listed.length, Object.keys(TOPICS).length);
  assert.equal(new Set(listed).size, listed.length);
  const withCode = article("tap");
  assert.ok(withCode.sources.some((s) => s.by === "This project's code" && s.url === "src/audio.js"));
});
