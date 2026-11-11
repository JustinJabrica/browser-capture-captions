// The pure parts of capture: the constraints and options each source asks
// for, the recorder's choice of type, and what the container probe reads.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { without } from "../../src/audio.js";
import { probe } from "../../src/container.js";
import { AUDIO_TYPES, VIDEO_TYPES, chooseType, extensionFor, supportedTypes } from "../../src/recorder.js";
import { displayOptions } from "../../src/sources/display.js";
import { userMediaConstraints } from "../../src/sources/user-media.js";

test("userMediaConstraints: leaves out what isn't set, so the browser's defaults show", () => {
  assert.deepEqual(userMediaConstraints({ video: true, audio: true, echoCancellation: "default" }), { video: true, audio: true });
  assert.deepEqual(userMediaConstraints({ video: false, audio: false }), { video: false, audio: false });
});

test("userMediaConstraints: values, the switches' three states, and strict", () => {
  const plain = userMediaConstraints({
    video: true,
    audio: true,
    width: 1280,
    frameRate: 30,
    facingMode: "user",
    resizeMode: "any",
    echoCancellation: "off",
    noiseSuppression: "on",
    autoGainControl: "default",
    sampleRate: 48000,
    latency: 20,
    audioDevice: "mic-1",
  });
  assert.deepEqual(plain.video, { width: 1280, frameRate: 30, facingMode: "user" });
  assert.deepEqual(plain.audio, { deviceId: { exact: "mic-1" }, echoCancellation: false, noiseSuppression: true, sampleRate: 48000, latency: 0.02 });
  const strict = userMediaConstraints({ video: true, audio: false, width: 640, strict: true });
  assert.deepEqual(strict, { video: { width: { exact: 640 } }, audio: false });
});

test("displayOptions: only what was set, in getDisplayMedia's words", () => {
  assert.deepEqual(displayOptions({ displaySurface: "any", audio: false }), { video: true, audio: false });
  assert.deepEqual(
    displayOptions({ displaySurface: "browser", audio: true, frameRate: 15, systemAudio: "off", selfBrowserSurface: "on", preferCurrentTab: true, suppressLocalAudioPlayback: true, cursor: "never" }),
    {
      video: { displaySurface: "browser", frameRate: 15, cursor: "never" },
      audio: { suppressLocalAudioPlayback: true },
      systemAudio: "exclude",
      selfBrowserSurface: "include",
      preferCurrentTab: true,
    },
  );
});

test("supportedTypes and chooseType: what a browser records, and the audio-only fallback", () => {
  // As Firefox answers: WebM and Ogg only.
  const firefox = (t) => /^(video|audio)\/webm(;codecs=(vp8|vp9),?opus|;codecs=opus)?$|^audio\/ogg(;codecs=opus)?$/.test(t);
  assert.deepEqual(supportedTypes(AUDIO_TYPES, firefox), ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"]);
  assert.ok(supportedTypes(VIDEO_TYPES, firefox).includes("video/webm;codecs=vp8,opus"));
  assert.equal(chooseType("", { isTypeSupported: firefox }), "");
  assert.equal(chooseType("video/webm;codecs=vp8,opus", { isTypeSupported: firefox }), "video/webm;codecs=vp8,opus");
  // A video type for a stream with no video: the same container's audio type.
  assert.equal(chooseType("video/webm;codecs=vp8,opus", { hasVideo: false, isTypeSupported: firefox }), "audio/webm;codecs=opus");
  // A type the browser doesn't record: the browser's own choice.
  assert.equal(chooseType("video/mp4", { isTypeSupported: firefox }), "");
  assert.deepEqual(supportedTypes(["x"], () => {
    throw new Error("boom");
  }), []);
});

test("without: a tap block less the paused stretches", () => {
  assert.deepEqual(without(0, 100, []), [[0, 100]]);
  assert.deepEqual(without(0, 100, [[20, 30]]), [[0, 20], [30, 100]]);
  assert.deepEqual(without(0, 100, [[-10, 10], [90, 200]]), [[10, 90]]);
  assert.deepEqual(without(0, 100, [[0, 100]]), []);
  assert.deepEqual(without(50, 60, [[0, 40], [70, 80]]), [[50, 60]]);
  assert.deepEqual(without(0, 100, [[10, 20], [40, 50]]), [[0, 10], [20, 40], [50, 100]]);
});

test("extensionFor", () => {
  assert.equal(extensionFor("video/webm;codecs=vp8,opus"), "webm");
  assert.equal(extensionFor("video/mp4;codecs=avc1.42E01E,mp4a.40.2"), "mp4");
  assert.equal(extensionFor("audio/mp4"), "m4a");
  assert.equal(extensionFor("audio/ogg;codecs=opus"), "ogg");
  assert.equal(extensionFor("video/x-matroska;codecs=avc1,opus"), "mkv");
  assert.equal(extensionFor(""), "bin");
});

test("probe: a WAV's container, codec and durations", async () => {
  const blob = new Blob([readFileSync(new URL("../fixtures/fox.wav", import.meta.url))], { type: "audio/wav" });
  const { probe: p, videoTimestamps } = await probe(blob);
  assert.equal(p.container, "WAVE");
  assert.equal(p.tracks.length, 1);
  assert.equal(p.tracks[0].type, "audio");
  assert.equal(p.tracks[0].sampleRate, 16000);
  assert.equal(p.tracks[0].channels, 1);
  assert.ok(Math.abs(p.duration - 4.83) < 0.01);
  assert.equal(p.declaredDuration, p.duration);
  assert.equal(videoTimestamps, null);
});
