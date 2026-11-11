// The sound measurements (src/sound.js): BS.1770 loudness against the
// figures the Recommendation gives, the noise floor, bandwidth, sound
// segments and how channels relate.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { levels } from "../../src/metrics.js";
import { bandwidth, channelPair, kWeighting, levelSpread, loudestShares, loudness, soundSegments } from "../../src/sound.js";
import { parseWav } from "../../src/wav.js";

const close = (a, b, tolerance, message) => assert.ok(Math.abs(a - b) <= tolerance, `${message ?? ""} ${a} is not within ${tolerance} of ${b}`);
const fox = parseWav(readFileSync(new URL("../fixtures/fox.wav", import.meta.url))).channels[0];
const sine = (hz, rate, seconds, amplitude = 1) => Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / rate));
const join = (...parts) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

test("kWeighting: at 48 kHz, the coefficients BS.1770 publishes", () => {
  const [shelf, highPass] = kWeighting(48000);
  [1.53512485958697, -2.69169618940638, 1.19839281085285].forEach((b, i) => close(shelf.b[i], b, 1e-10, `shelf b${i}`));
  [-1.69065929318241, 0.73248077421585].forEach((a, i) => close(shelf.a[i], a, 1e-10, `shelf a${i + 1}`));
  assert.deepEqual(highPass.b, [1, -2, 1]);
  [-1.99004745483398, 0.99007225036621].forEach((a, i) => close(highPass.a[i], a, 1e-10, `high-pass a${i + 1}`));
});

test("loudness: a 0 dBFS 997 Hz sine on one channel reads -3.01 LUFS, at any rate", () => {
  // BS.1770-5, under equation (7): the -0.691 cancels the K-weighting's gain at 997 Hz.
  // Lower rates stray a little: the bilinear transform bends the response as it nears half the rate.
  for (const rate of [48000, 44100, 32000, 16000]) close(loudness([sine(997, rate, 5)], rate).integrated, -3.01, rate < 44100 ? 0.05 : 0.01, `${rate} Hz`);
  close(loudness([sine(997, 48000, 5, 10 ** (-23 / 20))], 48000).integrated, -26.01, 0.03, "-23 dBFS");
});

test("loudness: channels add up, and the gates leave out silence and quiet passages", () => {
  const tone = sine(997, 48000, 5, 0.1); // -23.01 LUFS on one channel
  close(loudness([tone, tone], 48000).integrated, -20.0, 0.03, "two channels");
  // Silence is under the absolute gate (-70 LUFS), a passage 30 dB down under the relative one (10 LU).
  // The three blocks that straddle the change are partly tone, so they pass: 47 whole blocks and 0.75 + 0.5 + 0.25.
  const expected = -23.01 + 10 * Math.log10(48.5 / 50);
  close(loudness([join(tone, new Float32Array(5 * 48000))], 48000).integrated, expected, 0.01, "with silence");
  const quiet = loudness([join(tone, sine(997, 48000, 5, 0.1 * 10 ** (-30 / 20)))], 48000);
  close(quiet.integrated, expected, 0.01, "with a quiet passage");
  close(quiet.maxMomentary, -23.01, 0.01, "loudest block");
  assert.equal(loudness([new Float32Array(48000)], 48000).integrated, -Infinity);
  assert.equal(loudness([new Float32Array(100)], 48000).blocks, 0);
});

test("levels: the DC offset is the mean", () => {
  close(levels(Float32Array.from(sine(100, 8000, 1, 0.5), (x) => x + 0.01)).dc, 0.01, 1e-6);
});

test("levelSpread: the noise floor and the loud level", () => {
  // 1 s at -20 dBFS RMS, then 1 s of noise about 60 dB down.
  let seed = 1;
  const noise = Float32Array.from({ length: 16000 }, () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.0035);
  const s = levelSpread(join(sine(440, 16000, 1, 0.1 * Math.SQRT2), noise), 16000);
  close(s.loudDb, -20, 0.2, "loud");
  close(s.floorDb, -60, 2, "floor");
  close(s.spreadDb, 40, 2, "spread");
  assert.equal(levelSpread(new Float32Array(16000), 16000).floorDb, -Infinity);
});

test("bandwidth: how high the sound reaches, and fox.wav's 8 kHz ceiling", () => {
  // A sine's window spreads it a few tens of hertz either side, within 60 dB.
  close(bandwidth(sine(440, 16000, 2), 16000), 440, 60, "440 Hz");
  const two = sine(440, 48000, 2).map((x, i) => x + Math.sin((2 * Math.PI * 9000 * i) / 48000));
  close(bandwidth(two, 48000), 9000, 60, "440 Hz and 9 kHz");
  // A 16 kHz file holds nothing above 8 kHz.
  const b = bandwidth(fox, 16000);
  assert.ok(b > 3000 && b <= 8000, `fox.wav reaches ${b} Hz`);
  assert.equal(bandwidth(new Float32Array(16000), 16000), 0);
  assert.equal(bandwidth(new Float32Array(100), 16000), null);
});

test("soundSegments: stretches of sound, short pauses bridged, clicks dropped", () => {
  const rate = 16000;
  const silence = (s) => new Float32Array(Math.round(s * rate));
  const signal = join(silence(0.5), sine(440, rate, 1, 0.3), silence(0.1), sine(440, rate, 0.5, 0.3), silence(1), sine(440, rate, 0.05, 0.3), silence(0.5), sine(440, rate, 0.7, 0.3));
  const segs = soundSegments(signal, rate);
  assert.equal(segs.length, 2, JSON.stringify(segs));
  close(segs[0][0], 0.5, 0.011);
  close(segs[0][1], 2.1, 0.011); // the 100 ms pause is bridged
  close(segs[1][0], 3.65, 0.011); // the 50 ms click is dropped
  assert.ok(soundSegments(fox, rate).length >= 1);
});

test("channelPair: the same signal twice, and a second microphone 2 ms later", () => {
  assert.deepEqual(channelPair(fox, fox, 16000), { identical: true, lagS: 0, score: 1 });
  const later = join(new Float32Array(32), fox.subarray(0, fox.length - 32)); // 2 ms at 16 kHz
  const pair = channelPair(fox, later, 16000);
  assert.equal(pair.identical, false);
  close(pair.lagS, 0.002, 1 / 16000, "lag");
  assert.ok(pair.score > 0.99, `score ${pair.score}`);
});

test("loudestShares: which channel is loudest, when there's sound", () => {
  const rate = 16000;
  const a = join(sine(440, rate, 3, 0.5), sine(440, rate, 1, 0.05));
  const b = join(sine(440, rate, 3, 0.05), sine(440, rate, 1, 0.5));
  const { shares, tied } = loudestShares([a, b], rate);
  close(shares[0], 0.75, 0.01);
  close(shares[1], 0.25, 0.01);
  assert.equal(tied, 0);
  assert.deepEqual(loudestShares([new Float32Array(rate), new Float32Array(rate)], rate), { shares: [0, 0], tied: 0 });
  // The same sound in both channels, or within 1 dB: tied, not channel 1's.
  assert.deepEqual(loudestShares([a, a], rate), { shares: [0, 0], tied: 1 });
  const nearly = a.map((x) => x * 0.95); // -0.45 dB
  assert.deepEqual(loudestShares([a, nearly], rate), { shares: [0, 0], tied: 1 });
  const quieter = a.map((x) => x * 0.8); // -1.9 dB
  assert.deepEqual(loudestShares([a, quieter], rate), { shares: [1, 0], tied: 0 });
});
