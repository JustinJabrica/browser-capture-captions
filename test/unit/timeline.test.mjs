// Captions on a take's timeline: context frames to take time (the tap's own
// arithmetic), the offset into the saved file, and which captions a take keeps.

import assert from "node:assert/strict";
import { test } from "node:test";
import { without } from "../../src/audio.js";
import { FeedClock } from "../../src/captions/tap-feed.js";
import { TakeTimeline, captionStats, estimatedOffset, fileOffset, placeSegments } from "../../src/captions/timeline.js";

const RATE = 48000;
const s = (seconds) => Math.round(seconds * RATE);

// A take that starts 10 s into the context's life, runs 20 s, with pauses at 4-6 s and 12-13 s of its own start.
const START = s(10);
const take = (gaps = [[s(14), s(16)], [s(22), s(23)]]) => new TakeTimeline({ sampleRate: RATE, startFrame: START, endFrame: s(30), gaps });

test("takeTime: seconds from the take's start, with the pauses left out", () => {
  const plain = take([]);
  assert.equal(plain.takeTime(START), 0);
  assert.equal(plain.takeTime(s(12.5)), 2.5);
  assert.equal(plain.duration, 20);
  const paused = take();
  assert.equal(paused.takeTime(s(13)), 3);
  assert.equal(paused.takeTime(s(17)), 5, "2 s of pause left out");
  assert.equal(paused.takeTime(s(25)), 12, "3 s of pause left out");
  assert.equal(paused.duration, 17);
  assert.equal(paused.pausedFrames, s(3));
});

test("takeTime: before the take is its start, after it its end, inside a pause the moment it paused", () => {
  const t = take();
  assert.equal(t.takeTime(s(2)), 0);
  assert.equal(t.takeTime(s(99)), 17);
  assert.equal(t.takeTime(s(14)), 4);
  assert.equal(t.takeTime(s(15.3)), 4);
  assert.equal(t.takeTime(s(16)), 4);
  assert.equal(t.recorded(s(15)), false);
  assert.equal(t.recorded(s(13.99)), true);
  assert.equal(t.recorded(s(16)), true);
  assert.equal(t.recorded(s(9.99)), false);
  assert.equal(t.recorded(s(30)), false);
});

test("takeTime agrees with the tap's own arithmetic, on random pauses", () => {
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let round = 0; round < 50; round++) {
    const start = Math.floor(random() * 1e6);
    const end = start + 1000 + Math.floor(random() * 1e6);
    const gaps = [];
    let at = start;
    while (at < end && gaps.length < 5) {
      const from = at + Math.floor(random() * 2e5);
      const to = from + 1 + Math.floor(random() * 1e5);
      if (to >= end) break;
      gaps.push([from, to]);
      at = to;
    }
    const t = new TakeTimeline({ sampleRate: RATE, startFrame: start, endFrame: end, gaps });
    // What PcmTap.finish() keeps of [start, frame): the same count of frames.
    for (const frame of [start, end, start + Math.floor(random() * (end - start)), ...gaps.flat()]) {
      const kept = without(start, frame, gaps).reduce((n, [a, b]) => n + Math.max(0, b - a), 0);
      assert.equal(Math.round(t.takeTime(frame) * RATE), kept, `frame ${frame} of [${start}, ${end}) less ${JSON.stringify(gaps)}`);
    }
  }
});

test("gaps are clipped to the take and put in order", () => {
  const t = new TakeTimeline({ sampleRate: RATE, startFrame: 1000, endFrame: 5000, gaps: [[4000, 9000], [0, 1500], [2000, 2000]] });
  assert.deepEqual(t.gaps, [[1000, 1500], [4000, 5000]]);
  assert.equal(t.duration, 2500 / RATE);
});

// A feed whose first sample was context frame s(8): caption seconds 0 is 2 s before the take.
const clock = { rate: RATE, firstFrame: s(8) };
const seg = (id, start, end, more = {}) => ({ id, isFinal: true, start, end, transcript: `segment ${id}`, confidence: 0.9, speaker: null, ...more });

test("placeSegments: a take keeps what was said while it recorded, on the file's timeline", () => {
  const placed = placeSegments(
    [
      seg(1, 0.2, 1.5), // preview, before Record
      seg(2, 2.5, 4.5), // in the take: 0.5-2.5 s
      seg(3, 6.5, 7.5), // inside the first pause
      seg(4, 9, 11), // after the pause: take time 5-7 s
      seg(5, 23, 25), // after Stop
      seg(6, 12, 12.5, { transcript: "" }), // withdrawn
    ],
    clock,
    take(),
    { offsetS: 0.04 },
  );
  assert.deepEqual(placed.map((p) => [p.id, p.start, p.end]), [[2, 0.54, 2.54], [4, 5.04, 7.04]]);
  assert.deepEqual(placed[0].frames, [s(10.5), s(12.5)]);
  assert.equal(placed[0].clipped, undefined);
});

test("placeSegments: a segment that crosses a boundary is clipped to it, and says so; times stay inside the file", () => {
  const placed = placeSegments([seg(1, 1.6, 3.5), seg(2, 5, 6.3), seg(3, 20.5, 22.4)], clock, take(), { offsetS: 0, duration: 16.9 });
  // 1: starts 0.4 s before Record. 2: runs 0.3 s into the pause. 3: runs 0.4 s past Stop, and past the file's end.
  assert.deepEqual(placed.map((p) => [p.id, p.start, p.end, p.clipped]), [[1, 0, 1.5, true], [2, 3, 4, true], [3, 15.5, 16.9, true]]);
  // One the feed cut exactly at the boundary loses no time, and is marked all the same: the speech went on.
  const [cut] = placeSegments([seg(1, 3, 4, { cut: true })], clock, take());
  assert.deepEqual([cut.start, cut.end, cut.clipped], [1, 2, true]);
  // So is one that starts right where the take began or resumed: its beginning was said outside the take.
  const resumed = placeSegments([seg(1, 2.02, 3), seg(2, 8.01, 9), seg(3, 9.5, 10.5)], clock, take());
  assert.deepEqual(resumed.map((p) => [p.id, p.clipped ?? false]), [[1, true], [2, true], [3, false]]);
});

test("placeSegments: words move with their segment, and words outside the take are dropped", () => {
  const words = [
    { word: "before", start: 1.7, end: 1.9 },
    { word: "Record", start: 2.1, end: 2.5 },
    { word: "then", start: 2.6, end: 3.0 },
  ];
  const [p] = placeSegments([seg(1, 1.6, 3.2, { words, latency: 1.2, ms: 800 })], clock, take(), { offsetS: 0.1 });
  assert.deepEqual(p.words, [{ word: "Record", start: 0.2, end: 0.6 }, { word: "then", start: 0.7, end: 1.1 }]);
  assert.equal(p.latency, 1.2);
  assert.equal(p.ms, 800);
});

test("placeSegments with a real feed: a cut at a frame splits an utterance exactly there", () => {
  // The feed's at() is what cuts the utterance at Record; its frame arithmetic is the timeline's.
  const fed = [];
  const feed = new FeedClock(RATE, (pcm) => fed.push(pcm.length));
  const calls = [];
  const block = (frame) => ({ frame, channels: [new Float32Array(4800)] });
  feed.push(block(s(8)));
  feed.at(s(8) + 7200, () => calls.push(feed.fed)); // in the middle of the next block
  feed.at(s(8) + 4800, () => calls.push(feed.fed)); // at its very start: already reached
  feed.push(block(s(8) + 4800));
  feed.push(block(s(8) + 9600));
  assert.deepEqual(calls, [4800, 7200], "each called with exactly the audio before its frame fed");
  assert.equal(feed.fed, 14400);
  // A mark the audio never reaches can be called by hand, once.
  const now = feed.at(s(99), () => calls.push("late"));
  now();
  now();
  assert.deepEqual(calls, [4800, 7200, "late"]);
  // Before anything is fed there is no clock to wait on.
  const empty = new FeedClock(RATE, () => {});
  let called = 0;
  empty.at(123, () => called++);
  assert.equal(called, 1);
});

test("fileOffset: measured from the tap's match when it's good, estimated otherwise", () => {
  const analysis = (waveScore, lagS = 0.031) => ({ match: { lagS, waveScore, driftS: null }, file: { probe: { tracks: [{ type: "video", firstTimestamp: 0 }, { type: "audio", firstTimestamp: 0.012 }] } } });
  assert.deepEqual(fileOffset({ analysis: analysis(0.98), recorder: {}, timeline: take() }), { offsetS: 0.043, offsetFrom: "measured", estimatedS: 0, waveScore: 0.98, driftS: null });
  assert.deepEqual(fileOffset({ analysis: analysis(0.5), recorder: {}, timeline: take() }), { offsetS: 0, offsetFrom: "estimated", estimatedS: 0, waveScore: 0.5, driftS: null });
  assert.equal(fileOffset({ analysis: { file: {} }, recorder: null, timeline: take() }).offsetFrom, "estimated");
});

test("estimatedOffset: the WebCodecs recorder's tap path is exact; MediaRecorder starts with the tap", () => {
  // The recorder stamps a tap block at context frame f as f / rate + offsetS.
  const recorder = { kind: "webcodecs", webcodecs: { audio: { path: "AudioWorklet tap", offsetS: -9.98 } } };
  assert.equal(estimatedOffset({ recorder, timeline: take() }), 0.02);
  assert.equal(estimatedOffset({ recorder: { kind: "webcodecs", webcodecs: { audio: { path: "MediaStreamTrackProcessor", offsetS: -3 } } }, timeline: take() }), 0);
  assert.equal(estimatedOffset({ recorder: { kind: "mediarecorder" }, timeline: take() }), 0);
});

test("captionStats: how many, how late, and whether the model keeps up", () => {
  const stats = captionStats([
    { start: 0, end: 2, transcript: "one two three", latency: 1, ms: 500 },
    { start: 3, end: 5, transcript: "four five", latency: 3, ms: 1500, words: [{}, {}] },
    { start: 6, end: 8, transcript: "six", latency: 2, ms: 1000 },
  ]);
  assert.deepEqual(stats, { segments: 3, words: 6, speechS: 6, latencyS: { median: 2, p95: 3, max: 3 }, rtf: 0.5 });
  assert.deepEqual(captionStats([]), { segments: 0, words: 0, speechS: 0, latencyS: null, rtf: null });
});
