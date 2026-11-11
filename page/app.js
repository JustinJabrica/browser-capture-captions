// The capture bench (index.html). Pick a source, preview it with its levels
// and what the browser gave against what was asked for, and record takes.
// While a source is open, a speech model in the page captions what it hears.
// Each take is analysed after Stop and saved, with its files and the
// transcript of what was said while it recorded, in the Takes view; the
// Browser view shows what this browser supports.
//
// A session is an open source: its stream, the layers that made it (the
// source, then the mixed-in microphone and the WebRTC loopback, if on), and
// the PCM tap. A take is one recording made while a session is open.

import { extractTrack } from "../src/container.js";
import { analyseTake } from "../src/take-report.js";
import { burnIn, burnInRealtime, canBurnIn } from "../src/captions/burn-in.js";
import { embedSubtitles } from "../src/captions/embed.js";
import { asJson, asSrt, asText, asVtt, toCues } from "../src/captions/subtitles.js";
import { PcmTap, audioGraph, warmOnGestures } from "../src/audio.js";
import { APIS, browserName, capabilities, env } from "../src/capabilities.js";
import { loopback, mixInMic } from "../src/pipeline.js";
import { AUDIO_TYPES, TakeRecorder, VIDEO_TYPES, chooseType, extensionFor, supportedTypes } from "../src/recorder.js";
import { AUDIO_CODECS, CONTAINERS, VIDEO_CODECS } from "../src/codecs.js";
import { WebCodecsRecorder, hasTrackProcessor, hasWebCodecs } from "../src/webcodecs-recorder.js";
import { displayOptions, openDisplay } from "../src/sources/display.js";
import { openCameras } from "../src/sources/cameras.js";
import { loadFile, playAndCapture } from "../src/sources/media-file.js";
import { openMics } from "../src/sources/mics.js";
import { openSynthetic } from "../src/sources/synthetic.js";
import { listDevices, openUserMedia, userMediaConstraints } from "../src/sources/user-media.js";
import { ofKind } from "../src/speech/registry.js";
import { createCaptions } from "./captions.js";
import { createCompare } from "./compare.js";
import { setupExplainers } from "./explain.js";
import { cardHTML, fillCard, tracksHTML } from "./take-view.js";
import { chooseTranscript, clearTakes, deleteTake, exportTakes, importTakes, listTakes, saveTake, saveTranscript, storageUse, takeMedia, takeTranscripts, transcriptSummary } from "./takes.js";
import {
  $,
  bytes,
  createFilePicker,
  createLog,
  createParams,
  createStatus,
  download,
  esc,
  flashLabel,
  setChip,
  setupDrop,
  setupMenus,
  setupResize,
  showAlert,
  showError,
  storage,
} from "./bench.js";

const alerts = $("alerts");
const preview = $("preview");
const player = $("player");
const status = createStatus($("status"));
const log = createLog({ list: $("log"), count: $("log-count"), filters: $("log-filters"), clear: $("log-clear") });

// --- Settings ---------------------------------------------------------------------------

const supported = navigator.mediaDevices?.getSupportedConstraints?.() ?? {};
const notHere = (name) => (supported[name] ? undefined : "not supported here");
const TRI = [
  ["default", "browser's default"],
  ["on", "on"],
  ["off", "off"],
];
const CAMERA = ["camera"];
// The camera's own settings, which Two cameras asks of both.
const CAMERAS = ["camera", "cameras"];
// The sources whose sound the microphone can be mixed into.
const MIXES = ["screen", "file", "synthetic"];
const SCREEN = ["screen"];

const START_PARAMS = [
  { key: "video", type: "switch", def: true, only: CAMERA, desc: "Ask for a camera." },
  { key: "audio", type: "switch", def: true, only: CAMERAS, desc: "Ask for a microphone." },
  { key: "width", type: "number", def: null, unit: "px", min: 1, only: CAMERAS, tag: notHere("width"), desc: "The picture's width. The browser picks the nearest the camera can do, unless <code>strict</code> is on." },
  { key: "height", type: "number", def: null, unit: "px", min: 1, only: CAMERAS, tag: notHere("height"), desc: "The picture's height." },
  { key: "frameRate", type: "number", def: null, unit: "fps", min: 1, step: 0.01, only: CAMERAS, tag: notHere("frameRate"), desc: "Frames per second." },
  {
    key: "facingMode",
    type: "select",
    def: "any",
    options: [
      ["any", "any camera"],
      ["user", "user (front)"],
      ["environment", "environment (back)"],
    ],
    only: CAMERAS,
    tag: notHere("facingMode"),
    desc: "Which way the camera faces, on phones and tablets.",
  },
  {
    key: "resizeMode",
    type: "select",
    def: "any",
    options: [
      ["any", "browser's choice"],
      ["none", "none (the camera's own sizes)"],
      ["crop-and-scale", "crop-and-scale"],
    ],
    only: CAMERAS,
    tag: notHere("resizeMode"),
    desc: "Whether the browser may crop and scale the camera's picture to reach the size asked for.",
  },
  { key: "echoCancellation", type: "select", def: "default", options: TRI, tag: notHere("echoCancellation"), desc: "Removes the computer's own sound from the microphone. Applies to the microphone: the camera &amp; mic source, or the one mixed in." },
  { key: "noiseSuppression", type: "select", def: "default", options: TRI, tag: notHere("noiseSuppression"), desc: "Filters steady background noise out of the microphone." },
  { key: "autoGainControl", type: "select", def: "default", options: TRI, tag: notHere("autoGainControl"), desc: "Evens out the microphone's loudness." },
  { key: "voiceIsolation", type: "select", def: "default", options: TRI, tag: notHere("voiceIsolation"), desc: "Stronger filtering that keeps only the nearest voice, where the platform has it." },
  { key: "sampleRate", type: "number", def: null, unit: "Hz", min: 8000, step: 1, tag: notHere("sampleRate"), desc: "Samples per second from the microphone." },
  { key: "sampleSize", type: "number", def: null, unit: "bits", min: 8, tag: notHere("sampleSize"), desc: "Bits per sample from the microphone." },
  { key: "channelCount", type: "number", def: null, min: 1, max: 8, tag: notHere("channelCount"), desc: "1 for mono, 2 for stereo." },
  { key: "latency", type: "number", def: null, unit: "ms", min: 0, tag: notHere("latency"), desc: "How long the microphone's audio may take to arrive." },
  { key: "strict", type: "switch", def: false, desc: "Ask for exactly these values (<code>exact</code>), so the browser refuses with an OverconstrainedError rather than give something close." },

  {
    key: "displaySurface",
    type: "select",
    def: "any",
    options: [
      ["any", "the picker decides"],
      ["monitor", "monitor (a whole screen)"],
      ["window", "window"],
      ["browser", "browser (a tab)"],
    ],
    only: SCREEN,
    tag: notHere("displaySurface"),
    desc: "Which kind of surface the browser's picker offers first.",
  },
  { key: "displayAudio", label: "audio", type: "switch", def: false, initial: true, only: SCREEN, desc: "Offer to share sound as well: a tab's, or the whole system's when sharing a screen. Chromium browsers only." },
  { key: "systemAudio", type: "select", def: "default", options: TRI, only: SCREEN, desc: "Whether the picker offers the system's sound when a whole screen is shared." },
  { key: "preferCurrentTab", type: "switch", def: false, only: SCREEN, desc: "Offer this tab first in the picker." },
  { key: "selfBrowserSurface", type: "select", def: "default", options: TRI, only: SCREEN, desc: "Whether this tab is listed in the picker." },
  { key: "surfaceSwitching", type: "select", def: "default", options: TRI, only: SCREEN, desc: "Whether the browser offers a button to switch to another tab while sharing." },
  { key: "monitorTypeSurfaces", type: "select", def: "default", options: TRI, only: SCREEN, desc: "Whether whole screens are listed in the picker." },
  { key: "suppressLocalAudioPlayback", type: "switch", def: false, only: SCREEN, tag: notHere("suppressLocalAudioPlayback"), desc: "Mute a shared tab's sound on this computer while it's captured." },
  { key: "displayFrameRate", label: "frameRate", type: "number", def: null, unit: "fps", min: 1, only: SCREEN, desc: "The frame rate to aim for. The browser may deliver fewer frames while the picture is still." },
  {
    key: "cursor",
    type: "select",
    def: "any",
    options: [
      ["any", "browser's default"],
      ["always", "always"],
      ["motion", "motion"],
      ["never", "never"],
    ],
    only: SCREEN,
    tag: notHere("cursor"),
    desc: "Whether the mouse pointer is drawn into the capture.",
  },

  {
    key: "synthSize",
    label: "size",
    type: "select",
    def: "640x360",
    options: [
      ["640x360", "640 × 360"],
      ["1280x720", "1280 × 720"],
      ["1920x1080", "1920 × 1080"],
    ],
    only: ["synthetic"],
    desc: "The test pattern's size.",
  },
  { key: "synthFps", label: "fps", type: "select", def: "30", options: ["15", "24", "25", "30", "50", "60"].map((v) => [v, v]), only: ["synthetic"], desc: "The test pattern's frame rate." },

  { key: "mixMic", type: "switch", def: false, only: MIXES, desc: "Mix the microphone into the source's sound, with the microphone settings above." },
  { key: "webrtc", type: "switch", def: false, desc: "Send the stream through a WebRTC connection on this page before recording, as a call would deliver it." },
];

const RECORD_TYPES = [...supportedTypes(VIDEO_TYPES), ...supportedTypes(AUDIO_TYPES)];
const RECORD_PARAMS = [
  {
    key: "recorder",
    type: "select",
    def: "mediarecorder",
    options: [["mediarecorder", "MediaRecorder"], ...(hasWebCodecs() ? [["webcodecs", "WebCodecs + Mediabunny"]] : [])],
    desc: "What makes the file: the browser's MediaRecorder, with the settings below, or the bench's own recorder from WebCodecs' encoders, with the WebCodecs tab's.",
  },
  { key: "mimeType", type: "select", def: "", options: [["", "browser's choice"], ...RECORD_TYPES.map((t) => [t, t])], desc: "The container and codecs to record. The list is what this browser says it can record." },
  { key: "videoBitsPerSecond", type: "number", def: null, unit: "kbit/s", min: 1, desc: "The video's target bitrate." },
  { key: "audioBitsPerSecond", type: "number", def: null, unit: "kbit/s", min: 1, desc: "The audio's target bitrate." },
  {
    key: "audioBitrateMode",
    type: "select",
    def: "default",
    options: [
      ["default", "browser's default"],
      ["variable", "variable"],
      ["constant", "constant"],
    ],
    desc: "Whether the audio's bitrate may vary with the sound.",
  },
  { key: "videoKeyFrameIntervalDuration", type: "number", def: null, unit: "ms", min: 1, desc: "The longest time between key frames. Chromium only; other browsers ignore it." },
  { key: "timeslice", type: "number", def: null, initial: 1000, unit: "ms", min: 0, desc: "Deliver the recording in chunks this long, rather than all at once at the end." },
  { key: "maxSeconds", type: "number", def: null, unit: "s", min: 1, desc: "Stop by itself after this long. A bench setting, not MediaRecorder's." },
];

const BROWSER_DEFAULT = ["default", "encoder's default"];
const WEBCODECS_PARAMS = [
  { key: "wcContainer", label: "container", type: "select", def: "webm", options: Object.entries(CONTAINERS).map(([k, c]) => [k, c.label]), desc: "The file the encoded packets are muxed into, by Mediabunny." },
  { key: "wcVideoCodec", label: "video codec", type: "select", def: "vp8", options: Object.entries(VIDEO_CODECS).map(([k, c]) => [k, c.label]), desc: "The VideoEncoder's codec. One the container can't hold is swapped for one it can, and the log says so." },
  { key: "wcAudioCodec", label: "audio codec", type: "select", def: "opus", options: Object.entries(AUDIO_CODECS).map(([k, c]) => [k, c.label]), desc: "The AudioEncoder's codec." },
  { key: "wcVideoBitrate", label: "video bitrate", type: "number", def: null, unit: "kbit/s", min: 1, desc: "The video encoder's target bitrate. Blank leaves it to the encoder." },
  { key: "wcAudioBitrate", label: "audio bitrate", type: "number", def: null, unit: "kbit/s", min: 1, desc: "The audio encoder's target bitrate." },
  { key: "wcBitrateMode", label: "bitrate mode", type: "select", def: "default", options: [BROWSER_DEFAULT, ["variable", "variable"], ["constant", "constant"]], desc: "Whether the bitrate may follow the content (variable) or stays at the target (constant), for both encoders." },
  { key: "wcLatencyMode", label: "latency mode", type: "select", def: "default", options: [BROWSER_DEFAULT, ["quality", "quality"], ["realtime", "realtime"]], desc: "Whether the video encoder may hold frames back to encode them better (quality) or must keep up with a live stream (realtime)." },
  {
    key: "wcHardwareAcceleration",
    label: "hardware",
    type: "select",
    def: "no-preference",
    options: [
      ["no-preference", "no preference"],
      ["prefer-hardware", "prefer hardware"],
      ["prefer-software", "prefer software"],
    ],
    desc: "Whether the video encoder should run on the GPU's media engine or the CPU.",
  },
  { key: "wcKeyFrameEveryS", label: "key frame every", type: "number", def: 2, unit: "s", min: 0.1, step: 0.1, desc: "Ask for a key frame this often. WebCodecs only makes one when asked, after the first." },
  { key: "wcQueueLimit", label: "queue limit", type: "number", def: 8, unit: "frames", min: 1, desc: "Drop a video frame when this many are already waiting in the encoder, as a live encoder must." },
  {
    key: "wcFramePath",
    label: "frames from",
    type: "select",
    def: "auto",
    options: [
      ["auto", "MediaStreamTrackProcessor where there is one"],
      ["fallback", "a <video> element and the tap, always"],
    ],
    desc: "How raw frames reach the encoders. The fallback is what a browser without MediaStreamTrackProcessor uses; forcing it compares the two in one browser.",
  },
];

const ANALYSIS_PARAMS = [
  {
    key: "tapFormat",
    type: "select",
    def: "int16",
    options: [
      ["int16", "16-bit integer"],
      ["float32", "32-bit float (exactly as captured)"],
    ],
    desc: "How tap.wav stores its samples. The 16 kHz copy is always 16-bit.",
  },
  { key: "silenceDb", type: "range", def: -50, min: -90, max: -20, step: 1, unit: "dBFS", desc: "Quieter than this (in 20 ms windows) counts as silence." },
];

// Captions: the speech engine's settings (page/captions.js, src/speech/).
const CAPTION_PARAMS = [
  { key: "captions", type: "switch", def: true, desc: "Caption the source's sound as it plays, with a speech model that runs in this page. Nothing is sent anywhere." },
  {
    key: "ccModel",
    label: "model",
    type: "select",
    def: "auto",
    options: [["auto", "automatic: base.en if it's on this server, else tiny.en"], ...ofKind("asr").map((m) => [m.id, `${m.label} · ${m.loadMB?.wasm ?? m.loadMB?.webgpu} MB`])],
    desc: "The speech model. Bigger models make fewer mistakes and take longer; all of these hear English only, except large-v3-turbo. One that isn't on this server is downloaded from the Hugging Face hub the first time, and the browser keeps it.",
  },
  {
    key: "ccDevice",
    label: "device",
    type: "select",
    def: "wasm",
    options: [
      ["wasm", "WebAssembly (the CPU)"],
      ["webgpu", "WebGPU (the graphics card)"],
    ],
    tag: navigator.gpu ? undefined : "not supported here",
    desc: "Where the model runs. WebAssembly works everywhere; WebGPU runs Whisper's encoder on the graphics card, which is faster only on some machines, and falls back to WebAssembly if it fails.",
  },
  {
    key: "ccVad",
    label: "speech detector",
    type: "select",
    def: "energy",
    options: [
      ["energy", "energy (loudness against the room's noise)"],
      ["webrtc-vad", "WebRTC VAD"],
      ["silero-vad", "Silero VAD (a small model; must be on this server)"],
    ],
    desc: "What decides where speech starts and stops, so the model is given one utterance at a time.",
  },
  { key: "ccVadLevel", label: "WebRTC level", type: "number", def: 2, min: 0, max: 3, step: 1, desc: "WebRTC VAD's aggressiveness, 0 to 3: higher rejects more noise, and can clip quiet words." },
  { key: "ccVadThreshold", label: "Silero threshold", type: "range", def: 0.5, min: 0.05, max: 0.95, step: 0.05, desc: "Silero counts a moment as speech when its probability reaches this." },
  { key: "ccSilenceMs", label: "pause that ends an utterance", type: "number", def: 800, unit: "ms", min: 200, step: 50, desc: "This much quiet after speech ends the utterance, and its final caption follows. Shorter gives captions sooner and cuts sentences in more places." },
  { key: "ccMaxSegmentMs", label: "longest utterance", type: "number", def: 20000, unit: "ms", min: 2000, max: 28000, step: 500, desc: "Speech without a pause is cut after this long. Whisper hears 30 s at a time and drops what's past that." },
  { key: "ccInterim", label: "interim text", type: "switch", def: true, desc: "Show a first guess while someone is still speaking, by transcribing the utterance so far again and again. Off leaves the processor to the recorder until each utterance ends." },
  { key: "ccInterimIntervalMs", label: "interim every", type: "number", def: 500, unit: "ms", min: 100, step: 50, desc: "How often the utterance so far is transcribed again for the interim text, at most." },
  {
    key: "ccWords",
    label: "word times",
    type: "select",
    def: "off",
    options: [
      ["off", "off (subtitles are timed by estimate)"],
      ["whisper", "from Whisper (its timestamped export)"],
      ["align", "by forced alignment (wav2vec2, 95 MB more)"],
    ],
    desc: "Time every word of a final caption, so subtitles can break exactly between words. Either way loads more than the model alone, and adds to each caption's delay.",
  },
  { key: "ccFinalAuto", label: "second pass after each take", type: "switch", def: false, desc: "Transcribe every take again once it's saved, from its finished recording. Otherwise a take's card has a button for it." },
  {
    key: "ccFinalModel",
    label: "second pass model",
    type: "select",
    def: "same",
    options: [["same", "the same as the live captions"], ...ofKind("asr").map((m) => [m.id, `${m.label} · ${m.loadMB?.wasm ?? m.loadMB?.webgpu} MB`])],
    desc: "The model for the second pass. It has no clock to keep up with, so it can be a bigger one than the live captions use. It runs in a worker of its own.",
  },
  {
    key: "ccFinalWords",
    label: "second pass word times",
    type: "select",
    def: "off",
    options: [
      ["off", "off (subtitles are timed by estimate)"],
      ["whisper", "from Whisper (its timestamped export)"],
      ["align", "by forced alignment (wav2vec2, 95 MB more)"],
    ],
    desc: "Whether the second pass times every word, whatever the live captions do.",
  },
  { key: "ccCueChars", label: "subtitle line", type: "number", def: 42, unit: "characters", min: 16, max: 80, step: 1, desc: "The longest line of a subtitle. Read when a take's subtitles are made: for playback and for each download." },
  { key: "ccCueLines", label: "subtitle lines", type: "number", def: 2, min: 1, max: 4, step: 1, desc: "The most lines a subtitle may have." },
  { key: "ccCueSeconds", label: "subtitle on screen", type: "number", def: 6, unit: "s", min: 1, max: 20, step: 0.5, desc: "The longest a subtitle stays up before the next takes over." },
  {
    key: "ccBurnMethod",
    label: "burn captions in with",
    type: "select",
    def: "auto",
    options: [
      ["auto", "WebCodecs where there is one"],
      ["realtime", "a played <video> and a canvas, always"],
    ],
    tag: canBurnIn() ? undefined : "not supported here",
    desc: "How captions are drawn into a copy of the recording. WebCodecs decodes, draws and encodes every frame as fast as the machine can; the other way plays the recording through, which a browser with no VideoEncoder falls back to.",
  },
];

const params = createParams({
  tabList: $("param-tabs"),
  panelHost: $("param-panels"),
  storageKey: "cc:params",
  groups: [
    {
      id: "start",
      title: "Each start",
      badge: "getUserMedia() · getDisplayMedia()",
      when: "Read when a source opens: <b>Start preview</b>, or <b>Record</b> with nothing open. <b>Close source</b> to use a change.",
      params: START_PARAMS,
    },
    {
      id: "record",
      title: "Each record",
      badge: "new MediaRecorder()",
      when: "Read when <b>Record</b> is pressed.",
      status: `<p class="group-when">This browser records ${RECORD_TYPES.length} of the ${VIDEO_TYPES.length + AUDIO_TYPES.length} types the bench asks about. The Browser view lists them.</p>`,
      params: RECORD_PARAMS,
    },
    {
      id: "webcodecs",
      title: "WebCodecs",
      badge: "new VideoEncoder() · new AudioEncoder()",
      when: "Read when <b>Record</b> is pressed with <code>recorder</code> set to WebCodecs, under <b>Each record</b>.",
      status: `<p class="group-when">${
        !hasWebCodecs()
          ? "This browser has no WebCodecs encoders, so only MediaRecorder can record here."
          : hasTrackProcessor()
            ? "This browser has <code>MediaStreamTrackProcessor</code>: frames come straight from the tracks."
            : "This browser has no <code>MediaStreamTrackProcessor</code>: frames come from a <code>&lt;video&gt;</code> element and the tap."
      } The Browser view lists the codecs its encoders take.</p>`,
      params: WEBCODECS_PARAMS,
    },
    {
      id: "captions",
      title: "Captions",
      badge: "Whisper · Transformers.js",
      when: "Read when a source opens. The speech model loads the first time, and again after <code>model</code>, <code>device</code> or <code>word times</code> changes. <b>Close source</b> to use a change. The subtitle settings are read when a take's subtitles are made.",
      params: CAPTION_PARAMS,
    },
    { id: "analysis", title: "Analysis", badge: "after Stop", when: "Used when a take is analysed, after <b>Stop</b>.", params: ANALYSIS_PARAMS },
  ],
});

const captions = createCaptions({ overlay: $("captions"), list: $("transcript-list"), chip: $("speech"), log });
// How a transcript is cut into subtitles, as the Captions tab has it now.
const cueOptions = () => ({ maxChars: params.get("ccCueChars") ?? 42, maxLines: params.get("ccCueLines") ?? 2, maxDurationS: params.get("ccCueSeconds") ?? 6 });

const kbps = (v) => (v == null ? undefined : Math.round(v * 1000));
const cameraSettings = (v) => ({ ...v, videoDevice: $("camera-device").value, audioDevice: $("mic-device").value });
const screenSettings = (v) => ({
  displaySurface: v.displaySurface,
  audio: v.displayAudio,
  systemAudio: v.systemAudio,
  preferCurrentTab: v.preferCurrentTab,
  selfBrowserSurface: v.selfBrowserSurface,
  surfaceSwitching: v.surfaceSwitching,
  monitorTypeSurfaces: v.monitorTypeSurfaces,
  suppressLocalAudioPlayback: v.suppressLocalAudioPlayback,
  frameRate: v.displayFrameRate,
  cursor: v.cursor,
});
const syntheticSettings = (v) => {
  const [width, height] = v.synthSize.split("x").map(Number);
  return { width, height, fps: Number(v.synthFps) };
};

// --- Source picker ------------------------------------------------------------------------

const sourceKind = () => document.body.dataset.source;
const sourceInputs = [...document.querySelectorAll('#source input[name="source"]')];
function useSource(kind) {
  document.body.dataset.source = kind;
  for (const input of sourceInputs) input.checked = input.value === kind;
  storage.set("cc:source", kind);
}
$("source").addEventListener("change", (e) => useSource(e.target.value));
useSource(storage.get("cc:source") ?? "camera");

const filePicker = createFilePicker({ select: $("sample"), input: $("file"), onPick: () => {} });
$("camera-app").addEventListener("change", (e) => e.target.files[0] && filePicker.use(e.target.files[0]));
setupDrop(
  $("drop-overlay"),
  (file) => {
    if (state() !== "idle") return showAlert(alerts, { kind: "warn", title: "Close the source first", hint: "A file can be dropped while nothing is open." });
    useSource("file");
    filePicker.use(file);
  },
  (file) => showAlert(alerts, { kind: "warn", title: "That isn't an audio or video file", detail: `${file.name} (${file.type})` }),
);

// --- State and transport -----------------------------------------------------------------------

// idle, opening, previewing, recording, paused or analysing.
const state = () => document.body.dataset.state;
function setState(s) {
  document.body.dataset.state = s;
  const open = s === "previewing";
  $("start").disabled = s !== "idle";
  $("record").disabled = s !== "idle" && !open;
  $("pause").disabled = s !== "recording" && s !== "paused";
  $("pause").querySelector(".label").textContent = s === "paused" ? "Resume" : "Pause";
  $("stop").disabled = s !== "recording" && s !== "paused";
  $("close").disabled = !open;
  $("whole-file").disabled = s !== "idle" && !open;
  for (const input of sourceInputs) input.disabled = s !== "idle";
  for (const id of ["camera-device", "mic-device", "mics-1", "mics-2", "cams-1", "cams-2", "sample", "file", "camera-app"]) $(id).disabled = s !== "idle";
}

let session = null;
let current = null; // the take being recorded

const describe = (stream) =>
  stream
    .getTracks()
    .map((t) => `${t.kind}: ${t.label || "(no label)"}`)
    .join(" · ") || "no tracks";

async function openSource() {
  const kind = sourceKind();
  const v = params.values();
  alerts.replaceChildren();
  setState("opening");
  status.set("starting", "Opening the source", "");
  log.mark();
  const layers = [];
  let asked = {};
  try {
    let opened;
    // getDisplayMedia() must be the first thing awaited after the click.
    if (kind === "screen") {
      const settings = screenSettings(v);
      log.add("call", "getDisplayMedia()", JSON.stringify(displayOptions(settings)));
      opened = await openDisplay(settings);
      asked = { display: opened.asked };
    } else if (kind === "camera") {
      const settings = cameraSettings(v);
      log.add("call", "getUserMedia()", JSON.stringify(userMediaConstraints(settings)));
      opened = await openUserMedia(settings);
      asked = opened.asked;
    } else if (kind === "mics") {
      const settings = cameraSettings(v);
      const devices = [$("mics-1").value, $("mics-2").value];
      for (const id of devices) log.add("call", "getUserMedia()", JSON.stringify({ audio: userMediaConstraints({ ...settings, video: false, audio: true, audioDevice: id }).audio }));
      opened = await openMics(settings, devices);
      asked = opened.asked;
      log.add("call", "ChannelMergerNode", `${devices.length} microphones, one to a channel`);
    } else if (kind === "cameras") {
      const settings = cameraSettings(v);
      const devices = [$("cams-1").value, $("cams-2").value];
      for (const id of devices) log.add("call", "getUserMedia()", JSON.stringify({ video: userMediaConstraints({ ...settings, video: true, audio: false, videoDevice: id }).video }));
      if (settings.audio) log.add("call", "getUserMedia()", JSON.stringify({ audio: userMediaConstraints({ ...settings, video: false, audio: true }).audio }));
      opened = await openCameras(settings, devices);
      asked = opened.asked;
      const { width, height } = opened.asked.layout;
      log.add("call", "canvas.captureStream()", `${devices.length} cameras side by side, ${width}×${height}${opened.timed ? ", camera 1 setting the pace" : ", drawn on a timer (no requestVideoFrameCallback)"}`);
    } else if (kind === "file") {
      log.add("call", "load", filePicker.name());
      await loadFile(player, filePicker.source());
      opened = await playAndCapture(player);
      asked = { file: { name: filePicker.name(), method: opened.asked.method } };
      log.add("call", opened.asked.method, describe(opened.stream));
    } else {
      opened = await openSynthetic(syntheticSettings(v));
      asked = { synthetic: opened.asked };
    }
    layers.push(opened);
    let stream = opened.stream;
    log.add("life", "resolved", describe(stream));

    let mic = null;
    if (v.mixMic && MIXES.includes(kind)) {
      log.add("call", "getUserMedia()", "the microphone, to mix in");
      const mix = await mixInMic(stream, cameraSettings(v));
      layers.push(mix);
      stream = mix.stream;
      mic = mix.micTrack;
      asked.audio = mix.asked.audio;
    }
    let rtc = null;
    if (v.webrtc) {
      log.add("call", "RTCPeerConnection", "loopback on this page");
      rtc = await loopback(stream, { onEvent: (type, detail) => log.add("life", type, detail) });
      layers.push(rtc);
      stream = rtc.stream;
    }

    session = {
      kind,
      stream,
      layers,
      asked,
      rtc,
      // The tracks the source (and the microphone) delivered, before any mixing or loopback, and
      // for a source of several devices, what each was asked for.
      sourceTracks: [...(opened.sourceTracks ?? opened.stream.getTracks()), mic].filter(Boolean),
      trackAsked: opened.trackAsked ?? null,
      label: labelFor(kind, opened.stream, opened.sourceTracks),
      // Two cameras' own frames, logged while a take records.
      frames: opened.frames ?? null,
      method: asked.file?.method ?? null,
      synthetic: kind === "synthetic" ? opened.asked : null,
      pipeline: { mixMic: Boolean(mic), webrtc: Boolean(rtc) },
      t0: performance.now(),
      trackEvents: new Map(),
      tap: null,
    };
    watchTracks(session);
    preview.srcObject = stream;
    if (stream.getAudioTracks().length) {
      session.tap = await PcmTap.open(stream, { onLevels: meters.update });
      watchContext();
    }
    meters.reset(stream.getAudioTracks().length > 0);
    renderTracks(true);
    setState("previewing");
    status.set("previewing", "Previewing", "");
    // Captions start by themselves and never hold the preview up: the model may still be downloading.
    if (v.captions && !session.tap) log.add("life", "captions", "off: this source has no sound");
    captions.start(session.tap, v);
    refreshDevices();
    refreshPermissions();
  } catch (err) {
    for (const layer of layers.reverse()) layer.release();
    if (session?.layers === layers) session = null;
    log.add("error", "rejected", `${err.name ?? "Error"}: ${err.message ?? err}`);
    showError(alerts, err);
    setState("idle");
    status.set("error", err.name ?? "Error", "");
    throw err;
  }
}

function closeSource() {
  if (!session) return;
  captions.stop();
  session.tap?.close();
  for (const layer of [...session.layers].reverse()) layer.release();
  clearInterval(session.ticker);
  session = null;
  preview.srcObject = null;
  meters.reset(false);
  renderTracks(true);
  log.add("life", "closed", "the source's tracks were stopped");
  setState("idle");
  status.set("idle", "Idle", "");
}

// The source, as the take's list names it.
function labelFor(kind, stream, devices = []) {
  if (kind === "file") return filePicker.name();
  if (kind === "synthetic") return "test pattern";
  const video = stream.getVideoTracks()[0];
  if (kind === "screen") return video?.getSettings?.().displaySurface ?? video?.label ?? "screen";
  if (kind === "mics") return devices.map((t) => t.label || "microphone").join(" + ");
  if (kind === "cameras") return devices.filter((t) => t.kind === "video").map((t) => t.label || "camera").join(" + ");
  return [video?.label, stream.getAudioTracks()[0]?.label].filter(Boolean).join(" + ") || "camera & mic";
}

// Logs every track's ended, mute and unmute, and keeps them for the take. When
// every track has ended (the user stopped sharing, a device was unplugged),
// the take is finished, or the source closed.
function watchTracks(s) {
  for (const track of new Set([...s.sourceTracks, ...s.stream.getTracks()])) {
    for (const type of ["ended", "mute", "unmute"]) {
      track.addEventListener(type, () => {
        const list = s.trackEvents.get(track.id) ?? [];
        list.push({ type, t: Math.round(performance.now() - (current?.t0 ?? s.t0)) });
        s.trackEvents.set(track.id, list);
        log.add(type === "ended" ? "error" : "life", type, `${track.kind}: ${track.label || "(no label)"}`);
        renderTracks(true);
        // Two microphones' stream is Web Audio's, and two cameras' picture a canvas's, which never end
        // by themselves: they're over when both devices have.
        const over = (tracks) => tracks.every((t) => t.readyState === "ended");
        const joined = { mics: "audio", cameras: "video" }[s.kind];
        if (type === "ended" && s === session && (over(s.stream.getTracks()) || (joined && over(s.sourceTracks.filter((t) => t.kind === joined))))) {
          if (current) finishTake("every track ended");
          else closeSource();
        }
      });
    }
  }
  s.stream.addEventListener("addtrack", ({ track }) => log.add("life", "addtrack", `${track.kind}: ${track.label}`));
  s.stream.addEventListener("removetrack", ({ track }) => log.add("life", "removetrack", `${track.kind}: ${track.label}`));
  // A screen share can change size while it runs, so the table is checked now and then.
  s.ticker = setInterval(() => renderTracks(), 2000);
}

// What each track was asked for, how it's set and what it can do.
function trackInfo(s) {
  return s.sourceTracks.map((t) => {
    const isMic = t.kind === "audio" && s.pipeline.mixMic && t === s.sourceTracks.at(-1);
    const asked = s.trackAsked ? s.trackAsked[s.sourceTracks.indexOf(t)] : isMic ? s.asked.audio : (s.asked.display?.[t.kind] ?? s.asked[t.kind]);
    return {
      kind: t.kind,
      label: t.label,
      readyState: t.readyState,
      muted: t.muted,
      contentHint: t.contentHint || "",
      asked: asked && typeof asked === "object" ? asked : {},
      settings: t.getSettings?.() ?? {},
      capabilities: t.getCapabilities?.() ?? {},
      constraints: t.getConstraints?.() ?? {},
      events: s.trackEvents.get(t.id) ?? [],
    };
  });
}

let shownTracks = "";
function renderTracks(force = false) {
  const html = session ? tracksHTML(trackInfo(session)) : "";
  if (!force && html === shownTracks) return;
  shownTracks = html;
  $("tracks").innerHTML = html;
  $("monitor-empty").hidden = Boolean(session);
}

async function record() {
  alerts.replaceChildren();
  if (!session) {
    try {
      await openSource();
    } catch {
      return;
    }
  }
  const s = session;
  const v = params.values();
  // Start the take once audio is reaching the tap (or after 2 s), so the tap and the recorder start together.
  if (s.tap) {
    const waited = await Promise.race([s.tap.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 2000))]);
    if (!waited) log.add("life", "tap", "no audio after 2 s; recording anyway");
  }
  if (s.kind === "file") {
    player.currentTime = 0;
    await player.play().catch(() => {});
  }
  const onEvent = (type, detail) => log.add(type === "error" ? "error" : "result", type, detail);
  const shown = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).filter(([k, x]) => x !== undefined && x !== "" && k !== "tap")));
  let recorder;
  log.mark();
  if (v.recorder === "webcodecs" && hasWebCodecs()) {
    const options = {
      container: v.wcContainer,
      videoCodec: v.wcVideoCodec,
      audioCodec: v.wcAudioCodec,
      videoBitrate: kbps(v.wcVideoBitrate),
      audioBitrate: kbps(v.wcAudioBitrate),
      bitrateMode: v.wcBitrateMode === "default" ? undefined : v.wcBitrateMode,
      latencyMode: v.wcLatencyMode === "default" ? undefined : v.wcLatencyMode,
      hardwareAcceleration: v.wcHardwareAcceleration === "no-preference" ? undefined : v.wcHardwareAcceleration,
      keyFrameEveryS: v.wcKeyFrameEveryS ?? 2,
      queueLimit: v.wcQueueLimit ?? 8,
      framePath: v.wcFramePath,
      tap: s.tap,
    };
    log.add("call", "WebCodecs recorder", shown(options));
    try {
      recorder = await WebCodecsRecorder.create(s.stream, options, { onEvent });
    } catch (err) {
      log.add("error", "WebCodecs recorder", `${err.name}: ${err.message}`);
      showError(alerts, err);
      return;
    }
  } else {
    const hasVideo = s.stream.getVideoTracks().length > 0;
    const mimeType = chooseType(v.mimeType, { hasVideo });
    if (v.mimeType && mimeType !== v.mimeType) log.add("life", "mimeType", `${v.mimeType} → ${mimeType || "browser's choice"}${hasVideo ? "" : " (the stream has no video)"}`);
    const options = {
      mimeType,
      videoBitsPerSecond: kbps(v.videoBitsPerSecond),
      audioBitsPerSecond: kbps(v.audioBitsPerSecond),
      audioBitrateMode: v.audioBitrateMode === "default" ? undefined : v.audioBitrateMode,
      videoKeyFrameIntervalDuration: v.videoKeyFrameIntervalDuration ?? undefined,
      timeslice: v.timeslice || undefined,
    };
    log.add("call", "new MediaRecorder()", shown(options));
    try {
      recorder = new TakeRecorder(s.stream, options, { onEvent });
    } catch (err) {
      log.add("error", "MediaRecorder", `${err.name}: ${err.message}`);
      showError(alerts, err);
      return;
    }
  }
  // The take starts at this frame of the context's clock: the caption in progress is cut there.
  captions.boundary(s.tap?.record());
  s.frames?.record();
  for (const list of s.trackEvents.values()) list.length = 0; // the take keeps its own track events
  current = { recorder, settings: v, startedAt: Date.now(), t0: performance.now(), timer: 0, stopping: false };
  setState("recording");
  status.set("recording", "Recording");
  status.startTimer();
  recorder.done.then(() => current?.recorder === recorder && finishTake("the recorder stopped by itself"));
  if (v.maxSeconds) current.timer = setTimeout(() => finishTake(`maxSeconds (${v.maxSeconds} s) reached`), v.maxSeconds * 1000);
  if (s.kind === "file") player.addEventListener("ended", () => current?.recorder === recorder && finishTake("the file ended"), { once: true });
}

function togglePause() {
  if (!current) return;
  if (current.recorder.state === "recording") {
    current.recorder.pause();
    captions.boundary(session.tap?.pause());
    session.frames?.pause();
    if (session.kind === "file") player.pause();
    setState("paused");
    status.set("paused", "Paused");
  } else {
    current.recorder.resume();
    captions.boundary(session.tap?.resume());
    session.frames?.resume();
    if (session.kind === "file") player.play().catch(() => {});
    setState("recording");
    status.set("recording", "Recording");
  }
}

// "camera-edge142-2026-10-29T10-58-31"
const takeName = (kind, at) => `${kind}-${browserName().replace(/\s+/g, "").toLowerCase()}-${new Date(at).toISOString().slice(0, 19).replace(/:/g, "-")}`;
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

async function finishTake(reason = null) {
  if (!current || current.stopping) return;
  current.stopping = true;
  const take = current;
  const s = session;
  clearTimeout(take.timer);
  if (reason) log.add("life", "stop", reason);
  setState("analysing");
  status.stopTimer();
  status.set("analysing", "Finishing the take", "");
  const [file, tap] = await Promise.all([take.recorder.stop(), s.tap?.recording ? s.tap.finish() : null]);
  // The caption in progress ends with the take. Its text may take the model a
  // few seconds more, which pass while the take is analysed.
  const captioning = tap && captions.run ? captions.boundary(tap.endFrame, { waitMs: 20000 }) : null;
  const cameras = s.frames?.finish() ?? null;
  const webrtc = s.rtc ? await s.rtc.info().catch(() => null) : null;
  const tracks = trackInfo(s);
  if (s.kind === "file") player.pause();
  const r = take.recorder.stats;
  try {
    const { analysis, media } = await analyseTake({
      file,
      tap,
      synthetic: s.synthetic,
      cameras,
      settings: { tapFloat: take.settings.tapFormat === "float32", silenceDb: take.settings.silenceDb },
      onProgress: (label) => {
        status.set("analysing", label, "");
        log.add("life", "analyse", label);
      },
    });
    const report = {
      id: newId(),
      createdAt: take.startedAt,
      name: takeName(s.kind, take.startedAt),
      source: { kind: s.kind, label: s.label, method: s.method, pipeline: s.pipeline },
      env: env(),
      asked: s.asked,
      tracks,
      recorder: r,
      wallS: r.stopMs != null ? Math.round(r.stopMs - r.pausedMs) / 1000 : null,
      webrtc,
      analysis,
      settings: take.settings,
      files: { ext: extensionFor(r.mimeType || file.type) },
    };
    let live = null;
    if (captioning) {
      status.set("analysing", "Waiting for the last captions", "");
      const complete = await captioning;
      live = captions.takeTranscript({ takeId: report.id, tap, analysis, recorder: r, complete });
      if (live) {
        const c = live.clock;
        log.add(
          complete ? "result" : "error",
          "transcript",
          `${live.stats.segments} caption${live.stats.segments === 1 ? "" : "s"}, ${live.stats.words} words · the take starts ${Math.round(c.offsetS * 1000)} ms into the file (${c.offsetFrom})${live.stats.clipped ? ` · ${live.stats.clipped} clipped at the take's edges` : ""}${complete ? "" : " · the model was still working: the last captions are missing"}`,
        );
      }
    }
    const saved = await keep(report, media, { live });
    if (take.settings.ccFinalAuto && media.pcm16k) runSecondPass($("latest"), saved.id);
  } catch (err) {
    log.add("error", "analyse", `${err.name ?? "Error"}: ${err.message ?? err}`);
    showError(alerts, err);
    status.set("error", "Analysis failed", "");
  }
  current = null;
  if (session && session.stream.getTracks().some((t) => t.readyState === "live")) setState("previewing");
  else closeSource();
}

// Analyses the chosen file as it is, without playing or recording it: what
// the file itself holds, for comparing with takes of it played live.
async function analyseWholeFile() {
  alerts.replaceChildren();
  const source = filePicker.source();
  const name = filePicker.name();
  const was = state();
  setState("analysing");
  status.set("analysing", "Reading the file", "");
  log.mark();
  log.add("call", "analyse whole file", name);
  try {
    const file = source instanceof Blob ? source : await (await fetch(source)).blob();
    const { analysis, media } = await analyseTake({
      file,
      settings: { silenceDb: params.get("silenceDb") },
      onProgress: (label) => {
        status.set("analysing", label, "");
        log.add("life", "analyse", label);
      },
    });
    const at = Date.now();
    await keep(
      {
        id: newId(),
        createdAt: at,
        name: takeName("whole-file", at),
        source: { kind: "whole-file", label: name, method: "decodeAudioData()", pipeline: { mixMic: false, webrtc: false } },
        env: env(),
        asked: { file: { name } },
        tracks: [],
        recorder: null,
        wallS: null,
        analysis,
        settings: params.values(),
        files: { ext: name.split(".").pop() || "bin" },
      },
      media,
    );
  } catch (err) {
    log.add("error", "analyse", `${err.name ?? "Error"}: ${err.message ?? err}`);
    showError(alerts, err);
  }
  setState(was === "previewing" && session ? "previewing" : "idle");
}

// Saves a take and shows it under the preview. A take that can't be saved is
// still shown.
async function keep(report, media, transcripts = {}) {
  let saved;
  try {
    saved = await saveTake(report, media, transcripts);
  } catch (err) {
    saved = {
      ...report,
      media: Object.fromEntries(Object.entries(media).map(([k, b]) => [k, Boolean(b)])),
      transcripts: { live: transcriptSummary(transcripts.live), final: transcriptSummary(transcripts.final), chosen: transcripts.final ? "final" : transcripts.live ? "live" : null },
    };
    showAlert(alerts, { kind: "warn", title: "The take couldn't be saved", hint: "It's shown below, but it won't be in Takes. The browser may be out of storage space.", detail: String(err?.message ?? err) });
  }
  const a = report.analysis;
  log.add("result", "take", `${report.name} · ${bytes(a.file.size)}${a.match ? ` · starts ${Math.round(a.match.lagS * 1000)} ms, ends ${Math.round(a.match.endS * 1000)} ms against the tap · match ${a.match.waveScore.toFixed(3)}` : ""}`);
  status.set("done", "Take saved", "");
  showCard($("latest"), saved, media, transcripts);
  await refreshTakes();
  return saved;
}

$("start").addEventListener("click", () => openSource().catch(() => {}));
$("record").addEventListener("click", record);
$("pause").addEventListener("click", togglePause);
$("stop").addEventListener("click", () => finishTake());
$("close").addEventListener("click", closeSource);
$("whole-file").addEventListener("click", analyseWholeFile);

// --- Meters ------------------------------------------------------------------------------------

// One bar per channel: the RMS as the fill, the peak as a line that holds for
// 1.5 s, and the peak in dBFS. The bars span -60 to 0 dBFS.
const meters = (() => {
  const host = $("meters");
  let latest = null;
  let held = [];
  let bars = [];
  let frame = 0;
  const toPct = (x) => Math.max(0, Math.min(100, ((20 * Math.log10(Math.max(x, 1e-6)) + 60) / 60) * 100));
  const names = (n) => (n === 2 ? ["L", "R"] : Array.from({ length: n }, (_, i) => String(i + 1)));
  function build(n) {
    host.innerHTML = names(n)
      .map((name) => `<div class="meter"><span class="meter-name">${name}</span><span class="meter-bar"><i class="rms"></i><i class="peak"></i></span><span class="meter-read">—</span></div>`)
      .join("");
    bars = [...host.querySelectorAll(".meter")];
    held = bars.map(() => ({ value: 0, at: 0 }));
  }
  function draw() {
    frame = 0;
    if (!latest) return;
    const now = performance.now();
    if (bars.length !== latest.peaks.length) build(latest.peaks.length);
    latest.peaks.forEach((peak, i) => {
      if (peak >= held[i].value || now - held[i].at > 1500) held[i] = { value: peak, at: now };
      const bar = bars[i];
      bar.querySelector(".rms").style.width = `${toPct(latest.rms[i])}%`;
      bar.querySelector(".peak").style.left = `${toPct(held[i].value)}%`;
      bar.classList.toggle("clip", held[i].value >= 0.999);
      bar.querySelector(".meter-read").textContent = held[i].value > 0 ? `${(20 * Math.log10(held[i].value)).toFixed(1)} dB` : "silent";
    });
  }
  return {
    update(levels) {
      latest = levels;
      frame ||= requestAnimationFrame(draw);
    },
    reset(on) {
      latest = null;
      host.innerHTML = on ? `<p class="hint">Waiting for audio…</p>` : "";
      bars = [];
    },
  };
})();

// --- Chips -----------------------------------------------------------------------------------------

$("browser").textContent = browserName();
setChip($("secure"), isSecureContext ? "ready" : "error", isSecureContext ? "Secure context" : "Not a secure context", isSecureContext ? "" : "Capture needs https://, or http://localhost or 127.0.0.1");

const PERMISSION_STATE = { granted: "ready", prompt: "unloaded", denied: "error" };
const watched = new Set();
async function refreshPermissions() {
  for (const [id, name, label] of [
    ["perm-camera", "camera", "Camera"],
    ["perm-mic", "microphone", "Microphone"],
  ]) {
    try {
      const result = await navigator.permissions.query({ name });
      const show = () => setChip($(id), PERMISSION_STATE[result.state] ?? "unloaded", `${label}: ${result.state}`);
      show();
      if (!watched.has(name)) {
        watched.add(name);
        result.addEventListener("change", () => {
          show();
          log.add("life", "permission", `${name}: ${result.state}`);
        });
      }
    } catch {
      setChip($(id), "unloaded", `${label}: ?`, "This browser doesn't report this permission");
    }
  }
}

function watchContext() {
  const context = audioGraph.context;
  if (!context) return;
  const show = () =>
    setChip($("context"), context.state === "running" ? "ready" : context.state === "suspended" ? "warn" : "unloaded", `Audio ${context.sampleRate / 1000} kHz · ${context.state}`);
  show();
  if (!context.watched) {
    context.watched = true;
    context.addEventListener("statechange", () => {
      show();
      log.add("life", "statechange", `AudioContext: ${context.state}`);
    });
  }
}

// --- Devices ------------------------------------------------------------------------------------

async function refreshDevices() {
  const { cameras, mics } = await listDevices();
  const fill = (select, list, what) => {
    const value = select.value || storage.get(`cc:${select.id}`) || "";
    select.innerHTML =
      `<option value="">Default ${what}</option>` +
      list.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || `${what} ${i + 1} (no label until allowed)`)}</option>`).join("");
    select.value = list.some((d) => d.deviceId === value) ? value : "";
  };
  fill($("camera-device"), cameras, "camera");
  fill($("mic-device"), mics, "microphone");
  fill($("mics-1"), mics, "microphone");
  fill($("mics-2"), mics, "microphone");
  fill($("cams-1"), cameras, "camera");
  fill($("cams-2"), cameras, "camera");
}
for (const id of ["camera-device", "mic-device", "mics-1", "mics-2", "cams-1", "cams-2"]) $(id).addEventListener("change", (e) => storage.set(`cc:${id}`, e.target.value));
navigator.mediaDevices?.addEventListener?.("devicechange", () => {
  log.add("life", "devicechange", "a camera or microphone was added or removed");
  refreshDevices();
});

// --- Take cards ------------------------------------------------------------------------------------

// Rendered cards' takes, files and transcripts, for their buttons.
const cards = new Map(); // host -> { take, media, transcripts, release }
function showCard(host, take, media, transcripts = {}) {
  cards.get(host)?.release();
  host.innerHTML = cardHTML(take, { deletable: host.id === "compare-detail" });
  const card = host.querySelector(".take");
  cards.set(host, { take, media, transcripts, release: fillCard(card, take, media, { transcript: chosenTranscript(take, transcripts), cueOptions: cueOptions() }) });
}
// The transcript a take's subtitles come from: the one its report names, else whichever there is.
const chosenTranscript = (take, transcripts) => transcripts[take.transcripts?.chosen] ?? transcripts.final ?? transcripts.live ?? null;
function cardAt(el) {
  const host = el.closest(".take")?.parentElement;
  return host ? cards.get(host) : null;
}
document.addEventListener("click", async (e) => {
  const button = e.target.closest(".take [data-download], .take [data-delete], .take [data-action]");
  if (!button) return;
  const entry = cardAt(button);
  if (!entry) return;
  const { take, media, transcripts } = entry;
  if (button.dataset.action === "second-pass") return runSecondPass(button.closest(".take").parentElement, take.id);
  if (button.dataset.delete !== undefined) {
    await deleteTake(take.id);
    log.add("result", "deleted", take.name);
    compare.pick([]);
    return refreshTakes();
  }
  const kind = button.dataset.download;
  if (kind === "audio" || kind === "video") return downloadSolo(button, entry, kind);
  const ext = take.files?.ext ?? "bin";
  if (kind === "report") return download(`${take.name}.json`, JSON.stringify(take, null, 1), "application/json");
  if (["vtt", "srt", "txt", "transcript", "subtitled", "burned"].includes(kind)) {
    const transcript = chosenTranscript(take, transcripts);
    if (!transcript) return;
    // Subtitles are cut from the transcript now, with the Captions tab's limits as they are.
    const cues = () => toCues(transcript.segments, { ...cueOptions(), duration: take.analysis?.file?.probe?.duration ?? Infinity });
    if (kind === "subtitled") return downloadSubtitled(button, entry, asVtt(cues()));
    if (kind === "burned") return downloadBurned(button, entry, cues());
    if (kind === "vtt") return download(`${take.name}.vtt`, asVtt(cues()), "text/vtt");
    if (kind === "srt") return download(`${take.name}.srt`, asSrt(cues()), "application/x-subrip");
    if (kind === "txt") return download(`${take.name}.txt`, asText(transcript.segments), "text/plain");
    return download(`${take.name}-transcript.json`, asJson(transcript, { source: `${take.name}.${ext}` }), "application/json");
  }
  const names = { file: `${take.name}.${ext}`, seekable: `${take.name}-seekable.${ext}`, tap: `${take.name}-tap.wav`, pcm16k: `${take.name}-16k.wav` };
  if (media[kind]) download(names[kind], media[kind]);
});

// Which transcript a card shows and makes its subtitles from: the live captions' or the second pass's.
document.addEventListener("change", async (e) => {
  const input = e.target.closest(".take .transcript-pick input");
  const entry = input && cardAt(input);
  if (!entry) return;
  const host = input.closest(".take").parentElement;
  const updated = (await chooseTranscript(entry.take.id, input.value).catch(() => null)) ?? { ...entry.take, transcripts: { ...entry.take.transcripts, chosen: input.value } };
  showCard(host, updated, entry.media, entry.transcripts);
  refreshTakes();
});

// Transcribes a finished take again, from its 16 kHz copy, and shows the
// result on its card. Passes run one at a time. host: the card's host
// element; id: the take's, to be sure the card still shows it when the pass ends.
let passing = Promise.resolve();
function runSecondPass(host, id) {
  const run = async () => {
    const entry = cards.get(host);
    if (!entry || entry.take.id !== id || !entry.media.pcm16k) return;
    const { take, media, transcripts } = entry;
    const button = host.querySelector('[data-action="second-pass"]');
    const say = (text) => {
      const label = cards.get(host)?.take.id === id ? host.querySelector('[data-action="second-pass"] .label') : null;
      if (label) label.textContent = text;
    };
    if (button) button.disabled = true;
    const settings = params.values();
    log.add("call", "second pass", `${take.name} · ${settings.ccFinalModel === "same" ? "the live captions' model" : settings.ccFinalModel}${settings.ccFinalWords !== "off" ? ` · word times: ${settings.ccFinalWords}` : ""}`);
    try {
      const final = await captions.secondPass({
        take,
        pcm16k: media.pcm16k,
        settings,
        live: transcripts.live ?? null,
        onProgress: ({ phase, done, total }) => say(phase === "loading" ? "Loading the model…" : phase === "speech" ? "Finding the speech…" : `Transcribing ${done} of ${total}…`),
      });
      const s = final.stats;
      const w = s.againstLive;
      log.add("result", "second pass", `${take.name}: ${s.segments} caption${s.segments === 1 ? "" : "s"}, ${s.words} words in ${s.tookS.toFixed(1)} s${s.rtf != null ? ` · model ${s.rtf.toFixed(2)}× the speech` : ""}${w?.words ? ` · the live captions differ in ${w.errors} of ${w.words} words` : ""}`);
      const updated = (await saveTranscript(take.id, "final", final).catch(() => null)) ?? { ...take, transcripts: { live: null, ...take.transcripts, final: transcriptSummary(final), chosen: "final" } };
      // The card may have been replaced while the pass ran; the take keeps its transcript either way.
      if (cards.get(host)?.take.id === id) showCard(host, updated, media, { ...transcripts, final });
      refreshTakes();
    } catch (err) {
      log.add("error", "second pass", err?.message ?? String(err));
      showAlert(alerts, { title: "The recording couldn't be transcribed again", detail: String(err?.message ?? err) });
      const again = cards.get(host)?.take.id === id ? host.querySelector('[data-action="second-pass"]') : null;
      if (again) {
        again.disabled = false;
        say(transcripts.final ? "Transcribe again" : transcripts.live ? "Second pass" : "Transcribe the recording");
      }
    }
  };
  passing = passing.then(run, run);
  return passing;
}

// The recording's sound or picture on its own, copied out when first asked
// for and kept with the card.
async function downloadSolo(button, entry, kind) {
  button.disabled = true;
  entry.solo ??= {};
  try {
    entry.solo[kind] ??= extractTrack(entry.media.file, kind);
    const solo = await entry.solo[kind];
    if (!solo) throw new Error(`No container the bench writes holds this ${kind} codec as it is, and it won't re-encode it`);
    log.add("result", "extract", `${entry.take.name}: ${kind} only, as ${solo.container} · ${bytes(solo.blob.size)}`);
    download(`${entry.take.name}-${kind}.${solo.ext}`, solo.blob);
  } catch (err) {
    entry.solo[kind] = null;
    log.add("error", "extract", `${kind} only: ${err.message ?? err}`);
    showAlert(alerts, { title: `The ${kind} couldn't be copied out on its own`, detail: String(err?.message ?? err) });
  } finally {
    button.disabled = false;
  }
}

// The recording with its subtitles written into it as a track: a copy made
// when asked for, from the take's original recording.
async function downloadSubtitled(button, entry, vtt) {
  if (!entry.media.file) return;
  button.disabled = true;
  try {
    const started = performance.now();
    const made = await embedSubtitles(entry.media.file, vtt);
    log.add("result", "embed", `${entry.take.name}: subtitles written into a ${made.ext.toUpperCase()} copy as a track · ${made.tracks.map((t) => `${t.type} ${t.codec}`).join(" + ")} copied · ${bytes(made.blob.size)} · ${Math.round(performance.now() - started)} ms`);
    download(`${entry.take.name}-subtitled.${made.ext}`, made.blob);
  } catch (err) {
    log.add("error", "embed", err.message ?? String(err));
    showAlert(alerts, { title: "The subtitles couldn't be written into the recording", hint: "The .vtt and .srt downloads hold the same subtitles as files of their own.", detail: String(err?.message ?? err) });
  } finally {
    button.disabled = false;
  }
}

// The recording with its captions drawn into the picture: a copy made when
// asked for. The button shows how far it has got, and a second click cancels.
async function downloadBurned(button, entry, cues) {
  if (entry.burning) return entry.burning.abort();
  if (!entry.media.file) return;
  const label = button.querySelector(".label");
  const name = label.textContent;
  const realtime = params.get("ccBurnMethod") === "realtime" || !canBurnIn();
  entry.burning = new AbortController();
  const started = performance.now();
  log.add("call", "burn in", `${entry.take.name}: ${cues.length} subtitle${cues.length === 1 ? "" : "s"} · ${realtime ? "playing it through a canvas (real time)" : "WebCodecs"}`);
  try {
    const options = { signal: entry.burning.signal, onProgress: (share) => (label.textContent = `Cancel (${Math.round(share * 100)}%)`) };
    label.textContent = "Cancel (0%)";
    const made = realtime ? await burnInRealtime(entry.media.seekable ?? entry.media.file, cues, options) : await burnIn(entry.media.file, cues, options);
    const took = (performance.now() - started) / 1000;
    log.add(
      "result",
      "burn in",
      `${entry.take.name}: captions drawn on ${made.captioned} of ${made.frames} frames, ${made.width}×${made.height} · ${made.method === "webcodecs" ? `${made.videoCodec} in .${made.ext}, the sound copied` : `${made.mimeType}, played and recorded again`} · ${bytes(made.blob.size)} · ${took.toFixed(1)} s`,
    );
    download(`${entry.take.name}-captioned.${made.ext}`, made.blob);
  } catch (err) {
    if (err?.name === "AbortError") log.add("life", "burn in", "cancelled");
    else {
      log.add("error", "burn in", err?.message ?? String(err));
      showAlert(alerts, { title: "The captions couldn't be drawn into the recording", hint: "The <b>with subtitles</b>, .vtt and .srt downloads carry the same subtitles without re-encoding the picture.", detail: String(err?.message ?? err) });
    }
  } finally {
    entry.burning = null;
    label.textContent = name;
  }
}

// --- Takes view ------------------------------------------------------------------------------------

const compare = createCompare({
  host: $("takes"),
  onOpen: async (take, host) => {
    const media = take.imported ? {} : await takeMedia(take.id).catch(() => ({}));
    showCard(host, take, media, await takeTranscripts(take.id).catch(() => ({})));
  },
});

async function refreshTakes() {
  const takes = await listTakes().catch(() => []);
  $("takes-count").textContent = takes.length || "";
  compare.show(takes);
  const use = await storageUse();
  compare.note(use ? `This site stores ${bytes(use.usage)} of ${bytes(use.quota)} allowed` : "");
  return takes;
}

$("takes-export").addEventListener("click", async () => download(`takes-${browserName().replace(/\s+/g, "").toLowerCase()}.json`, await exportTakes(), "application/json"));
$("takes-import").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const added = await importTakes(await file.text());
    log.add("result", "import", `${added} take${added === 1 ? "" : "s"} from ${file.name}`);
    await refreshTakes();
  } catch (err) {
    showAlert(alerts, { title: "Those takes couldn't be imported", hint: "Import takes a .json file made by Export.", detail: String(err.message ?? err) });
  }
});
let clearArmed = 0;
$("takes-clear").addEventListener("click", async (e) => {
  // A second click while the button asks for it (1.5 s) confirms, so a stray click doesn't lose everything.
  const button = e.currentTarget;
  if (Date.now() - clearArmed > 1500) {
    clearArmed = Date.now();
    return flashLabel(button, "Click again to delete all");
  }
  clearArmed = 0;
  await clearTakes();
  log.add("result", "cleared", "every take and its files");
  await refreshTakes();
});

// --- Browser view ----------------------------------------------------------------------------------

let caps = null;
async function showCapabilities() {
  caps = await capabilities({ audio: true });
  const yes = (on) => `<span class="score ${on ? "good" : "bad"}">${on ? "yes" : "no"}</span>`;
  $("caps").innerHTML = `
    <div class="caps">
      <section><h3>APIs</h3><table class="runs"><tbody>${APIS.map(([name, , what]) => `<tr><th scope="row"><code data-explain="api-${esc(name)}">${esc(name)}</code></th><td>${yes(caps.apis[name])}</td><td class="dim">${esc(what)}</td></tr>`).join("")}</tbody></table></section>
      <section><h3>Records</h3><ul class="types">${caps.recordTypes.video.concat(caps.recordTypes.audio).map((t) => `<li><code>${esc(t)}</code></li>`).join("") || "<li>nothing</li>"}</ul>
        <h3>Doesn't record</h3><ul class="types dim">${caps.recordTypes.notRecorded.map((t) => `<li><code>${esc(t)}</code></li>`).join("")}</ul>
        ${
          caps.encoders
            ? `<h3 data-explain="caps-encoders">WebCodecs encoders</h3><table class="runs"><thead><tr><th scope="col">Video, 1280 × 720 at 30 fps</th><th scope="col">Software</th><th scope="col">Hardware</th></tr></thead><tbody>${Object.entries(caps.encoders.video)
                .map(([name, s]) => `<tr><th scope="row">${esc(VIDEO_CODECS[name].label)}<br><code class="dim">${esc(s.codec)}</code></th><td>${yes(s.software)}</td><td>${yes(s.hardware)}</td></tr>`)
                .join("")}</tbody></table>
              <table class="runs"><thead><tr><th scope="col">Audio, 48 kHz stereo</th><th scope="col"></th></tr></thead><tbody>${Object.entries(caps.encoders.audio)
                .map(([name, on]) => `<tr><th scope="row">${esc(AUDIO_CODECS[name].label)}</th><td>${yes(on)}</td></tr>`)
                .join("")}</tbody></table>`
            : `<h3 data-explain="caps-encoders">WebCodecs encoders</h3><p class="dim">none in this browser</p>`
        }
        ${
          caps.trackProcessor
            ? `<h3 data-explain="api-MediaStreamTrackProcessor">MediaStreamTrackProcessor</h3><dl class="kv"><dt>On the page</dt><dd>${yes(caps.trackProcessor.page)}</dd><dt>In a worker</dt><dd>${caps.trackProcessor.worker == null ? "—" : yes(caps.trackProcessor.worker)}</dd><dt>A track sent to a worker</dt><dd>${esc(caps.trackProcessor.transfer ?? "—")}</dd></dl>`
            : ""
        }</section>
      <section><h3>Constraints it understands</h3><p class="constraint-list">${Object.entries(caps.supportedConstraints)
        .filter(([, on]) => on)
        .map(([k]) => `<code data-explain="${esc(k)}">${esc(k)}</code>`)
        .join(" ")}</p>
        <h3>Permissions</h3><dl class="kv">${Object.entries(caps.permissions).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
        <h3>Devices</h3><dl class="kv"><dt>Cameras</dt><dd>${caps.devices.videoinput}</dd><dt>Microphones</dt><dd>${caps.devices.audioinput}</dd><dt>Speakers</dt><dd>${caps.devices.audiooutput}</dd><dt>Labels shown</dt><dd>${caps.devices.labelsVisible ? "yes" : "no, until a device is allowed"}</dd></dl>
        <h3>Audio</h3><dl class="kv">${Object.entries(caps.audioContext ?? {}).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(typeof v === "number" ? Math.round(v * 10000) / 10000 : v)}</dd>`).join("")}</dl>
        <h3>Page</h3><dl class="kv"><dt>Secure context</dt><dd>${yes(caps.secureContext)}</dd><dt>Cross-origin isolated</dt><dd>${yes(caps.crossOriginIsolated)}</dd><dt>Platform</dt><dd>${esc(caps.platform)}</dd></dl></section>
    </div>`;
}
$("caps-refresh").addEventListener("click", showCapabilities);
$("caps-download").addEventListener("click", async () => {
  caps ??= await capabilities({ audio: true });
  download(`capabilities-${browserName().replace(/\s+/g, "").toLowerCase()}.json`, JSON.stringify(caps, null, 1), "application/json");
});

// --- Views -------------------------------------------------------------------------------------------

function showView(view) {
  $("output").dataset.view = view;
  for (const input of document.querySelectorAll('#view input[name="view"]')) input.checked = input.value === view;
  storage.set("cc:view", view);
  if (view === "browser" && !caps) showCapabilities();
  if (view === "takes") refreshTakes();
}
$("view").addEventListener("change", (e) => showView(e.target.value));

// --- Start-up ---------------------------------------------------------------------------------------

setupResize($("dock-handle"), $("log"), { axis: "y", property: "--log-height", key: "cc:dock" });
setupResize($("panel-handle"), $("panel"), { axis: "x", property: "--panel-width", key: "cc:panel" });
setupMenus();
warmOnGestures();
setupExplainers({ bench: "index" });
setState("idle");
showView(storage.get("cc:view") === "takes" ? "takes" : "live");
refreshDevices();
refreshPermissions();
refreshTakes();
if (!isSecureContext) {
  showAlert(alerts, {
    title: "This page isn't a secure context",
    hint: "Browsers only allow capture on <code>https://</code> pages, or on <code>http://localhost</code> and <code>http://127.0.0.1</code>. Open the bench at one of those. From a phone or another computer, the bench's server can serve <code>https://</code>: see \"Other devices on your network\" in the README.",
    detail: location.origin,
  });
}

// The code is running: page/load-check.js stays quiet.
document.documentElement.dataset.ready = "true";

// For the browser tests.
window.captureBench = {
  state,
  get session() {
    return session;
  },
  get latest() {
    return cards.get($("latest"))?.take ?? null;
  },
  listTakes,
  showView,
  useSource,
  params,
  captions,
};
