// The WebCodecs recorder's codec choices (src/codecs.js): H.264 levels from
// the picture, the containers and the codecs they hold.

import assert from "node:assert/strict";
import { test } from "node:test";
import { AUDIO_CODECS, CONTAINERS, VIDEO_CODECS, avcLevel, fitContainer, spread } from "../../src/codecs.js";

test("H.264's level: the lowest whose macroblock limits (Table A-1) hold the picture at its rate", () => {
  const cases = [
    [640, 480, 30, "3", "avc1.42E01E"], // 1,200 macroblocks, 36,000 a second
    [1280, 720, 30, "3.1", "avc1.42E01F"], // 3,600 exactly: level 3.1's frame size
    [1280, 720, 60, "3.2", "avc1.42E020"],
    [1920, 1080, 30, "4", "avc1.42E028"], // 1080 rows are 68 macroblocks (67.5, rounded up)
    [1920, 1080, 60, "4.2", "avc1.42E02A"],
    [3840, 2160, 30, "5.1", "avc1.42E033"],
    [3840, 2160, 60, "5.2", "avc1.42E034"],
  ];
  for (const [w, h, fps, level, codec] of cases) {
    assert.equal(avcLevel(w, h, fps).level, level, `${w}×${h} at ${fps}`);
    assert.equal(VIDEO_CODECS.avc.codec(w, h, fps), codec);
  }
  // A long thin picture is held back by the √(8 × frame size) limit on each side, not its area.
  assert.equal(avcLevel(4096, 16, 30).level, "4"); // 256 macroblocks wide: level 4's side limit, √(8 × 8192), exactly
  assert.equal(avcLevel(4112, 16, 30).level, "4.2"); // 257: past it
  assert.equal(avcLevel(16384, 16384, 30), null);
});

test("every offered codec is in some container, and fitContainer swaps what a container can't hold", () => {
  for (const name of Object.keys(VIDEO_CODECS)) assert.ok(Object.values(CONTAINERS).some((c) => c.video.includes(name)), name);
  for (const name of Object.keys(AUDIO_CODECS)) assert.ok(Object.values(CONTAINERS).some((c) => c.audio.includes(name)), name);
  assert.deepEqual(fitContainer("webm", "vp9", "opus"), { container: "webm", video: "vp9", audio: "opus", changes: [] });
  const mp4 = fitContainer("mp4", "vp8", "vorbis");
  assert.deepEqual([mp4.video, mp4.audio, mp4.changes.length], ["avc", "aac", 2]);
  const webm = fitContainer("webm", "avc", "aac");
  assert.deepEqual([webm.video, webm.audio], ["vp8", "opus"]);
  assert.equal(fitContainer("nonsense", "vp8", "opus").container, "webm");
});

test("spread: median, 95th percentile and largest", () => {
  assert.equal(spread([]), null);
  const s = spread(Array.from({ length: 100 }, (_, i) => i + 1));
  assert.deepEqual([s.median, s.p95, s.max, s.count], [51, 96, 100, 100]);
});
