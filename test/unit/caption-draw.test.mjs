// Where a burned-in caption goes on a picture, and what is drawn: the
// layout is arithmetic on the text's width, so it is checked here with a
// stand-in for the canvas's own measuring.

import assert from "node:assert/strict";
import { test } from "node:test";
import { CAPTION_STYLE, drawCaption, fontOf, layoutCaption } from "../../src/captions/caption-draw.js";

// Every character half an em wide.
const measure = (text, px) => text.length * px * 0.5;

test("layoutCaption: letters a fixed share of the picture's height, lines centred near the bottom", () => {
  const l = layoutCaption(["The quick brown fox jumps over the lazy", "dog."], 1280, 720, measure);
  assert.equal(l.fontPx, 40, "720 / 18");
  assert.equal(l.lines.length, 2);
  const [first, second] = l.lines;
  // Centred: as much picture left of the text as right of it.
  assert.ok(Math.abs(first.x - (1280 - measure(first.text, 40)) / 2) < 1e-9);
  assert.ok(Math.abs(first.box.x + first.box.width / 2 - 640) < 1e-9 && Math.abs(second.box.x + second.box.width / 2 - 640) < 1e-9);
  // The box is wider than its text by the padding, and the second line sits right under the first.
  assert.ok(Math.abs(first.box.width - (measure(first.text, 40) + 2 * CAPTION_STYLE.padXEm * 40)) < 1e-9);
  assert.ok(Math.abs(second.box.y - (first.box.y + first.box.height)) < 1e-9);
  // The whole caption ends 6% above the bottom edge, and each baseline is inside its box.
  assert.ok(Math.abs(l.band.y + l.band.height - (720 - Math.round(720 * 0.06))) < 1e-9);
  for (const line of l.lines) assert.ok(line.baseline > line.box.y && line.baseline < line.box.y + line.box.height);
});

test("layoutCaption: the same share of a small picture as of a large one", () => {
  const small = layoutCaption(["Hello there."], 320, 180, measure);
  const large = layoutCaption(["Hello there."], 1920, 1080, measure);
  assert.equal(small.fontPx, CAPTION_STYLE.minFontPx, "180 / 18 is 10: not smaller than the least readable");
  assert.equal(large.fontPx, 60);
  assert.ok(Math.abs(large.band.height / 1080 - (60 * (CAPTION_STYLE.lineHeight + 2 * CAPTION_STYLE.padYEm)) / 1080) < 1e-9);
});

test("layoutCaption: a line too wide for the picture shrinks the letters until it fits", () => {
  const long = "A line of forty-two characters, as long...";
  const l = layoutCaption([long], 240, 240, measure);
  assert.ok(l.fontPx < Math.round(240 / 18), `letters of ${l.fontPx} px`);
  assert.ok(l.lines[0].box.width <= 240 * CAPTION_STYLE.maxWidthShare + 1e-9, `the box is ${l.lines[0].box.width} px wide in a 240 px picture`);
  assert.ok(l.lines[0].box.x >= 0);
});

// A canvas context that writes down what it is asked to do.
function fakeContext() {
  const calls = [];
  return {
    calls,
    font: "",
    fillStyle: "",
    textBaseline: "",
    textAlign: "",
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    measureText(text) {
      return { width: text.length * parseFloat(/(\d+(?:\.\d+)?)px/.exec(this.font)[1]) * 0.5 };
    },
    fillRect(...args) {
      calls.push(["rect", this.fillStyle, ...args]);
    },
    fillText(text, x, y) {
      calls.push(["text", this.fillStyle, this.font, text, x, y]);
    },
  };
}

test("drawCaption: a box behind each line, then the letters, and the context left as it was found", () => {
  const ctx = fakeContext();
  const layout = drawCaption(ctx, { lines: ["Speech recognition now", "works in Firefox."] }, 640, 360);
  assert.equal(layout.lines.length, 2);
  assert.deepEqual(ctx.calls.map((c) => c[0]), ["save", "rect", "rect", "text", "text", "restore"]);
  const [, , rect, , text] = ctx.calls;
  assert.equal(rect[1], CAPTION_STYLE.background);
  assert.equal(text[1], CAPTION_STYLE.color);
  assert.equal(text[2], fontOf(layout.fontPx));
  assert.equal(ctx.calls[4][3], "works in Firefox.");
  // The boxes are inside the picture, and in its lower part.
  for (const c of ctx.calls.filter((c) => c[0] === "rect")) assert.ok(c[2] >= 0 && c[2] + c[4] <= 640 && c[3] > 180 && c[3] + c[5] <= 360, JSON.stringify(c));
});

test("drawCaption: nothing on screen, nothing drawn", () => {
  const ctx = fakeContext();
  assert.equal(drawCaption(ctx, null, 640, 360), null);
  assert.equal(drawCaption(ctx, { lines: [] }, 640, 360), null);
  assert.equal(drawCaption(ctx, { lines: [""] }, 640, 360), null);
  assert.deepEqual(ctx.calls, []);
});
