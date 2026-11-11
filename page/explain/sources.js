// Where each explanation's facts come from: specifications, MDN, browser
// compatibility data, browser vendors' documentation and bug trackers.
// Written with the topics (every URL fetched and checked when it was added;
// npm run check:sources checks them again). SOURCES[id] = [{ title, by, year?, where, url }].

import { MEDIA_SOURCES } from "./sources-media.js";
import { BENCH_SOURCES } from "./sources-bench.js";
import { WEBCODECS_SOURCES } from "./sources-webcodecs.js";

export const SOURCES = { ...MEDIA_SOURCES, ...BENCH_SOURCES, ...WEBCODECS_SOURCES };
