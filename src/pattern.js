// The test pattern's machine-readable parts, shared by the synthetic source
// (drawn on a canvas), scripts/make-fixtures.mjs (written into a .y4m file for
// Chromium's fake camera) and the analysis (read back from decoded frames):
//
//   - a flash patch, white on the frames that start each second, black otherwise
//   - a row of cells holding the frame number: a white cell, a black cell (the
//     two references for reading the rest), 20 bits (most significant first),
//     and a parity cell, white when the bits hold an odd number of ones
//
// Positions are fractions of the frame's width and height, so the pattern
// reads back at any resolution. No DOM, so the unit tests use it too.

export const BITS = 20;
const CELLS = BITS + 3;
const PATCH = { x: 0.04, y: 0.08, w: 0.16, h: 0.28 };
const ROW = { x: 0.04, y: 0.8, w: 0.92, h: 0.1 };
const INSET = 0.15; // each cell is drawn inset by this share, so neighbours don't blur together

// The white and black cells for frame n: [{ x, y, w, h, white }] in fractions.
export function patternRects(n, { flash = false } = {}) {
  const bits = [];
  for (let b = BITS - 1; b >= 0; b--) bits.push(Math.floor(n / 2 ** b) % 2 === 1);
  const ones = bits.filter(Boolean).length;
  const cells = [true, false, ...bits, ones % 2 === 1];
  const cw = ROW.w / CELLS;
  return [
    { ...PATCH, white: flash },
    ...cells.map((white, i) => ({ x: ROW.x + i * cw + cw * INSET, y: ROW.y, w: cw * (1 - 2 * INSET), h: ROW.h, white })),
  ];
}

// Mean of the middle 40% of a rect, from 8-bit luma (one byte per pixel).
function sample(gray, width, height, { x, y, w, h }) {
  const x0 = Math.floor((x + w * 0.3) * width);
  const x1 = Math.max(x0 + 1, Math.ceil((x + w * 0.7) * width));
  const y0 = Math.floor((y + h * 0.3) * height);
  const y1 = Math.max(y0 + 1, Math.ceil((y + h * 0.7) * height));
  let sum = 0;
  let count = 0;
  for (let j = y0; j < y1 && j < height; j++) {
    for (let i = x0; i < x1 && i < width; i++) {
      sum += gray[j * width + i];
      count++;
    }
  }
  return count ? sum / count : 0;
}

// Reads a frame: { code, flash }. code is the frame number, or null when the
// row can't be read (too little contrast, or the parity is wrong).
export function readPattern(gray, width, height) {
  const rects = patternRects(0);
  const levels = rects.map((r) => sample(gray, width, height, r));
  const [patch, white, black, ...rest] = levels;
  const mid = (white + black) / 2;
  const flash = patch > mid;
  if (white - black < 60) return { code: null, flash };
  const bits = rest.slice(0, BITS).map((v) => v > mid);
  const parity = rest[BITS] > mid;
  if ((bits.filter(Boolean).length + (parity ? 1 : 0)) % 2 !== 0) return { code: null, flash };
  return { code: bits.reduce((n, bit) => n * 2 + (bit ? 1 : 0), 0), flash };
}

// 8-bit luma from canvas RGBA pixels (BT.601 weights).
export function lumaFromRGBA(rgba, width, height) {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) gray[i] = (rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000;
  return gray;
}
