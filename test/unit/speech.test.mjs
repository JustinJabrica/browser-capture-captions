// The speech engine's pure parts: the registry, the settings and where a
// model's files come from, the transcript helpers, the resampler, the
// segmenter (with its cut, which the bench uses at a take's boundaries) and
// the speech detectors. Carried over from
// automatic-speech-recognition-and-diarization's unit tests, for what came over.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Resampler, SAMPLE_RATE, Segmenter, chunkBounds } from "../../src/speech/audio.js";
import { cleanTranscript, config, isDegenerate, loadedModel, modelLanguage, modelLanguages, modelSource, promptFromPhrases } from "../../src/speech/core.js";
import { KINDS, MODELS, asrFor, defaultFor, modelDir, modelFiles, ofKind, resolve, timestampedFor } from "../../src/speech/registry.js";
import { createEnergyDetector, createWebRtcDetector, frameScores, speechRegions, speechWithin } from "../../src/speech/vad.js";
import { VENDORED } from "../../scripts/vendor.mjs";
import { parseWav } from "../../src/wav.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const fixture = async (name) => parseWav(await readFile(join(ROOT, "test", "fixtures", name))).channels[0];

// Runs fn with config changed, then puts it back.
function withConfig(changes, fn) {
  const saved = { ...config };
  Object.assign(config, changes);
  try {
    return fn();
  } finally {
    Object.assign(config, saved);
  }
}

// --- Registry ----------------------------------------------------------------------

test("registry: every entry is well formed, and runs in a browser", () => {
  const ids = new Set();
  for (const m of MODELS) {
    assert.ok(!ids.has(m.id), `duplicate id ${m.id}`);
    ids.add(m.id);
    assert.ok(KINDS.includes(m.kind), `${m.id}: kind ${m.kind}`);
    assert.ok(["transformers", "ort", "wasm", "js"].includes(m.runtime), `${m.id}: runtime ${m.runtime}`);
    assert.ok(m.label && m.licence, `${m.id}: label and licence`);
    assert.ok(["verified", "unverified"].includes(m.status), `${m.id}: status`);
    for (const r of m.requires ?? []) assert.equal(r, "webgpu", `${m.id}: requires ${r}`);
    const s = m.source;
    if (s?.type === "hf") {
      assert.match(s.repo, /^[\w.-]+\/[\w.-]+$/);
      assert.ok(s.files.length, `${m.id}: files`);
      assert.ok(m.loadMB && (m.loadMB.wasm || m.loadMB.webgpu), `${m.id}: what a device loads`);
    } else if (s?.type === "url") {
      assert.ok(s.dir && s.config?.model_type, `${m.id}: dir and config stub`);
      assert.equal(m.hub, false, `${m.id}: a raw download can't come from the hub`);
      for (const f of s.files) {
        assert.match(f.url, /^https:\/\//);
        assert.match(f.sha256, /^[0-9a-f]{64}$/);
      }
    } else if (s?.type === "npm") {
      assert.ok(VENDORED.some(([from]) => from.startsWith(`${s.package}/`)), `${m.id}: ${s.package} is copied into vendor/`);
    }
    if (m.sizeMB != null) assert.ok(m.sizeMB <= 2048, `${m.id}: at most 2 GB`);
  }
});

test("registry: one default transcription model and detector; ids and repos both resolve", () => {
  assert.equal(defaultFor("asr").id, "whisper-base.en");
  assert.equal(defaultFor("vad").id, "energy");
  assert.equal(resolve("whisper-tiny.en"), resolve("onnx-community/whisper-tiny.en"));
  assert.equal(resolve("Xenova/wav2vec2-base-960h", { kind: "asr" }).id, "wav2vec2-base-960h");
  assert.equal(resolve("Xenova/wav2vec2-base-960h", { kind: "alignment" }).id, "wav2vec2-align");
  assert.equal(resolve("someone/whisper-medium").source.repo, "someone/whisper-medium");
  assert.equal(resolve("not a model"), null);
  assert.equal(modelDir(resolve("silero-vad")), "snakers4/silero-vad");
  assert.deepEqual(modelFiles(resolve("silero-vad")), ["config.json", "onnx/model.onnx"]);
  assert.equal(modelFiles(resolve("energy")).length, 0);
});

test("registry: every Whisper model has its timestamped export, and back", () => {
  for (const m of ofKind("asr").filter((m) => m.timestamped)) {
    const timed = timestampedFor(m.id);
    assert.equal(timed?.kind, "words", m.id);
    assert.equal(asrFor(timed.id), m, m.id);
  }
  assert.equal(timestampedFor("wav2vec2-base-960h"), null);
});

// --- Settings ----------------------------------------------------------------------

test("modelSource: a model on this server loads from it and nowhere else; any other from the hub", () => {
  withConfig({ localModels: ["onnx-community/whisper-tiny.en"], modelPath: "http://127.0.0.1:8100/models/" }, () => {
    assert.deepEqual(modelSource("whisper-tiny.en", "asr"), { model: "onnx-community/whisper-tiny.en", localModelPath: "http://127.0.0.1:8100/models/", allowRemoteModels: false, from: "same-origin" });
    assert.deepEqual(modelSource("whisper-base.en", "asr"), { model: "onnx-community/whisper-base.en", localModelPath: null, allowRemoteModels: true, from: "hub" });
    assert.equal(modelSource("someone/whisper-medium", "asr").model, "someone/whisper-medium");
  });
});

test("loadedModel: word times from Whisper load the timestamped export in the model's place", () => {
  withConfig({ model: "whisper-tiny.en", words: "off" }, () => assert.equal(loadedModel().id, "whisper-tiny.en"));
  withConfig({ model: "whisper-tiny.en", words: "whisper" }, () => assert.equal(loadedModel().id, "whisper-tiny.en-timestamped"));
  withConfig({ model: "whisper-tiny.en", words: "align" }, () => assert.equal(loadedModel().id, "whisper-tiny.en"));
  withConfig({ model: "wav2vec2-base-960h", words: "whisper" }, () => assert.equal(loadedModel().id, "wav2vec2-base-960h"));
});

test("modelLanguage follows the registry: English-only models refuse French early", () => {
  for (const model of ["whisper-base.en", "onnx-community/whisper-tiny.en", "Xenova/wav2vec2-base-960h", "parakeet-ctc-0.6b"]) {
    withConfig({ model }, () => {
      assert.equal(modelLanguage("fr-FR"), null, model);
      assert.equal(modelLanguage("en-GB"), "en", model);
      assert.equal(modelLanguages(), "English only", model);
    });
  }
  withConfig({ model: "whisper-large-v3-turbo" }, () => {
    assert.equal(modelLanguage("fr-FR"), "fr");
    assert.equal(modelLanguage("nb-NO"), "no"); // Whisper's code for Norwegian
    assert.equal(modelLanguages(), "Whisper's languages");
  });
  // A repo the registry doesn't know is treated as a Whisper export.
  withConfig({ model: "someone/whisper-medium.en" }, () => assert.equal(modelLanguage("fr"), null));
  withConfig({ model: "someone/whisper-medium" }, () => assert.equal(modelLanguage("fr"), "fr"));
});

// --- Transcripts -------------------------------------------------------------------

test("cleanTranscript drops annotations and Whisper's inventions on silence", () => {
  assert.equal(cleanTranscript("Blue. [BLANK_AUDIO]", 0.9), "Blue.");
  assert.equal(cleanTranscript(" (music)  Hello   there. ", 0.9), "Hello there.");
  assert.equal(cleanTranscript("Thank you.", 0.3), "", "a low-confidence 'Thank you.' is Whisper on silence");
  assert.equal(cleanTranscript("Thank you.", 0.9), "Thank you.", "said with confidence, it stays");
  assert.equal(cleanTranscript("I don't know, Dr. Nakamura!", 0.9, { punctuation: false }), "i don't know dr nakamura");
});

test("isDegenerate flags loops and leaves speech alone", () => {
  assert.equal(isDegenerate("la la la la la la la la"), true);
  assert.equal(isDegenerate("and then we went and then we went and then we went and then we went"), true);
  assert.equal(isDegenerate("The quick brown fox jumps over the lazy dog."), false);
  assert.equal(isDegenerate("no no no"), false, "too short to judge");
});

test("promptFromPhrases puts the highest boost last, where a cut prompt keeps it", () => {
  assert.equal(promptFromPhrases([{ phrase: "Kubernetes", boost: 9 }, "plain", { phrase: "Nakamura", boost: 3 }, { phrase: "unused", boost: 0 }]), "plain, Nakamura, Kubernetes");
  assert.equal(promptFromPhrases([]), "");
  assert.equal(promptFromPhrases(undefined), "");
});

// --- Audio -------------------------------------------------------------------------

const tone = (hz, rate, seconds, amplitude = 0.5) => Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / rate));
const rms = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);

test("Resampler: 48 kHz and 44.1 kHz to 16 kHz keep a tone's length and level, in any block size", () => {
  for (const rate of [48000, 44100]) {
    const input = tone(440, rate, 1);
    for (const block of [128, 4800, input.length]) {
      const resampler = new Resampler(rate, SAMPLE_RATE);
      const out = [];
      for (let i = 0; i < input.length; i += block) out.push(...resampler.process(input.subarray(i, i + block)));
      // The filter holds back its own length at the end; nothing else is lost.
      assert.ok(Math.abs(out.length - SAMPLE_RATE) <= 64, `${rate} in blocks of ${block}: ${out.length} samples`);
      assert.ok(Math.abs(rms(out.slice(1600, 14400)) - 0.5 / Math.SQRT2) < 0.005, `${rate}: level ${rms(out.slice(1600, 14400))}`);
    }
  }
});

test("Resampler: what's above the new rate's half is filtered out", () => {
  const out = new Resampler(48000, SAMPLE_RATE).process(tone(12000, 48000, 0.5));
  assert.ok(rms(out.slice(800, 7000)) < 0.005, `a 12 kHz tone leaves ${rms(out.slice(800, 7000))}`);
});

// Final utterances as [start, end] in seconds.
async function utterances(audio, { detector = null, cutAt = [], step = 1600 } = {}) {
  const found = [];
  const segmenter = new Segmenter(
    { sound() {}, speechStart() {}, progress() {}, discard() {}, segment: (id, pcm, start, how) => found.push(Object.assign([start / SAMPLE_RATE, (start + pcm.length) / SAMPLE_RATE], { cut: how.cut })) },
    { silenceMs: 800, maxSegmentMs: 20000, detector },
  );
  const cuts = [...cutAt];
  for (let i = 0; i < audio.length; i += step) {
    if (cuts.length && i / SAMPLE_RATE >= cuts[0]) {
      cuts.shift();
      await segmenter.cut();
    }
    segmenter.push(audio.subarray(i, i + step));
  }
  await segmenter.flush();
  detector?.close();
  return found;
}

test("Segmenter: the energy rule finds one sentence in fox.wav and two in two-sentences.wav", async () => {
  const fox = await utterances(await fixture("fox.wav"));
  assert.equal(fox.length, 1, JSON.stringify(fox));
  assert.ok(fox[0][0] < 1 && fox[0][1] - fox[0][0] > 2, JSON.stringify(fox));
  const two = await utterances(await fixture("two-sentences.wav"));
  assert.equal(two.length, 2, JSON.stringify(two));
  assert.ok(two[0][1] <= two[1][0], "in order, not overlapping");
});

test("Segmenter.cut ends the utterance in progress there, and listening carries on", async () => {
  const audio = await fixture("two-sentences.wav");
  const [first, second] = await utterances(audio);
  const middle = (first[0] + first[1]) / 2;
  const found = await utterances(audio, { cutAt: [middle] });
  assert.equal(found.length, 3, JSON.stringify(found));
  assert.deepEqual(found.map((u) => u.cut), [true, false, false], "only the utterance the cut ended says so");
  assert.ok(Math.abs(found[0][0] - first[0]) < 0.001 && Math.abs(found[0][1] - middle) <= 0.1, `the first part ends at the cut: ${JSON.stringify(found[0])}`);
  // The rest of the sentence is heard as its own utterance, starting no earlier than the cut less the pre-roll.
  assert.ok(found[1][0] >= middle - 0.3 - 0.1 && Math.abs(found[1][1] - first[1]) < 0.05, JSON.stringify(found[1]));
  assert.ok(Math.abs(found[2][0] - second[0]) < 0.05 && Math.abs(found[2][1] - second[1]) < 0.05, "the second sentence is untouched");
  // A cut in silence does nothing.
  assert.equal((await utterances(audio, { cutAt: [first[1] + 0.5] })).length, 2);
});

test("chunkBounds cuts long audio at its quietest moments, and covers all of it", () => {
  const audio = new Float32Array(SAMPLE_RATE * 50);
  for (let i = 0; i < audio.length; i++) audio[i] = Math.sin(i / 20) * 0.3;
  audio.fill(0, SAMPLE_RATE * 18.5, SAMPLE_RATE * 18.7); // a pause the first cut should find
  const bounds = chunkBounds(audio);
  assert.equal(bounds[0][0], 0);
  assert.equal(bounds.at(-1)[1], audio.length);
  for (let i = 1; i < bounds.length; i++) assert.equal(bounds[i][0], bounds[i - 1][1]);
  assert.ok(Math.abs(bounds[0][1] / SAMPLE_RATE - 18.6) < 0.1, `first cut at ${bounds[0][1] / SAMPLE_RATE} s`);
});

// --- Detectors ---------------------------------------------------------------------

test("WebRTC VAD (from vendor/) splits two-sentences.wav into 2, at every level", { skip: !existsSync(join(ROOT, "vendor", "fvad", "fvad.js")) && "vendor/ isn't made: npm install" }, async () => {
  const audio = await fixture("two-sentences.wav");
  for (const level of [0, 1, 2, 3]) {
    const found = await utterances(audio, { detector: await createWebRtcDetector({ level }), step: 128 });
    assert.equal(found.length, 2, `level ${level}: ${JSON.stringify(found)}`);
  }
  await assert.rejects(createWebRtcDetector({ level: 4 }), /no level 4/);
});

test("whole-file scores find both sentences", async () => {
  const audio = await fixture("two-sentences.wav");
  const detector = createEnergyDetector();
  const regions = speechRegions(await frameScores(audio, detector), detector.threshold, { bridge: 0.5 });
  assert.equal(regions.length, 2, JSON.stringify(regions));
});

test("speechRegions bridges short pauses and drops short bursts", () => {
  const frames = (pattern) => [...pattern].map((c) => (c === "#" ? 1 : 0));
  assert.deepEqual(speechRegions(frames("##########....##########")), [[0, 0.48]]);
  assert.deepEqual(speechRegions(frames(`##########${".".repeat(20)}##########`)), [[0, 0.2], [0.6, 0.8]]);
  assert.deepEqual(speechRegions(frames("....#####....")), []);
  assert.deepEqual(speechRegions([0.2, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.2], 0.5), [[0.02, 0.14]]);
});

test("speechWithin pads the speech inside a range and clips it", () => {
  const regions = [[1, 2], [5, 6]];
  assert.deepEqual(speechWithin(regions, 0, 3), { start: 0.7, end: 2.3 });
  assert.deepEqual(speechWithin(regions, 1.5, 10), { start: 1.5, end: 6.3 });
  assert.equal(speechWithin(regions, 2.5, 4.5), null);
});
