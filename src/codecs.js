// The codecs the WebCodecs recorder can ask for, as WebCodecs codec strings,
// and which containers hold them. No DOM, so the unit tests use it too.
//
// A codec string names the codec and, for most, a profile and level: the
// level caps the picture size and the frame rate the encoder may produce, and
// Chromium rejects a configuration whose picture is too big for its level
// (H.264 at 1280 × 720 needs level 3.1). H.264's level is worked out from
// the picture here; the others use one fixed string at a level that covers
// 1080p at 30 fps, which encoders that check levels accept for smaller
// pictures too.

// H.264 levels (ITU-T H.264, Table A-1): the most macroblocks (16 × 16
// pixels) per second and per frame, and level_idc, the codec string's last byte.
const AVC_LEVELS = [
  { level: "3", idc: 30, mbps: 40500, fs: 1620 },
  { level: "3.1", idc: 31, mbps: 108000, fs: 3600 },
  { level: "3.2", idc: 32, mbps: 216000, fs: 5120 },
  { level: "4", idc: 40, mbps: 245760, fs: 8192 },
  { level: "4.1", idc: 41, mbps: 245760, fs: 8192 },
  { level: "4.2", idc: 42, mbps: 522240, fs: 8704 },
  { level: "5", idc: 50, mbps: 589824, fs: 22080 },
  { level: "5.1", idc: 51, mbps: 983040, fs: 36864 },
  { level: "5.2", idc: 52, mbps: 2073600, fs: 36864 },
  { level: "6", idc: 60, mbps: 4177920, fs: 139264 },
  { level: "6.1", idc: 61, mbps: 8355840, fs: 139264 },
  { level: "6.2", idc: 62, mbps: 16711680, fs: 139264 },
];

// The lowest H.264 level that holds width × height at fps: its frame in
// macroblocks within the level's frame size, each side within √(8 × that)
// macroblocks (Annex A's limit on long thin pictures), and the macroblocks per
// second within its rate. -> { level, idc }, or null when even 6.2 can't.
export function avcLevel(width, height, fps = 30) {
  const w = Math.ceil(width / 16);
  const h = Math.ceil(height / 16);
  const fs = w * h;
  const fits = (l) => fs <= l.fs && w <= Math.sqrt(8 * l.fs) && h <= Math.sqrt(8 * l.fs) && fs * fps <= l.mbps;
  const found = AVC_LEVELS.find(fits);
  return found ? { level: found.level, idc: found.idc } : null;
}

const hex = (n) => n.toString(16).toUpperCase().padStart(2, "0");

// Each video codec the bench offers: its name in Mediabunny, a label, and its
// WebCodecs codec string for a picture of this size and rate.
export const VIDEO_CODECS = {
  vp8: { label: "VP8", codec: () => "vp8" },
  vp9: { label: "VP9 (profile 0, level 4, 8-bit)", codec: () => "vp09.00.40.08" },
  av1: { label: "AV1 (Main, level 4.0, 8-bit)", codec: () => "av01.0.08M.08" },
  // Constrained Baseline (profile_idc 0x42, constraint flags 0xE0): what every
  // H.264 encoder can write, software ones included.
  avc: { label: "H.264 (Constrained Baseline, level by size)", codec: (w, h, fps) => `avc1.42E0${hex(avcLevel(w, h, fps)?.idc ?? 62)}` },
  hevc: { label: "H.265 / HEVC (Main, level 4)", codec: () => "hvc1.1.6.L120.B0" },
};

export const AUDIO_CODECS = {
  opus: { label: "Opus", codec: "opus" },
  aac: { label: "AAC-LC", codec: "mp4a.40.2" },
  vorbis: { label: "Vorbis", codec: "vorbis" },
};

// The containers, and the codecs each holds (as Mediabunny writes them).
export const CONTAINERS = {
  webm: { label: "WebM", video: ["vp8", "vp9", "av1"], audio: ["opus", "vorbis"] },
  mp4: { label: "MP4", video: ["avc", "hevc", "vp9", "av1"], audio: ["aac", "opus"] },
  mkv: { label: "Matroska", video: ["vp8", "vp9", "av1", "avc", "hevc"], audio: ["opus", "vorbis", "aac"] },
};

// The settings for one take, checked against the container: a codec the
// container can't hold is swapped for its first, and the change is said.
// -> { container, video, audio, changes: [text] }
export function fitContainer(container, video, audio) {
  const c = CONTAINERS[container] ?? CONTAINERS.webm;
  const changes = [];
  let v = video;
  let a = audio;
  if (!c.video.includes(v)) {
    changes.push(`${c.label} can't hold ${VIDEO_CODECS[v]?.label ?? v}: ${VIDEO_CODECS[c.video[0]].label} instead`);
    v = c.video[0];
  }
  if (!c.audio.includes(a)) {
    changes.push(`${c.label} can't hold ${AUDIO_CODECS[a]?.label ?? a}: ${AUDIO_CODECS[c.audio[0]].label} instead`);
    a = c.audio[0];
  }
  return { container: CONTAINERS[container] ? container : "webm", video: v, audio: a, changes };
}

// The median, 95th percentile and largest of some numbers (null when there are none).
export function spread(values) {
  if (!values.length) return null;
  const s = [...values].sort((x, y) => x - y);
  const at = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { median: at(0.5), p95: at(0.95), max: s.at(-1), count: s.length };
}
