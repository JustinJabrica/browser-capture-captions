// CTC forced alignment on synthetic emissions: each frame strongly favours
// one token, so the right answer is known.

import assert from "node:assert/strict";
import { test } from "node:test";
import { alignFrames, logSoftmax, toSeconds, wordTokens } from "../../src/speech/align/ctc.js";

const VOCAB = ["<pad>", "|", "A", "B", "C", "'"];
const charToId = new Map(VOCAB.map((c, i) => [c, i]).filter(([c]) => c.length === 1 && c !== "|"));
const opts = { charToId, blank: 0, delimiter: 1 };

// Frames given as token strings ("_" for blank): logits with that token at +8.
function emissions(frames) {
  const logits = new Float32Array(frames.length * VOCAB.length);
  frames.forEach((tok, f) => {
    const id = tok === "_" ? 0 : VOCAB.indexOf(tok);
    logits[f * VOCAB.length + id] = 8;
  });
  return logSoftmax(logits, frames.length, VOCAB.length);
}

test("logSoftmax rows sum to one", () => {
  const e = emissions(["A", "_"]);
  for (let f = 0; f < 2; f++) {
    const sum = [...e.slice(f * VOCAB.length, (f + 1) * VOCAB.length)].reduce((a, x) => a + Math.exp(x), 0);
    assert.ok(Math.abs(sum - 1) < 1e-5);
  }
});

test("wordTokens keeps the characters the model knows", () => {
  assert.deepEqual(wordTokens(["ab", "15%", "c'a"], charToId), [[2, 3], [], [4, 5, 2]]);
});

test("words span their characters' frames", () => {
  const frames = ["_", "A", "A", "B", "_", "|", "C", "_"];
  const r = alignFrames(emissions(frames), frames.length, VOCAB.length, ["ab", "c"], opts);
  assert.deepEqual(r, [
    { word: "ab", start: 1, end: 4 },
    { word: "c", start: 6, end: 7 },
  ]);
});

test("a doubled letter needs its blank and keeps both frames", () => {
  const frames = ["A", "_", "A", "_", "|", "B"];
  const [aa, b] = alignFrames(emissions(frames), frames.length, VOCAB.length, ["aa", "b"], opts);
  assert.deepEqual([aa.start, aa.end], [0, 3]);
  assert.deepEqual([b.start, b.end], [5, 6]);
});

test("a word with nothing to align is estimated between its neighbours", () => {
  const frames = ["A", "_", "_", "_", "|", "B"];
  const aligned = alignFrames(emissions(frames), frames.length, VOCAB.length, ["a", "15", "%", "b"], opts);
  assert.equal(aligned[1].start, null);
  const words = toSeconds(aligned, 0.02, 0.12);
  assert.deepEqual(words[0], { word: "a", start: 0, end: 0.02 });
  assert.equal(words[1].estimated, true);
  assert.equal(words[1].start, 0.02);
  assert.equal(words[2].end, 0.1); // the gap up to "b", split in two
  assert.deepEqual(words[3], { word: "b", start: 0.1, end: 0.12 });
});

test("more tokens than frames, or nothing alignable, leaves every word unaligned", () => {
  const frames = ["A"];
  const r = alignFrames(emissions(frames), frames.length, VOCAB.length, ["abc"], opts);
  assert.deepEqual(r, [{ word: "abc", start: null, end: null }]);
  const words = toSeconds(alignFrames(emissions(frames), 1, VOCAB.length, ["42"], opts), 0.02, 1);
  assert.deepEqual(words, [{ word: "42", start: 0, end: 1, estimated: true }]);
});
