// A test signal whose timing is known exactly: a canvas showing each frame's
// number (in the pattern from ../pattern.js) with a white flash at the start
// of every second, and a beep at the start of every second, both timed from
// one AudioContext's clock. Recording it shows how far the browser's
// pipeline pushes sound and picture apart, and which frames it drops or
// repeats, because the analysis reads the numbers and flashes back.

import { patternRects } from "../pattern.js";

// o: { width, height, fps, beepHz, beepMs, flashFrames, levelDb }
export async function openSynthetic(o = {}) {
  const { width = 640, height = 360, fps = 30, beepHz = 1000, beepMs = 100, flashFrames = 3, levelDb = -12 } = o;
  const context = new AudioContext();
  // Not awaited: without a user gesture, resume() can stay pending forever. Until it
  // runs, the clock stands still, so nothing is drawn or beeped.
  context.resume().catch(() => {});
  const canvas = Object.assign(document.createElement("canvas"), { width, height });
  const ctx = canvas.getContext("2d");
  // With a frame rate of 0, a frame is captured only on requestFrame(), right after each
  // one is drawn. A browser without requestFrame() samples the canvas at fps instead.
  let video = canvas.captureStream(0).getVideoTracks()[0];
  if (!video.requestFrame) {
    video.stop();
    video = canvas.captureStream(fps).getVideoTracks()[0];
  }

  const osc = context.createOscillator();
  osc.frequency.value = beepHz;
  const gate = context.createGain();
  gate.gain.value = 0;
  const destination = context.createMediaStreamDestination();
  osc.connect(gate).connect(destination);
  osc.start();

  // Second 0 starts a little ahead, so its frame and its beep are both scheduled in time.
  const t0 = context.currentTime + 0.2;
  const amplitude = 10 ** (levelDb / 20);
  let scheduled = 0; // beeps scheduled so far: second k's starts at t0 + k
  const schedule = () => {
    while (t0 + scheduled < context.currentTime + 2) {
      const at = t0 + scheduled;
      gate.gain.setValueAtTime(0, at);
      gate.gain.linearRampToValueAtTime(amplitude, at + 0.002);
      gate.gain.setValueAtTime(amplitude, at + beepMs / 1000 - 0.002);
      gate.gain.linearRampToValueAtTime(0, at + beepMs / 1000);
      scheduled++;
    }
  };
  schedule();
  const scheduler = setInterval(schedule, 250);

  let last = -1;
  let running = true;
  const draw = () => {
    if (!running) return;
    requestAnimationFrame(draw);
    const n = Math.floor((context.currentTime - t0) * fps);
    if (n < 0 || n === last) return;
    last = n;
    const flash = n % fps < flashFrames;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    for (const r of patternRects(n, { flash })) {
      ctx.fillStyle = r.white ? "#fff" : "#000";
      ctx.fillRect(Math.round(r.x * width), Math.round(r.y * height), Math.round(r.w * width), Math.round(r.h * height));
    }
    // For people watching: the frame and time, and a bar that sweeps once a second.
    ctx.fillStyle = "#9aa4b1";
    ctx.font = `600 ${Math.round(height / 9)}px ui-monospace, Consolas, monospace`;
    ctx.fillText(`frame ${n}`, width * 0.26, height * 0.2);
    ctx.font = `${Math.round(height / 14)}px ui-monospace, Consolas, monospace`;
    ctx.fillText(`${(n / fps).toFixed(3)} s · ${fps} fps`, width * 0.26, height * 0.33);
    ctx.fillStyle = "#5aa2ff";
    ctx.fillRect(width * 0.04 + ((n % fps) / fps) * width * 0.88, height * 0.5, width * 0.04, height * 0.18);
    video.requestFrame?.();
  };
  draw();

  const stream = new MediaStream([video, ...destination.stream.getAudioTracks()]);
  return {
    stream,
    asked: { width, height, fps, beepHz, beepMs, flashFrames, levelDb },
    release() {
      running = false;
      clearInterval(scheduler);
      for (const t of stream.getTracks()) t.stop();
      osc.stop();
      context.close().catch(() => {});
    },
  };
}
