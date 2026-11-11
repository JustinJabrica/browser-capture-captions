// The second pass's pure parts: which stretches of a recording the model is
// given, the pass itself with a stand-in detector and model, and the word
// error rate that compares two transcripts.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { transcriptErrors, wordErrors } from "../../src/captions/wer.js";
import { createEngine, config } from "../../src/speech/core.js";
import { planSpeechParts, runFilePass } from "../../src/speech/file-pass.js";
import { createEnergyDetector, frameScores, speechRegions } from "../../src/speech/vad.js";
import { parseWav } from "../../src/wav.js";

test("planSpeechParts: regions a pause apart are separate utterances; closer ones join", () => {
  const parts = planSpeechParts(
    [
      [1, 2],
      [2.5, 4], // 0.5 s after the first: the same utterance
      [6, 7], // 2 s later: another
    ],
    { duration: 10 },
  );
  assert.deepEqual(parts.map((p) => [p.start, p.end]), [[0.9, 4.1], [5.9, 7.1]], "the speech, with 100 ms of lead-in and tail");
  assert.deepEqual(parts.map((p) => [p.from, p.to]), [[0.7, 4.3], [5.7, 7.3]], "the model hears 300 ms either side");
  assert.deepEqual(planSpeechParts([[1, 2], [2.5, 4]], { duration: 10, mergeGap: 0.3 }).length, 2);
  assert.deepEqual(planSpeechParts([], { duration: 10 }), []);
});

test("planSpeechParts: parts never overlap, and stay inside the recording", () => {
  // Two utterances 0.9 s apart: each gets half the gap at most.
  const close = planSpeechParts([[0.05, 2], [2.9, 5.95]], { duration: 6 });
  assert.deepEqual(close.map((p) => [p.from, p.to]), [[0, 2.3], [2.6, 6]]);
  assert.deepEqual(close.map((p) => [p.start, p.end]), [[0, 2.1], [2.8, 6]]);
  const tight = planSpeechParts([[1, 2], [2.9, 4]], { duration: 10, mergeGap: 0.8, pad: 1 });
  assert.equal(tight[0].to, 2.45);
  assert.equal(tight[1].from, 2.45);
});

test("planSpeechParts: no part is longer than Whisper hears", () => {
  // 60 s without a pause is cut into three; joins stop at the limit too.
  const long = planSpeechParts([[0, 60]], { duration: 60 });
  assert.equal(long.length, 3);
  assert.ok(long.every((p) => p.to - p.from <= 25 + 0.6 + 1e-9));
  assert.deepEqual(long.map((p) => [p.from, p.to]), [[0, 20], [20, 40], [40, 60]]);
  const many = planSpeechParts(Array.from({ length: 20 }, (_, i) => [i * 3, i * 3 + 2.5]), { duration: 60 });
  assert.ok(many.length >= 3 && many.every((p) => p.end - p.start <= 25 + 0.2 + 1e-9), JSON.stringify(many.map((p) => [p.start, p.end])));
});

test("runFilePass: the detector's speech, each part to the model, text cleaned and placed", async () => {
  const asked = [];
  const progress = [];
  const texts = ["Speech recognition now works. [BLANK_AUDIO]", "Thank you.", "la la la la la la la la", "Everything runs locally."];
  const result = await runFilePass(
    { duration: 30 },
    {
      speech: async () => [[1, 3], [6, 6.4], [10, 14], [20, 22]],
      transcribe: async (from, to) => {
        asked.push([from / 16000, to / 16000]);
        const n = asked.length - 1;
        return { text: texts[n], confidence: n === 1 ? 0.2 : 0.9, ms: 100, words: n === 0 ? [{ word: "Speech", start: 0.35, end: 0.8 }, { word: "works.", start: 1.5, end: 9 }] : undefined };
      },
      onProgress: (p) => progress.push(`${p.phase} ${p.done}/${p.total}`),
    },
  );
  assert.deepEqual(asked, [[0.7, 3.3], [5.7, 6.7], [9.7, 14.3], [19.7, 22.3]]);
  assert.deepEqual(result.segments.map((s) => [s.id, s.start, s.end, s.transcript]), [[1, 0.9, 3.1, "Speech recognition now works."], [2, 19.9, 22.1, "Everything runs locally."]]);
  assert.equal(result.dropped, 2, "a low-confidence 'Thank you.' and a loop");
  // Word times move from the clip to the recording, and can't leave their segment.
  assert.deepEqual(result.segments[0].words, [{ word: "Speech", start: 1.05, end: 1.5 }, { word: "works.", start: 2.2, end: 3.1 }]);
  assert.equal(result.segments[1].words, undefined);
  assert.deepEqual(progress, ["speech 0/1", "speech 1/1", "transcribing 1/4", "transcribing 2/4", "transcribing 3/4", "transcribing 4/4"]);
});

test("runFilePass: check() stops it; a recording with no speech gives no segments", async () => {
  await assert.rejects(runFilePass({ duration: 5 }, { speech: async () => [[1, 2]], transcribe: async () => ({ text: "x", confidence: 1 }), check: () => { throw new Error("stopped"); } }), /stopped/);
  const quiet = await runFilePass({ duration: 5 }, { speech: async () => null, transcribe: async () => assert.fail("nothing to transcribe") });
  assert.deepEqual([quiet.segments, quiet.parts, quiet.dropped], [[], [], 0]);
});

test("the whole-file detector and the planner find the two sentences of two-sentences.wav", async () => {
  const audio = parseWav(await readFile(new URL("../fixtures/two-sentences.wav", import.meta.url))).channels[0];
  const detector = createEnergyDetector();
  const regions = speechRegions(await frameScores(audio, detector), detector.threshold);
  const parts = planSpeechParts(regions, { duration: audio.length / 16000 });
  assert.equal(parts.length, 2, JSON.stringify(parts));
  assert.ok(Math.abs(parts[0].start - 0.52) < 0.1 && Math.abs(parts[1].start - 5.44) < 0.15, JSON.stringify(parts.map((p) => [p.start, p.end])));
});

test("wordErrors: the fewest words to change, add or remove, over the reference's length", () => {
  assert.deepEqual(wordErrors("The quick brown fox.", "the quick brown fox"), { words: 4, errors: 0, rate: 0 });
  assert.deepEqual(wordErrors("the quick brown fox", "the quick brown box"), { words: 4, errors: 1, rate: 0.25 });
  assert.deepEqual(wordErrors("the quick brown fox", "the brown fox"), { words: 4, errors: 1, rate: 0.25 }, "a missing word");
  assert.deepEqual(wordErrors("the quick brown fox", "the very quick brown fox jumps"), { words: 4, errors: 2, rate: 0.5 }, "two extra words");
  assert.deepEqual(wordErrors("don't stop", "Don't. Stop!"), { words: 2, errors: 0, rate: 0 });
  assert.deepEqual(wordErrors("", "anything at all"), { words: 0, errors: 3, rate: null });
  assert.deepEqual(wordErrors("something", ""), { words: 1, errors: 1, rate: 1 });
});

test("transcriptErrors compares two transcripts as running text, however they are cut", () => {
  const whole = [{ transcript: "The quick brown fox jumps over the lazy dog." }];
  const cut = [{ transcript: "The quick brown fox" }, { transcript: "jumps over the lazy dog." }];
  assert.equal(transcriptErrors(whole, cut).errors, 0);
  assert.deepEqual(transcriptErrors(whole, [{ transcript: "The quick brown fox jumps over the" }]), { words: 9, errors: 2, rate: 0.222 });
});

test("createEngine: a second engine has the shared settings as they are, with its own in place of some", () => {
  const second = createEngine({ model: "whisper-small.en", words: "whisper" });
  assert.equal(second.settings.model, "whisper-small.en");
  assert.equal(second.settings.words, "whisper");
  assert.equal(second.settings.device, config.device);
  assert.notEqual(second.settings, config, "a copy: later changes to the shared settings don't reach it");
  assert.equal(second.state, "unloaded");
});
