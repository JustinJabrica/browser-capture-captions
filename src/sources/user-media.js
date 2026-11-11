// Camera and microphone, through getUserMedia(). The constraints come from
// the bench's settings: a switch's "default" leaves the browser's own value
// (most turn echo cancellation, noise suppression and gain control on for a
// microphone), and strict asks for exact values, so the browser must refuse
// (OverconstrainedError) rather than give something close.

// "on" -> true, "off" -> false, "default" (or anything else) -> undefined.
const tri = (v) => (v === "on" ? true : v === "off" ? false : undefined);

// Builds getUserMedia()'s constraints from plain settings:
//   { video, audio (switches), videoDevice, audioDevice (device ids or ""),
//     width, height, frameRate, aspectRatio (numbers or null), facingMode, resizeMode,
//     echoCancellation, noiseSuppression, autoGainControl, voiceIsolation ("default" | "on" | "off"),
//     sampleRate, sampleSize, channelCount, latency (numbers or null), strict }
// Leaves out anything not set, so the browser's defaults show in getSettings().
export function userMediaConstraints(o) {
  const value = (v) => (v == null || v === "" ? undefined : o.strict ? { exact: v } : v);
  const pick = (entries) => Object.fromEntries(entries.filter(([, v]) => v !== undefined));
  const video = o.video
    ? pick([
        ["deviceId", o.videoDevice ? { exact: o.videoDevice } : undefined],
        ["width", value(o.width)],
        ["height", value(o.height)],
        ["frameRate", value(o.frameRate)],
        ["aspectRatio", value(o.aspectRatio)],
        ["facingMode", o.facingMode && o.facingMode !== "any" ? value(o.facingMode) : undefined],
        ["resizeMode", o.resizeMode && o.resizeMode !== "any" ? value(o.resizeMode) : undefined],
      ])
    : false;
  const audio = o.audio
    ? pick([
        ["deviceId", o.audioDevice ? { exact: o.audioDevice } : undefined],
        ["echoCancellation", value(tri(o.echoCancellation))],
        ["noiseSuppression", value(tri(o.noiseSuppression))],
        ["autoGainControl", value(tri(o.autoGainControl))],
        ["voiceIsolation", value(tri(o.voiceIsolation))],
        ["sampleRate", value(o.sampleRate)],
        ["sampleSize", value(o.sampleSize)],
        ["channelCount", value(o.channelCount)],
        ["latency", o.latency == null ? undefined : value(o.latency / 1000)],
      ])
    : false;
  // {} means "any device, the browser's defaults", which getUserMedia writes as true.
  const plain = (c) => (c && !Object.keys(c).length ? true : c);
  return { video: plain(video), audio: plain(audio) };
}

export async function openUserMedia(o) {
  const asked = userMediaConstraints(o);
  // getUserMedia() itself would throw a TypeError; this one says why.
  if (!asked.video && !asked.audio) throw Object.assign(new Error("Turn on the camera, the microphone or both"), { name: "NothingRequestedError" });
  const stream = await navigator.mediaDevices.getUserMedia(asked);
  return { stream, asked, release: () => stream.getTracks().forEach((t) => t.stop()) };
}

// Whether a source of several devices still has them all once the last has
// opened. Safari on iOS captures one camera at a time: opening another ends
// the first one's track (WebKit bug 264288), where older versions muted it.
// tracks: the devices' tracks, in the order they were opened; what: "camera"
// or "microphone". Returns the error to throw, or null. A fresh track can be
// muted for a moment, so muted counts only once frames have had time to
// arrive (muted: true).
export function lostDevice(tracks, what, { muted = false } = {}) {
  const i = tracks.findIndex((t) => t.readyState === "ended" || (muted && t.muted));
  if (i < 0) return null;
  const how = tracks[i].readyState === "ended" ? "ended" : "was muted";
  return Object.assign(new Error(`${what} ${i + 1}'s track ${how} as the other ${what} opened: this browser captures one ${what} at a time`), { name: "OneAtATimeError" });
}

// How long the devices run, once all have opened, before lostDevice() looks:
// a device stopped by the next one opening can show it a moment later.
const SETTLE_MS = 300;
export const settled = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

// The cameras and microphones, by kind. Labels are empty until the page has
// had permission for that kind at least once.
export async function listDevices() {
  const devices = (await navigator.mediaDevices?.enumerateDevices?.().catch(() => [])) ?? [];
  const of = (kind) => devices.filter((d) => d.kind === kind).map(({ deviceId, groupId, label }) => ({ deviceId, groupId, label }));
  return { cameras: of("videoinput"), mics: of("audioinput"), speakers: of("audiooutput") };
}
