// Subtitles from a transcript: cues that fit a screen and never overlap, and
// each file format, written so players and Mediabunny's WebVTT parser take it.

import assert from "node:assert/strict";
import { test } from "node:test";
import { CUE_DEFAULTS, asJson, asSrt, asText, asVtt, cueAt, escapeCueText, formatTime, toCues } from "../../src/captions/subtitles.js";

const FOX = { start: 0.56, end: 3.24, transcript: "The quick brown fox jumps over the lazy dog.", speaker: null };
const LONG = {
  start: 10,
  end: 30,
  transcript:
    "Speech recognition now works in Firefox. Everything runs locally on this computer, and nothing is sent to a service. " +
    "The model hears thirty seconds at a time, so a long speech has to be cut somewhere, and the cut should fall where a sentence ends when it can.",
  speaker: null,
};

test("formatTime: hours, minutes, seconds and three digits of milliseconds, rounding with a carry", () => {
  assert.equal(formatTime(0), "00:00:00.000");
  assert.equal(formatTime(3.24), "00:00:03.240");
  assert.equal(formatTime(59.9996), "00:01:00.000");
  assert.equal(formatTime(3725.5), "01:02:05.500");
  assert.equal(formatTime(3.24, ","), "00:00:03,240");
  assert.equal(formatTime(-1), "00:00:00.000");
});

test("toCues: a short utterance is one cue, wrapped to two lines", () => {
  const cues = toCues([FOX]);
  assert.equal(cues.length, 1);
  assert.deepEqual(cues[0].lines, ["The quick brown fox jumps over the lazy", "dog."]);
  assert.equal(cues[0].start, 0.56);
  assert.equal(cues[0].end, 3.24);
  assert.ok(cues[0].lines.every((l) => l.length <= CUE_DEFAULTS.maxChars));
});

test("toCues: a long utterance is cut into cues that fit, in order, without overlap, covering every word once", () => {
  const cues = toCues([FOX, LONG]);
  assert.ok(cues.length >= 5, `${cues.length} cues`);
  for (const [i, cue] of cues.entries()) {
    assert.ok(cue.lines.length <= 2 && cue.lines.every((l) => l.length <= 42), `cue ${i}: ${JSON.stringify(cue.lines)}`);
    assert.ok(cue.end > cue.start && cue.end - cue.start <= 6 + 1e-9, `cue ${i} lasts ${cue.end - cue.start} s`);
    if (i) assert.ok(cue.start >= cues[i - 1].end, `cue ${i} starts at ${cue.start}, before ${cues[i - 1].end}`);
  }
  assert.equal(cues.map((c) => c.lines.join(" ")).join(" "), `${FOX.transcript} ${LONG.transcript}`);
  assert.ok(cues.at(-1).end <= 30 + 1e-9 && cues[1].start >= 10);
  // Where it can, a cue ends with its sentence.
  assert.ok(cues.some((c) => c.text.endsWith("Firefox.")), cues.map((c) => c.text).join(" | "));
});

test("toCues: with word times, cues start and end on their words", () => {
  const words = [
    ["Speech", 1.0, 1.4],
    ["recognition", 1.4, 2.1],
    ["now", 2.3, 2.5],
    ["works", 2.5, 2.9],
    ["in", 2.9, 3.0],
    ["Firefox.", 3.0, 3.7],
    ["Everything", 5.2, 5.8],
    ["runs", 5.8, 6.1],
    ["locally", 6.1, 6.6],
    ["on", 6.6, 6.7],
    ["this", 6.7, 6.9],
    ["computer.", 6.9, 7.5],
  ].map(([word, start, end]) => ({ word, start, end }));
  const cues = toCues([{ start: 0.9, end: 7.6, transcript: words.map((w) => w.word).join(" "), words }], { maxChars: 24 });
  assert.deepEqual(cues.map((c) => [c.start, c.end, c.text]), [
    [1, 3.7, "Speech recognition now\nworks in Firefox."],
    [5.2, 7.5, "Everything runs locally\non this computer."],
  ]);
});

test("toCues: limits are settings; a cue too short to read is held until the next begins", () => {
  const one = toCues([LONG], { maxLines: 1, maxChars: 30 });
  assert.ok(one.every((c) => c.lines.length === 1 && c.text.length <= 30));
  const quick = toCues([LONG], { maxDurationS: 2 });
  assert.ok(quick.every((c) => c.end - c.start <= 2 + 1e-9));
  const short = toCues([
    { start: 1, end: 1.1, transcript: "Yes." },
    { start: 5, end: 6, transcript: "And then some." },
  ]);
  assert.deepEqual([short[0].start, short[0].end], [1, 1.7], "held for the minimum");
  const crowded = toCues([
    { start: 1, end: 1.1, transcript: "Yes." },
    { start: 1.3, end: 2.5, transcript: "And then some." },
  ]);
  assert.deepEqual([crowded[0].end, crowded[1].start], [1.3, 1.3], "but not over the next cue");
});

test("toCues: clipped to the file, empty segments left out, a word longer than a line kept whole", () => {
  const cues = toCues([{ start: 8, end: 12, transcript: "Right at the very end of the file." }, { start: 13, end: 14, transcript: "" }], { duration: 10 });
  assert.ok(cues.length >= 1 && cues.every((c) => c.end <= 10 && c.start < 10), JSON.stringify(cues.map((c) => [c.start, c.end])));
  const word = toCues([{ start: 0, end: 2, transcript: "Pneumonoultramicroscopicsilicovolcanoconiosis is long." }], { maxChars: 20 });
  assert.equal(word[0].lines[0], "Pneumonoultramicroscopicsilicovolcanoconiosis");
});

// Mediabunny's own patterns for a WebVTT file (dist/modules/src/subtitles.js): what the embedded track will be parsed with.
const PREAMBLE = /^WEBVTT(.|\n)*?\n{2}/;
const CUE_HEADER = /(?:(.+?)\n)?((?:\d{2}:)?\d{2}:\d{2}.\d{3})\s+-->\s+((?:\d{2}:)?\d{2}:\d{2}.\d{3})/g;

test("asVtt: a WebVTT file Mediabunny's parser reads, cue for cue", () => {
  const cues = toCues([FOX, LONG]);
  const vtt = asVtt(cues);
  assert.ok(PREAMBLE.test(vtt), "the header and a blank line");
  const headers = [...vtt.matchAll(CUE_HEADER)];
  assert.equal(headers.length, cues.length);
  assert.deepEqual(headers[0].slice(1), ["1", "00:00:00.560", "00:00:03.240"]);
  // No blank line inside a cue (it would end it), and a blank line between cues.
  const blocks = vtt.trimEnd().split("\n\n").slice(1);
  assert.equal(blocks.length, cues.length);
  for (const block of blocks) assert.ok(block.split("\n").length >= 3 && !block.includes("\n\n"));
  assert.equal(asVtt([]), "WEBVTT\n\n");
});

test("asVtt: markup characters are escaped, speakers are voice spans, karaoke tags sit before each later word", () => {
  assert.equal(escapeCueText("a < b && c > d"), "a &lt; b &amp;&amp; c &gt; d");
  const cues = toCues([{ start: 1, end: 3, transcript: "R&D is <fun> --> really.", speaker: 2 }]);
  const vtt = asVtt(cues);
  assert.ok(vtt.includes("<v Speaker 2>R&amp;D is &lt;fun&gt; --&gt; really."), vtt);
  assert.equal([...vtt.matchAll(CUE_HEADER)].length, 1, "the text's own arrow isn't a cue header");
  const words = [
    ["Blue", 1.0, 1.4],
    ["moon", 1.5, 2.0],
    ["rising.", 2.1, 2.8],
  ].map(([word, start, end]) => ({ word, start, end }));
  const karaoke = asVtt(toCues([{ start: 1, end: 2.8, transcript: "Blue moon rising.", words }]), { karaoke: true });
  assert.ok(karaoke.includes("Blue <00:00:01.500>moon <00:00:02.100>rising."), karaoke);
});

test("asSrt: numbered cues with a comma before the milliseconds, plain text", () => {
  const srt = asSrt(toCues([FOX, { start: 5, end: 6, transcript: "Tom & Jerry.", speaker: 1 }]));
  assert.equal(srt, "1\n00:00:00,560 --> 00:00:03,240\nThe quick brown fox jumps over the lazy\ndog.\n\n2\n00:00:05,000 --> 00:00:06,000\nSpeaker 1: Tom & Jerry.\n");
});

test("asText and asJson: an utterance a line; the record as it is, with its source", () => {
  assert.equal(asText([FOX, { ...FOX, start: 65.25, end: 68, speaker: 2 }]), "[0:00.6–0:03.2] The quick brown fox jumps over the lazy dog.\n[1:05.3–1:08.0] Speaker 2: The quick brown fox jumps over the lazy dog.\n");
  assert.equal(asText([FOX], { timestamps: false }), "The quick brown fox jumps over the lazy dog.\n");
  const json = JSON.parse(asJson({ kind: "live", segments: [FOX] }, { source: "take.webm" }));
  assert.deepEqual(json, { source: "take.webm", kind: "live", segments: [FOX] });
});

test("cueAt finds the cue on screen at a time, or none", () => {
  const cues = toCues([FOX, LONG]);
  assert.equal(cueAt(cues, 0.5), null);
  assert.equal(cueAt(cues, 0.56), cues[0]);
  assert.equal(cueAt(cues, 3.24), null, "a cue's end is the first moment it's gone");
  assert.equal(cueAt(cues, 5), null);
  assert.equal(cueAt(cues, cues[3].start + 0.01), cues[3]);
  assert.equal(cueAt([], 1), null);
});
