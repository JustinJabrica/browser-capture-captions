// The captions' feed from the tap: blocks at the AudioContext's rate in,
// 16 kHz mono out, with every sample's place on the context's clock kept,
// whatever the rate, the block size or what went missing on the way.

import assert from "node:assert/strict";
import { test } from "node:test";
import { FeedClock } from "../../src/captions/tap-feed.js";
import { SAMPLE_RATE } from "../../src/speech/audio.js";

const FIRST = 987654; // an arbitrary context frame for the first block

// A click (one loud sample) at `at` seconds of silence, as the tap would deliver it.
function clickBlocks(rate, seconds, at, { size = rate / 10, channels = 1, drop = [], first = FIRST } = {}) {
  const audio = new Float32Array(Math.round(rate * seconds));
  audio[Math.round(at * rate)] = 1;
  const blocks = [];
  for (let i = 0, n = 0; i < audio.length; i += size, n++) {
    if (drop.includes(n)) continue;
    const part = audio.slice(i, i + size);
    blocks.push({ frame: first + i, channels: Array.from({ length: channels }, () => part) });
  }
  return blocks;
}

// Where the loudest output sample is, in seconds of the audio fed.
function peakSeconds(rate, blocks) {
  const out = [];
  const clock = new FeedClock(rate, (pcm) => out.push(...pcm));
  for (const block of blocks) clock.push(block);
  let peak = 0;
  for (let i = 1; i < out.length; i++) if (Math.abs(out[i]) > Math.abs(out[peak])) peak = i;
  return { seconds: peak / SAMPLE_RATE, clock, out };
}

test("a sound comes out where it went in, at 48 kHz and at 44.1 kHz", () => {
  for (const rate of [48000, 44100]) {
    const { seconds, clock, out } = peakSeconds(rate, clickBlocks(rate, 2, 1.25));
    assert.ok(Math.abs(seconds - 1.25) <= 1.5 / SAMPLE_RATE, `${rate}: the click at 1.25 s came out at ${seconds} s`);
    assert.equal(clock.firstFrame, FIRST);
    assert.equal(clock.fed, rate * 2);
    assert.equal(clock.lostFrames, 0);
    assert.ok(Math.abs(out.length - SAMPLE_RATE * 2) <= 64, `${out.length} samples out`);
  }
});

test("frameAt and secondsAt place the audio fed on the context's clock", () => {
  const { clock } = peakSeconds(48000, clickBlocks(48000, 1, 0.5));
  assert.equal(clock.frameAt(0), FIRST);
  assert.equal(clock.frameAt(0.5), FIRST + 24000);
  assert.equal(clock.secondsAt(FIRST + 24000), 0.5);
  const empty = new FeedClock(48000, () => {});
  assert.equal(empty.frameAt(1), null, "nothing fed yet");
});

test("frames lost between blocks are fed as silence, so later sounds keep their place", () => {
  const whole = peakSeconds(48000, clickBlocks(48000, 3, 2.2));
  const holed = peakSeconds(48000, clickBlocks(48000, 3, 2.2, { drop: [4, 5, 11] }));
  assert.equal(holed.clock.lostFrames, 3 * 4800);
  assert.equal(holed.clock.fed, whole.clock.fed, "the same count of frames, silence included");
  assert.equal(holed.seconds, whole.seconds, "the click after the holes is where it was");
});

test("a block that overlaps what was fed is trimmed, and a part-filled block is taken as it is", () => {
  const out = [];
  const clock = new FeedClock(48000, (pcm) => out.push(...pcm));
  const block = (frame, length) => ({ frame, channels: [new Float32Array(length)] });
  clock.push(block(FIRST, 4800));
  clock.push(block(FIRST + 4800 - 480, 4800)); // 10 ms early
  assert.equal(clock.fed, 4800 + 4800 - 480);
  clock.push(block(FIRST + 9120, 1000)); // what a flush sends
  assert.equal(clock.fed, 10120);
  clock.push({ frame: FIRST + 10120, channels: [new Float32Array(0)] }); // an empty flush
  clock.push({ frame: FIRST + 10120, channels: [] }); // no channels at all
  assert.equal(clock.fed, 10120);
  assert.equal(clock.lostFrames, 0);
});

test("stereo is mixed down to its mean, and the blocks aren't changed", () => {
  const left = Float32Array.from({ length: 4800 }, () => 0.8);
  const right = Float32Array.from({ length: 4800 }, () => 0.2);
  const out = [];
  const clock = new FeedClock(48000, (pcm) => out.push(...pcm));
  for (let i = 0; i < 5; i++) clock.push({ frame: FIRST + i * 4800, channels: [left, right] });
  const settled = out.slice(1600, 6400);
  assert.ok(settled.every((v) => Math.abs(v - 0.5) < 0.01), `the mean, 0.5: ${settled[0]}`);
  assert.equal(left[0], Math.fround(0.8));
  assert.equal(right[4799], Math.fround(0.2));
});
