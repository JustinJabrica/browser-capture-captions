// Subtitles written into a recording as a track, without a browser: fox.wav
// is copied into Matroska (as PCM, which needs no encoder), then given a
// subtitle track. Mediabunny can't read a subtitle track back, so the copy is
// checked by its bytes and by the tracks that can be read.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, MkvOutputFormat, Mp4OutputFormat, Output } from "../../vendor/mediabunny/mediabunny.mjs";
import { embedSubtitles, embedTarget, hasMarker } from "../../src/captions/embed.js";
import { asVtt, toCues } from "../../src/captions/subtitles.js";
import { probe } from "../../src/container.js";

const wav = async () => new Blob([await readFile(new URL("../fixtures/fox.wav", import.meta.url))], { type: "audio/wav" });
const VTT = asVtt(toCues([{ start: 0.5, end: 3.3, transcript: "The quick brown fox jumps over the lazy dog." }]));

// fox.wav's audio in another container, its samples copied as they are.
async function recordingAs(format, type) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(await wav()) });
  try {
    const output = new Output({ format, target: new BufferTarget() });
    const conversion = await Conversion.init({ input, output, showWarnings: false });
    if (!conversion.isValid) return null;
    await conversion.execute();
    return new Blob([output.target.buffer], { type });
  } finally {
    input.dispose();
  }
}

const tracksOf = async (blob) => (await probe(blob)).probe.tracks.map((t) => [t.type, t.codec, t.packets, t.firstTimestamp]);

test("embedTarget: a recording keeps its kind of container where that holds subtitles", () => {
  assert.equal(embedTarget("WebM"), "webm");
  assert.equal(embedTarget("Matroska"), "mkv");
  assert.equal(embedTarget("MP4"), "mp4");
  assert.equal(embedTarget("QuickTime File Format"), "mp4");
  assert.equal(embedTarget("Ogg"), "webm", "Ogg holds no subtitle track");
  assert.equal(embedTarget("WAVE"), "mkv");
  assert.equal(embedTarget(), "mkv");
});

test("hasMarker finds bytes anywhere in a file", async () => {
  const blob = new Blob([new Uint8Array([0, 1, 2]), "S_TEXT/WEBVTT", new Uint8Array([3])]);
  assert.equal(await hasMarker(blob, "S_TEXT/WEBVTT"), true);
  assert.equal(await hasMarker(blob, "WEBVTT"), true);
  assert.equal(await hasMarker(blob, "wvtt"), false);
  assert.equal(await hasMarker(new Blob([]), "wvtt"), false);
});

test("Matroska: the copy holds a WebVTT track and the cue's text, with the audio's packets as they were", async () => {
  const mkv = await recordingAs(new MkvOutputFormat(), "audio/x-matroska");
  const made = await embedSubtitles(mkv, VTT);
  assert.equal(made.container, "mkv");
  assert.equal(made.ext, "mkv");
  assert.equal(made.blob.type, "audio/x-matroska");
  assert.deepEqual(made.tracks, [{ type: "audio", codec: "pcm-s16" }]);
  assert.equal(await hasMarker(mkv, "S_TEXT/WEBVTT"), false, "the recording had no subtitle track");
  assert.equal(await hasMarker(made.blob, made.marker), true, "the copy has one");
  assert.equal(await hasMarker(made.blob, "The quick brown fox jumps over the lazy"), true, "with the cue's first line in it");
  assert.equal(await hasMarker(made.blob, "dog."), true);
  assert.deepEqual(await tracksOf(made.blob), await tracksOf(mkv));
  assert.ok(made.blob.size > mkv.size && made.blob.size < mkv.size + 2000, `${made.blob.size} bytes from ${mkv.size}`);
  const { probe: p } = await probe(made.blob);
  assert.ok(Math.abs(p.declaredDuration - 4.83) < 0.01, `declares ${p.declaredDuration} s`);
});

test("MP4: the copy holds a wvtt track", async (t) => {
  const mp4 = await recordingAs(new Mp4OutputFormat({ fastStart: "in-memory" }), "audio/mp4");
  if (!mp4) return t.skip("this Mediabunny doesn't copy PCM into MP4");
  const made = await embedSubtitles(mp4, VTT);
  assert.equal(made.container, "mp4");
  assert.equal(made.marker, "wvtt");
  assert.equal(await hasMarker(mp4, "wvtt"), false);
  assert.equal(await hasMarker(made.blob, "wvtt"), true);
  assert.equal(await hasMarker(made.blob, "The quick brown fox"), true);
  assert.deepEqual(await tracksOf(made.blob), await tracksOf(mp4));
});

test("a recording in a container that holds no subtitles is copied into one that does, or the copy is refused", async () => {
  // WAV's PCM goes into Matroska; nothing is re-encoded to make it fit.
  const made = await embedSubtitles(await wav(), VTT);
  assert.equal(made.container, "mkv");
  assert.equal(await hasMarker(made.blob, "S_TEXT/WEBVTT"), true);
  assert.deepEqual((await tracksOf(made.blob)).map((t) => t.slice(0, 2)), [["audio", "pcm-s16"]]);
});

test("subtitles with no cues still make a valid copy", async () => {
  const mkv = await recordingAs(new MkvOutputFormat(), "audio/x-matroska");
  const made = await embedSubtitles(mkv, asVtt([]));
  assert.deepEqual(await tracksOf(made.blob), await tracksOf(mkv));
});
