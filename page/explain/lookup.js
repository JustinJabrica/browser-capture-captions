// Builds an explainer article from a topic in topics.js, with its sources
// (sources.js, and code-sources.js for the bench's own features) and any
// fuller text from details.js. No DOM, so the unit tests and the guide page
// share it with the bench.
//
// article(id) -> { id, section, kind, name, short, what, how, best, support?,
//   related, sources?: [{ title, by, year, where, url }] } or null

import { CODE, REPO } from "./code-sources.js";
import { DETAILS } from "./details.js";
import { SOURCES } from "./sources.js";
import { SECTIONS, TOPICS } from "./topics.js";

export { SECTIONS };

const sectionName = (s) => SECTIONS.find(([k]) => k === s)?.[1] ?? "";

// An explainer article by topic id. opts is accepted for the bench's sake
// (explain.js passes { bench }); this bench has one version of each topic.
export function article(id) {
  const topic = TOPICS[id];
  if (!topic) return null;
  const code = (CODE[id] ?? []).map((path) => ({ title: path, by: "This project's code", where: REPO ? "GitHub" : "In this repository", url: REPO + path }));
  const listed = [...(SOURCES[id] ?? []), ...code];
  const sources = listed.filter((s, i, all) => all.findIndex((t) => t.url === s.url) === i);
  // Fuller text from the research, where the topic's own is missing or a fragment.
  const more = DETAILS[id] ?? {};
  const fuller = (own, extra) => (extra && (own ?? "").length < 80 ? extra : own);
  return { id, kind: sectionName(topic.section), ...topic, what: fuller(topic.what, more.what), how: fuller(topic.how, more.how), sources };
}

// Every article, for the guide: [{ section, title, articles }] in guide order.
export function allArticles() {
  const articles = Object.keys(TOPICS).map((id) => article(id));
  return SECTIONS.map(([key, title]) => ({ section: key, title, articles: articles.filter((a) => a.section === key) }));
}

// Plain text of an article's short answer (for titles, search and the bubble's fallback).
export const plain = (html = "") => html.replace(/<[^>]+>/g, "");
