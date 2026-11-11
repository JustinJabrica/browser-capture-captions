// Runs the speech engine in Node against the WAV fixtures, without a
// browser: the model transcribes them, and the live chain (the tap's blocks
// -> the feed -> the segmenter -> the model) places what it hears on the
// tap's clock. Needs a model in models/ (Whisper tiny.en unless MODEL names
// another registry id):
//
//   npm run download-model whisper-tiny.en
//   node test/engine.test.mjs

import * as transformers from "@huggingface/transformers";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FeedClock } from "../src/captions/tap-feed.js";
import { createAsrEngine } from "../src/speech/asr-engine.js";
import { Resampler, Segmenter } from "../src/speech/audio.js";
import { modelDir, resolve } from "../src/speech/registry.js";
import { parseWav } from "../src/wav.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const fixture = async (name) => parseWav(await readFile(join(ROOT, "test", "fixtures", name))).channels[0];
const normalize = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, "").replace(/\s+/g, " ").trim();

const model = modelDir(resolve(process.env.MODEL ?? "whisper-tiny.en"));
let engine;
try {
  engine = await createAsrEngine(transformers, { model, device: "cpu", localModelPath: join(ROOT, "models/") });
} catch (err) {
  console.error(`Couldn't load ${model} from models/: ${err.message}\nDownload it first: npm run download-model ${process.env.MODEL ?? "whisper-tiny.en"}`);
  process.exit(2);
}
console.log("loaded", engine.info);

let failed = 0;
const check = (ok, label, detail) => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${detail}`);
};

for (const [file, expect] of [
  ["fox.wav", "the quick brown fox jumps over the lazy dog"],
  ["two-sentences.wav", "speech recognition now works in firefox"],
]) {
  const result = await engine.transcribe(await fixture(file));
  check(normalize(result.text).includes(expect), file, `"${result.text}" confidence=${result.confidence.toFixed(3)} ${result.ms} ms`);
}

// The live chain, as the bench runs it: the fixture as 48 kHz stereo blocks of
// 100 ms starting at an arbitrary context frame, with one block lost on the
// way. Every utterance must come out at the frames it was fed at.
{
  const RATE = 48000;
  const FIRST = 123456;
  const audio = await fixture("two-sentences.wav");
  const up = new Resampler(16000, RATE).process(audio);
  const found = [];
  const segmenter = new Segmenter(
    { sound() {}, speechStart() {}, progress() {}, discard() {}, segment: (id, pcm, startSample) => found.push({ pcm, start: startSample / 16000 }) },
    { silenceMs: 800, maxSegmentMs: 20000 },
  );
  const clock = new FeedClock(RATE, (pcm) => segmenter.push(pcm));
  const BLOCK = RATE / 10;
  const lost = 3; // the fourth block never arrives (it is silence in this file's lead-in or speech: either way the times after it must hold)
  for (let i = 0, n = 0; i + BLOCK <= up.length; i += BLOCK, n++) {
    if (n === lost) continue;
    const block = up.subarray(i, i + BLOCK);
    clock.push({ frame: FIRST + i, channels: [block, block] });
  }
  segmenter.flush();
  check(clock.lostFrames === BLOCK, "lost frames are counted", `${clock.lostFrames} of ${BLOCK}`);
  check(found.length === 2, "the segmenter finds both sentences", `${found.length} utterances at ${found.map((u) => u.start.toFixed(2)).join(", ")} s`);
  const texts = [];
  for (const u of found) {
    const frame = clock.frameAt(u.start);
    const seconds = (frame - FIRST) / RATE;
    const { text } = await engine.transcribe(u.pcm);
    texts.push(text);
    check(Math.abs(seconds - u.start) < 1 / 16000 + 1e-9, "an utterance's frame is where it was fed", `${u.start.toFixed(3)} s -> frame ${frame} (${seconds.toFixed(3)} s after the first)`);
  }
  check(normalize(texts.join(" ")).includes("speech recognition now works in firefox"), "the live chain's text", JSON.stringify(texts));
}

await engine.dispose();
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
