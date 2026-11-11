// Two cameras at once, through getUserMedia(), drawn side by side on a
// canvas whose stream is recorded: camera 1 on the left, camera 2 on the
// right. A recorder keeps one video track, so this is how one file holds
// both. Camera 1 sets the pace: each time it delivers a frame, the canvas is
// drawn with camera 2's latest beside it, and captured. The microphone comes
// with them when the settings ask for audio.
//
// Each camera's own frames are logged as they reach the page
// (requestVideoFrameCallback), with the time the camera took them where the
// browser says (Chromium's captureTime), so each camera's frame rate, gaps
// and delay are measured apart from the recorded picture.

import { lostDevice, settled, userMediaConstraints } from "./user-media.js";

// The tallest the side-by-side picture gets; taller cameras are scaled down.
const MAX_HEIGHT = 1080;
// How long a camera's element may take to start playing: one the browser has stopped never does.
const PLAY_WAIT_MS = 3000;
const even = (x) => 2 * Math.round(x / 2);

// Resolves once the element knows the camera's picture size (or after 2 s).
function sized(video) {
  if (video.videoWidth) return Promise.resolve();
  return new Promise((resolve) => {
    video.addEventListener("resize", resolve, { once: true });
    video.addEventListener("loadedmetadata", resolve, { once: true });
    setTimeout(resolve, 2000);
  });
}

// settings: the bench's camera and microphone settings, as for the camera &
// mic source. devices: a device id for each camera ("" for the default one).
export async function openCameras(settings, devices) {
  const asked = devices.map((id) => userMediaConstraints({ ...settings, video: true, audio: false, videoDevice: id }).video);
  const micAsked = settings.audio ? userMediaConstraints({ ...settings, video: false, audio: true }).audio : null;
  const streams = [];
  const stopAll = () => streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
  try {
    for (const video of asked) streams.push(await navigator.mediaDevices.getUserMedia({ video, audio: false }));
    if (micAsked) streams.push(await navigator.mediaDevices.getUserMedia({ video: false, audio: micAsked }));
  } catch (err) {
    stopAll();
    throw err;
  }
  const cameras = streams.slice(0, devices.length).map((s) => s.getVideoTracks()[0]);
  const mic = micAsked ? streams.at(-1).getAudioTracks()[0] : null;
  // A browser that captures one camera at a time ends camera 1 as camera 2 opens, and camera 1 sets the pace.
  const fail = (err) => {
    stopAll();
    throw err;
  };
  const ended = lostDevice(cameras, "camera");
  if (ended) fail(ended);
  const videos = cameras.map((track) => Object.assign(document.createElement("video"), { muted: true, playsInline: true, srcObject: new MediaStream([track]) }));
  await Promise.all(videos.map((v) => Promise.race([v.play(), new Promise((resolve) => setTimeout(resolve, PLAY_WAIT_MS))]))).catch(fail);
  await Promise.all(videos.map(sized));
  await settled();
  const lost = lostDevice(cameras, "camera", { muted: true });
  if (lost) fail(lost);

  // A box per camera, as tall as camera 1's picture (up to MAX_HEIGHT) and as wide as each camera's shape needs.
  const height = even(Math.min(MAX_HEIGHT, videos[0].videoHeight || 480));
  const boxes = videos.map((v) => even(height * (v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 4 / 3)));
  const canvas = Object.assign(document.createElement("canvas"), { width: boxes.reduce((a, b) => a + b, 0), height });
  const ctx = canvas.getContext("2d");
  const fps = cameras[0].getSettings().frameRate || 30;
  // With a frame rate of 0, a frame is captured only on requestFrame(), right after each drawing.
  // A browser without requestFrame() samples the canvas at camera 1's rate instead.
  let picture = canvas.captureStream(0).getVideoTracks()[0];
  if (!picture.requestFrame) {
    picture.stop();
    picture = canvas.captureStream(fps).getVideoTracks()[0];
  }
  const draw = () => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let x = 0;
    videos.forEach((v, i) => {
      // Each picture fitted into its box, keeping its shape.
      if (v.videoWidth && v.videoHeight) {
        const scale = Math.min(boxes[i] / v.videoWidth, height / v.videoHeight);
        const w = v.videoWidth * scale;
        const h = v.videoHeight * scale;
        ctx.drawImage(v, x + (boxes[i] - w) / 2, (height - h) / 2, w, h);
      }
      x += boxes[i];
    });
    picture.requestFrame?.();
  };

  // Each camera's frames while a take records: runs of { captured, presented, count } (seconds), a run per stretch between pauses.
  let logs = null;
  let paused = false;
  let running = true;
  let timer = 0;
  const timed = Boolean(videos[0].requestVideoFrameCallback);
  if (timed) {
    videos.forEach((v, i) => {
      const onFrame = (now, m) => {
        if (!running) return;
        if (logs && !paused) logs[i].at(-1).push({ captured: m.captureTime != null ? m.captureTime / 1000 : null, presented: (m.presentationTime ?? now) / 1000, count: m.presentedFrames ?? null });
        if (i === 0) draw();
        v.requestVideoFrameCallback(onFrame);
      };
      v.requestVideoFrameCallback(onFrame);
    });
  } else {
    timer = setInterval(draw, 1000 / fps);
  }

  return {
    stream: new MediaStream([picture, ...(mic ? [mic] : [])]),
    asked: { cameras: asked, ...(micAsked ? { audio: micAsked } : {}), layout: { width: canvas.width, height, boxes } },
    // What the track table lists, and what each was asked for.
    sourceTracks: [...cameras, ...(mic ? [mic] : [])],
    // Whether each camera's frames are timed (requestVideoFrameCallback), or the canvas drawn on a timer.
    timed,
    trackAsked: [...asked, ...(mic ? [micAsked] : [])],
    // The frame log, which follows the take: record(), pause(), resume(), and finish() for
    // [{ label, runs }] per camera (null when this browser can't time frames).
    frames: {
      record() {
        logs = timed ? videos.map(() => [[]]) : null;
        paused = false;
      },
      pause() {
        paused = true;
      },
      resume() {
        if (paused && logs) for (const log of logs) log.push([]);
        paused = false;
      },
      finish() {
        const out = logs && cameras.map((track, i) => ({ label: track.label, width: videos[i].videoWidth, height: videos[i].videoHeight, runs: logs[i].filter((run) => run.length) }));
        logs = null;
        return out;
      },
    },
    release() {
      running = false;
      clearInterval(timer);
      for (const v of videos) v.srcObject = null;
      picture.stop();
      stopAll();
    },
  };
}
