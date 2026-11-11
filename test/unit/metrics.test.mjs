import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  align,
  avOffsets,
  cameraTiming,
  dbfs,
  envelope,
  flashEdges,
  frameOffset,
  frameTiming,
  levels,
  mixDown,
  onsets,
  overview,
  sequenceStats,
  silenceShare,
  waveMatch,
} from "../../src/metrics.js";
import { parseWav } from "../../src/wav.js";

const close = (a, b, tolerance, message) => assert.ok(Math.abs(a - b) <= tolerance, `${message ?? ""} ${a} is not within ${tolerance} of ${b}`);
const fox = parseWav(readFileSync(new URL("../fixtures/fox.wav", import.meta.url))).channels[0];

test("levels: peak, RMS and clipping", () => {
  const sine = Float32Array.from({ length: 48000 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 1000 * i) / 48000));
  const l = levels(sine);
  close(l.peakDb, -6.02, 0.01);
  close(l.rmsDb, -9.03, 0.01); // a sine's RMS is 3 dB under its peak
  assert.equal(l.clipped, 0);
  const clipped = levels(Float32Array.from([0, 1, -1, 0.5]));
  assert.equal(clipped.clipped, 2);
  assert.equal(clipped.clippedShare, 0.5);
  assert.equal(levels(new Float32Array(10)).peakDb, -Infinity);
  assert.equal(dbfs(1), 0);
});

test("mixDown and overview", () => {
  assert.deepEqual([...mixDown([Float32Array.from([1, 0]), Float32Array.from([0, 1])])], [0.5, 0.5]);
  const o = overview(Float32Array.from([0, 0.5, -0.25, 1]), 2);
  assert.deepEqual(o, [0, 0.5, -0.25, 1]);
});

test("silenceShare: counts quiet 20 ms windows", () => {
  const rate = 16000;
  const half = new Float32Array(rate); // 1 s: the first half a tone, the second silent
  for (let i = 0; i < rate / 2; i++) half[i] = 0.3 * Math.sin(i / 3);
  close(silenceShare(half, rate), 0.5, 0.03);
  assert.equal(silenceShare(new Float32Array(rate), rate), 1);
});

test("align: finds how far a copy is shifted, either way", () => {
  // The fixture at 16 kHz against itself shifted by 120 ms: a copy that starts later in
  // the sound (missing its first 120 ms) is at -0.12; one with 120 ms added in front, +0.12.
  const missing = fox.slice(1920);
  const padded = new Float32Array(fox.length + 1920);
  padded.set(fox, 1920);
  close(align(fox, 16000, missing, 16000).lagS, -0.12, 0.002, "missing start");
  close(align(fox, 16000, padded, 16000).lagS, 0.12, 0.002, "padded start");
  assert.ok(align(fox, 16000, padded, 16000).score > 0.99);
});

test("align: works across sample rates, and waveMatch refines to the sample", () => {
  // The same sound at 48 kHz (sample-and-hold upsampling is enough for loudness).
  const up = new Float32Array(fox.length * 3);
  for (let i = 0; i < up.length; i++) up[i] = fox[Math.floor(i / 3)];
  const shifted = new Float32Array(fox.length + 800); // 50 ms in front
  shifted.set(fox, 800);
  const coarse = align(up, 48000, shifted, 16000);
  close(coarse.lagS, 0.05, 0.002);
  const fine = waveMatch(fox, shifted, 16000, coarse.lagS);
  assert.equal(Math.round(fine.lagS * 16000), 800);
  close(fine.score, 1, 1e-6);
});

test("align: a sound that repeats every second lines up at the nearest match", () => {
  // Beeps once a second, as the test signal and Firefox's fake microphone make: the copy is
  // 30 ms late, which matches as well at 30 ms - 1 s; the nearer one wins.
  const rate = 16000;
  const beeps = new Float32Array(rate * 6);
  for (let k = 0; k < 6; k++) for (let i = 0; i < rate / 10; i++) beeps[k * rate + i] = 0.3 * Math.sin(i / 2);
  const late = new Float32Array(beeps.length);
  late.set(beeps.subarray(0, beeps.length - 480), 480);
  close(align(beeps, rate, late, rate).lagS, 0.03, 0.002);
});

test("frameTiming: the median interval, and gaps counted as dropped frames", () => {
  const t = Array.from({ length: 31 }, (_, i) => i / 30);
  const r = frameTiming(t);
  close(r.fps, 30, 1e-6);
  assert.equal(r.dropped, 0);
  // Remove frames 10 and 11, and 20: one gap of 3 intervals (2 dropped), one of 2 (1 dropped).
  const gappy = t.filter((_, i) => ![10, 11, 20].includes(i));
  const g = frameTiming(gappy);
  assert.equal(g.gaps, 2);
  assert.equal(g.dropped, 3);
  close(g.maxGapS, 3 / 30, 1e-9);
});

test("sequenceStats: missing, repeated and unreadable frame numbers", () => {
  assert.deepEqual(sequenceStats([5, 6, 6, 8, null, 9, 12]), { frames: 7, unreadable: 1, first: 5, last: 12, missing: 3, repeated: 1, backwards: 0 });
});

test("onsets, flashEdges and avOffsets: beeps and flashes a second apart", () => {
  const rate = 48000;
  const audio = new Float32Array(rate * 4);
  for (let k = 0; k < 4; k++) {
    const start = Math.round((k + 0.04) * rate); // each beep 40 ms after its flash
    for (let i = 0; i < rate / 10; i++) audio[start + i] = 0.25 * Math.sin((2 * Math.PI * 1000 * i) / rate);
  }
  const beeps = onsets(audio, rate);
  assert.equal(beeps.length, 4);
  beeps.forEach((b, k) => close(b, k + 0.04, 0.002));
  const frames = Array.from({ length: 120 }, (_, n) => ({ t: n / 30, flash: n % 30 < 3 }));
  const flashes = flashEdges(frames);
  // The very first frame is already bright, so it isn't an edge.
  assert.deepEqual(flashes, [1, 2, 3]);
  const sync = avOffsets(flashes, beeps);
  assert.equal(sync.pairs, 3);
  close(sync.medianS, 0.04, 0.002);
});

test("envelope: one value per bin", () => {
  assert.equal(envelope(new Float32Array(48000), 48000, 1000).length, 1000);
  assert.equal(envelope(new Float32Array(48000), 48000, 100, 0.5).length, 50);
});

test("cameraTiming: frame rate, gaps, missed frames and delay, with pauses between runs", () => {
  // 30 fps taken, reaching the page 40 ms later; frame 5 never arrives; a pause after frame 9.
  const frame = (n) => ({ captured: n / 30, presented: n / 30 + 0.04, count: n });
  const runs = [[0, 1, 2, 3, 4, 6, 7, 8, 9].map(frame), [20, 21, 22, 23].map(frame)];
  const t = cameraTiming(runs);
  assert.equal(t.clock, "capture");
  assert.equal(t.frames, 13);
  close(t.fps, 30, 0.01);
  assert.equal(t.gaps, 1); // frame 5, not the pause
  assert.equal(t.dropped, 1);
  assert.equal(t.missed, 1); // the element's count jumped from 4 to 6
  close(t.delayS, 0.04, 1e-9);
  // Without capture times, the presentation times are used, and there's no delay.
  const bare = cameraTiming([[0, 1, 2].map((n) => ({ captured: null, presented: n / 25, count: null }))]);
  assert.equal(bare.clock, "presentation");
  close(bare.fps, 25, 0.01);
  assert.equal(bare.delayS, null);
  assert.equal(bare.missed, 0);
});

test("frameOffset: how far apart two cameras take their frames", () => {
  const a = Array.from({ length: 30 }, (_, i) => i / 30);
  close(frameOffset(a, a), 0, 1e-12);
  close(frameOffset(a, a.map((t) => t + 0.01)), 0.01, 1e-9);
  close(frameOffset(a, a.map((t) => t - 0.012)), -0.012, 1e-9);
  assert.equal(frameOffset([], a), null);
});
