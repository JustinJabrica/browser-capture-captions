import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { encodeWav, parseWav } from "../../src/wav.js";

test("encodeWav: a 16-bit stereo header and interleaved samples", () => {
  const left = Float32Array.from([0, 0.5, -1]);
  const right = Float32Array.from([1, -0.5, 0]);
  const buffer = encodeWav([left, right], 48000);
  const view = new DataView(buffer);
  const text = (o) => String.fromCharCode(...new Uint8Array(buffer, o, 4));
  assert.equal(buffer.byteLength, 44 + 3 * 2 * 2);
  assert.equal(text(0), "RIFF");
  assert.equal(view.getUint32(4, true), buffer.byteLength - 8);
  assert.equal(text(8), "WAVE");
  assert.equal(view.getUint16(20, true), 1); // integer PCM
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 48000);
  assert.equal(view.getUint32(28, true), 48000 * 4); // byte rate
  assert.equal(view.getUint16(32, true), 4); // block align
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(text(36), "data");
  // L0 R0 L1 R1 L2 R2
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => view.getInt16(44 + i * 2, true)), [0, 32767, 16383, -16384, -32768, 0]);
});

test("encodeWav: out-of-range samples are clamped, not wrapped", () => {
  const view = new DataView(encodeWav([Float32Array.from([1.5, -3])], 16000));
  assert.equal(view.getInt16(44, true), 32767);
  assert.equal(view.getInt16(46, true), -32768);
});

test("encodeWav and parseWav: 32-bit float round-trips exactly", () => {
  const samples = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 7) * 1.2);
  const parsed = parseWav(encodeWav([samples], 44100, { float: true }));
  assert.equal(parsed.sampleRate, 44100);
  assert.equal(parsed.float, true);
  assert.deepEqual(parsed.channels[0], samples);
});

test("parseWav: 16-bit within one step", () => {
  const samples = Float32Array.from({ length: 500 }, (_, i) => Math.cos(i / 3) * 0.9);
  const parsed = parseWav(encodeWav([samples, samples], 22050));
  assert.equal(parsed.channels.length, 2);
  assert.equal(parsed.bits, 16);
  for (let i = 0; i < samples.length; i++) assert.ok(Math.abs(parsed.channels[1][i] - samples[i]) < 1 / 16384);
});

test("parseWav: reads the fixtures", () => {
  const fox = parseWav(readFileSync(new URL("../fixtures/fox.wav", import.meta.url)));
  assert.equal(fox.sampleRate, 16000);
  assert.equal(fox.channels.length, 1);
  assert.ok(Math.abs(fox.channels[0].length / 16000 - 4.83) < 0.01);
  assert.throws(() => parseWav(new Uint8Array(20)), /Not a WAV/);
});
