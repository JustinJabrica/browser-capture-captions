// What every source, setting, measurement, control, event and term on the
// bench means, for someone new to media capture: a short answer for the
// hover bubble and a longer article for the window and the guide. The
// topics are written in two files: topics-media.js (the browser's capture
// APIs: sources, settings, recording formats, the APIs the Browser view
// lists, and the words of art) and topics-bench.js (this bench: getting
// started, the analysis and its measurements, takes, the controls and the
// events log).
//
// A topic: { section, name, short, what?, how?, best?, support?, related? }
//   section  where the guide lists it (SECTIONS)
//   short    one or two sentences, plain words
//   what / how / best   the article's paragraphs: what it is, how it works, when to use it
//   support  how Chrome/Edge, Firefox and Safari differ, where they do
//   related  other topic ids, linked at the end of the article
// Text may use <b>, <i> and <code>; nothing else.

import { MEDIA_TOPICS } from "./topics-media.js";
import { BENCH_TOPICS } from "./topics-bench.js";
import { WEBCODECS_TOPICS } from "./topics-webcodecs.js";

export const SECTIONS = [
  ["start", "Getting started"],
  ["sources", "Sources"],
  ["settings", "Capture settings"],
  ["recording", "Recording and formats"],
  ["analysis", "Analysis and measurements"],
  ["takes", "Takes and comparing"],
  ["controls", "Buttons, views and status"],
  ["events", "The events log"],
  ["apis", "Browser APIs"],
  ["terms", "Words and abbreviations"],
];

export const TOPICS = { ...MEDIA_TOPICS, ...BENCH_TOPICS, ...WEBCODECS_TOPICS };
