// What this browser offers for capture, as one JSON-ready report: which
// APIs exist, which constraints it understands, which formats it records,
// the permission states, and its default audio setup. The Browser view shows
// it, and every take keeps the short form (env()).

import { AUDIO_TYPES, VIDEO_TYPES, supportedTypes } from "./recorder.js";
import { encoderSupport } from "./webcodecs-recorder.js";

const has = (path) => {
  let o = globalThis;
  for (const part of path.split(".")) {
    if (o == null || !(part in o)) return false;
    o = o[part];
  }
  return true;
};

// [name shown, test, what it's for]
export const APIS = [
  ["getUserMedia", () => has("navigator.mediaDevices.getUserMedia"), "camera and microphone"],
  ["getDisplayMedia", () => has("navigator.mediaDevices.getDisplayMedia"), "screen, window and tab capture"],
  ["enumerateDevices", () => has("navigator.mediaDevices.enumerateDevices"), "listing cameras and microphones"],
  ["MediaRecorder", () => has("MediaRecorder"), "recording a stream to a file"],
  ["AudioWorklet", () => has("AudioWorkletNode"), "the lossless PCM tap"],
  ["HTMLMediaElement.captureStream", () => has("HTMLMediaElement.prototype.captureStream"), "capturing a playing file"],
  ["HTMLMediaElement.mozCaptureStream", () => has("HTMLMediaElement.prototype.mozCaptureStream"), "Firefox's prefixed version"],
  ["HTMLCanvasElement.captureStream", () => has("HTMLCanvasElement.prototype.captureStream"), "the synthetic source"],
  ["requestVideoFrameCallback", () => has("HTMLVideoElement.prototype.requestVideoFrameCallback"), "per-frame callbacks"],
  ["RTCPeerConnection", () => has("RTCPeerConnection"), "the WebRTC loopback"],
  ["CaptureController", () => has("CaptureController"), "steering a screen capture (focus, zoom)"],
  ["MediaStreamTrackProcessor", () => has("MediaStreamTrackProcessor"), "raw frames from a track (WebCodecs path)"],
  ["VideoEncoder", () => has("VideoEncoder"), "WebCodecs video encoding"],
  ["AudioEncoder", () => has("AudioEncoder"), "WebCodecs audio encoding"],
  ["VideoDecoder", () => has("VideoDecoder"), "reading frames back (sync analysis)"],
  ["ImageCapture", () => has("ImageCapture"), "still photos from a camera"],
  ["SpeechRecognition", () => has("SpeechRecognition") || has("webkitSpeechRecognition"), "the browser's own speech recognition"],
  ["Permissions API", () => has("navigator.permissions.query"), "reading permission states"],
  ["StorageManager.estimate", () => has("navigator.storage.estimate"), "how much the saved takes use"],
];

export function browserName(ua = navigator.userAgent) {
  const match = /(Firefox)\/([\d.]+)/.exec(ua) ?? /(Edg)\/([\d.]+)/.exec(ua) ?? /(Chrome)\/([\d.]+)/.exec(ua) ?? /Version\/([\d.]+).*(Safari)/.exec(ua);
  if (!match) return ua;
  if (match[2] === "Safari") return `Safari ${match[1].split(".").slice(0, 2).join(".")}`;
  const name = match[1] === "Edg" ? "Edge" : match[1];
  return `${name} ${match[2].split(".")[0]}`;
}

export function platformName() {
  return navigator.userAgentData?.platform || navigator.platform || "";
}

// The short form kept with every take.
export function env() {
  return {
    browser: browserName(),
    userAgent: navigator.userAgent,
    platform: platformName(),
    secureContext: isSecureContext,
    crossOriginIsolated: globalThis.crossOriginIsolated ?? false,
  };
}

async function permission(name) {
  try {
    return (await navigator.permissions.query({ name })).state;
  } catch {
    return "unsupported";
  }
}

// Where MediaStreamTrackProcessor is: on the page, and in a dedicated worker
// (where the spec puts it), and whether a track can be transferred to a
// worker, which using it there needs. The transfer is tried with a canvas's
// track, so no camera opens. -> { page, worker, transfer: "yes" | "no (Error)" }
async function trackProcessorPlaces() {
  const out = { page: typeof globalThis.MediaStreamTrackProcessor === "function", worker: null, transfer: null };
  if (typeof Worker === "undefined") return out;
  const src = "onmessage = ({ data }) => postMessage({ processor: typeof MediaStreamTrackProcessor === 'function', track: Boolean(data && data.track) });";
  const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
  const worker = new Worker(url);
  const ask = (message, transfer = []) =>
    new Promise((resolve) => {
      worker.onmessage = ({ data }) => resolve(data);
      try {
        worker.postMessage(message, transfer);
      } catch (err) {
        resolve({ error: err.name });
      }
      setTimeout(() => resolve({ timeout: true }), 2000);
    });
  try {
    out.worker = (await ask({})).processor ?? null;
    const track = document.createElement("canvas").captureStream?.().getVideoTracks()[0];
    if (track) {
      const answer = await ask({ track }, [track]);
      out.transfer = answer.error ? `no (${answer.error})` : answer.track ? "yes" : "no";
      try {
        track.stop();
      } catch {
        // Transferred: it's the worker's now.
      }
    }
  } finally {
    worker.terminate();
    URL.revokeObjectURL(url);
  }
  return out;
}

// The full report. Creating an AudioContext before any click leaves it
// suspended (and warns in Chromium's console), so the audio part is only
// filled in when asked, from a click.
export async function capabilities({ audio = false } = {}) {
  const report = {
    ...env(),
    apis: Object.fromEntries(APIS.map(([name, test]) => [name, test()])),
    supportedConstraints: navigator.mediaDevices?.getSupportedConstraints?.() ?? {},
    recordTypes: {
      video: supportedTypes(VIDEO_TYPES),
      audio: supportedTypes(AUDIO_TYPES),
      notRecorded: [...VIDEO_TYPES, ...AUDIO_TYPES].filter((t) => !supportedTypes([t]).length),
    },
    permissions: { camera: await permission("camera"), microphone: await permission("microphone"), "display-capture": await permission("display-capture") },
    // What the WebCodecs recorder's encoders take here (src/webcodecs-recorder.js).
    encoders: await encoderSupport().catch(() => null),
    trackProcessor: await trackProcessorPlaces().catch(() => null),
  };
  const devices = (await navigator.mediaDevices?.enumerateDevices?.().catch(() => [])) ?? [];
  report.devices = {
    videoinput: devices.filter((d) => d.kind === "videoinput").length,
    audioinput: devices.filter((d) => d.kind === "audioinput").length,
    audiooutput: devices.filter((d) => d.kind === "audiooutput").length,
    labelsVisible: devices.some((d) => d.label),
  };
  if (audio) {
    try {
      const context = new AudioContext();
      report.audioContext = { sampleRate: context.sampleRate, baseLatency: context.baseLatency ?? null, outputLatency: context.outputLatency ?? null, state: context.state };
      await context.close();
    } catch (err) {
      report.audioContext = { error: String(err) };
    }
  }
  return report;
}
