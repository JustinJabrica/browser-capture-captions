import assert from "node:assert/strict";
import { test } from "node:test";
import { BITS, patternRects, readPattern } from "../../src/pattern.js";

// Draws frame n's pattern into 8-bit luma, as a canvas or the .y4m writer would.
function render(n, { width, height, flash = false, black = 16, white = 235, noise = 0 }) {
  const gray = new Uint8Array(width * height).fill(black);
  for (const r of patternRects(n, { flash })) {
    if (!r.white) continue;
    for (let y = Math.round(r.y * height); y < Math.round((r.y + r.h) * height); y++) {
      for (let x = Math.round(r.x * width); x < Math.round((r.x + r.w) * width); x++) gray[y * width + x] = white;
    }
  }
  if (noise) for (let i = 0; i < gray.length; i++) gray[i] = Math.max(0, Math.min(255, gray[i] + Math.round((Math.sin(i * 12.9898) * 43758.5453) % 1 * noise)));
  return gray;
}

test("readPattern: reads back every kind of frame number", () => {
  for (const n of [0, 1, 2, 29, 30, 1000, 123456, 2 ** BITS - 1]) {
    assert.deepEqual(readPattern(render(n, { width: 320, height: 180 }), 320, 180), { code: n, flash: false });
  }
});

test("readPattern: the flash patch, at other sizes and with noise", () => {
  assert.deepEqual(readPattern(render(77, { width: 640, height: 360, flash: true }), 640, 360), { code: 77, flash: true });
  assert.equal(readPattern(render(4321, { width: 1920, height: 1080, noise: 30 }), 1920, 1080).code, 4321);
  assert.equal(readPattern(render(4321, { width: 160, height: 90 }), 160, 90).code, 4321);
});

test("readPattern: a frame without the pattern, or with a bit flipped, has no code", () => {
  assert.equal(readPattern(new Uint8Array(320 * 180).fill(128), 320, 180).code, null);
  const gray = render(10, { width: 320, height: 180 });
  // Turn one data cell white: the parity no longer matches.
  const cell = patternRects(10)[3 + BITS - 1]; // the least significant bit, currently black
  for (let y = Math.round(cell.y * 180); y < Math.round((cell.y + cell.h) * 180); y++) {
    for (let x = Math.round(cell.x * 320); x < Math.round((cell.x + cell.w) * 320); x++) gray[y * 320 + x] = 235;
  }
  assert.equal(readPattern(gray, 320, 180).code, null);
});
