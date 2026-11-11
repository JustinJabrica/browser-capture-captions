// Writes the test pattern (src/pattern.js) as a .y4m video, for Chromium's
// fake camera (--use-file-for-fake-video-capture): each frame shows its
// number, and the first frames of each second flash, so a recording made
// from the fake camera can be checked for dropped and repeated frames.
// Chromium plays the file on a loop at its own frame rate.
//
//   node scripts/make-fixtures.mjs [seconds] [fps] [width] [height]
//
// Raw video is large (a 10 s, 30 fps, 320 x 180 file is about 26 MB), so it
// goes in test/output/, which git ignores. The browser tests call this
// themselves when the file is missing.

import { mkdirSync, openSync, writeSync, closeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patternRects } from "../src/pattern.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const PATTERN_Y4M = join(root, "test", "output", "pattern.y4m");

export function writePattern(path = PATTERN_Y4M, { seconds = 10, fps = 30, width = 320, height = 180, flashFrames = 3 } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const file = openSync(path, "w");
  // 4:2:0, so each frame is a full-size luma plane and two quarter-size chroma planes.
  writeSync(file, `YUV4MPEG2 W${width} H${height} F${fps}:1 Ip A1:1 C420jpeg\n`);
  const chroma = Buffer.alloc((width / 2) * (height / 2) * 2, 128); // grey: no colour
  const luma = Buffer.alloc(width * height);
  for (let n = 0; n < seconds * fps; n++) {
    luma.fill(16); // video black
    for (const r of patternRects(n, { flash: n % fps < flashFrames })) {
      if (!r.white) continue;
      const x0 = Math.round(r.x * width);
      const x1 = Math.round((r.x + r.w) * width);
      const y0 = Math.round(r.y * height);
      const y1 = Math.round((r.y + r.h) * height);
      for (let y = y0; y < y1; y++) luma.fill(235, y * width + x0, y * width + x1); // video white
    }
    writeSync(file, "FRAME\n");
    writeSync(file, luma);
    writeSync(file, chroma);
  }
  closeSync(file);
  return path;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [seconds, fps, width, height] = process.argv.slice(2).map(Number);
  const path = writePattern(PATTERN_Y4M, {
    seconds: seconds || undefined,
    fps: fps || undefined,
    width: width || undefined,
    height: height || undefined,
  });
  console.log(`Wrote ${path}`);
}
