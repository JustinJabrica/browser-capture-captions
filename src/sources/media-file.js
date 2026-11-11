// A file played in a media element, captured as it plays (see elementStream
// in ../audio.js for how each browser does it). The file is the user's own
// (picked, dropped, or recorded with the phone's camera app through
// <input capture>) or one of the samples.

import { elementStream } from "../audio.js";

// Loads source (a File, Blob or URL) into player and resolves once it can
// play. Rejects with a NotSupportedError when the browser can't play it.
export function loadFile(player, source) {
  if (player.src.startsWith("blob:")) URL.revokeObjectURL(player.src);
  return new Promise((resolve, reject) => {
    const done = () => {
      player.removeEventListener("canplay", ok);
      player.removeEventListener("error", fail);
    };
    const ok = () => {
      done();
      resolve();
    };
    const fail = () => {
      done();
      reject(Object.assign(new Error(player.error?.message || "the browser couldn't load this file"), { name: "NotSupportedError" }));
    };
    player.addEventListener("canplay", ok);
    player.addEventListener("error", fail);
    player.src = source instanceof Blob ? URL.createObjectURL(source) : source;
    player.load();
  });
}

// Plays the loaded file from the start and resolves to its captured stream.
// Some browsers only add the element's tracks once playback starts, so this
// waits for them (or 1 s).
export async function playAndCapture(player) {
  player.currentTime = 0;
  const capture = elementStream(player);
  const expected = (player.videoWidth ? 1 : 0) + 1;
  const arrived = new Promise((resolve) => {
    if (capture.stream.getTracks().length >= expected) return resolve();
    const check = () => capture.stream.getTracks().length >= expected && resolve();
    capture.stream.addEventListener("addtrack", check);
    setTimeout(resolve, 1000);
  });
  await player.play();
  await arrived;
  return {
    stream: capture.stream,
    asked: { method: capture.method },
    release() {
      player.pause();
      capture.stop();
    },
  };
}
