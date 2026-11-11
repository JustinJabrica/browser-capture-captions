// One take, as a card: its recording to play, with its captions as
// subtitles, the tap's and the file's waveforms one above the other, its
// transcript, the measurements with a verdict where there's a sensible bar,
// what was asked for against what the browser gave, and the whole report.
// Shared by the bench (the latest take) and the Takes view (the one opened).

import { asVtt, cueAt, toCues } from "../src/captions/subtitles.js";
import { bytes, clock, esc, icon } from "./bench.js";

const ms = (s) => (s == null ? "—" : `${Math.round(s * 1000)} ms`);
const signedMs = (s) => (s == null ? "—" : `${s > 0 ? "+" : ""}${Math.round(s * 1000)} ms`);
const sec = (s, d = 2) => (s == null ? "—" : `${s.toFixed(d)} s`);
// Silence is -Infinity dBFS, which JSON (an exported take) turns into null.
const db = (x) => (x === undefined ? "—" : x === null || x === -Infinity ? "silent" : `${x.toFixed(1)} dBFS`);
const pct = (x, d = 1) => (x == null ? "—" : `${(x * 100).toFixed(d)}%`);
const num = (x) => (x == null ? "—" : x.toLocaleString());
const lufs = (x) => (x === undefined ? "—" : x === null || x === -Infinity ? "silent" : `${x.toFixed(1)} LUFS`);
const khz = (hz) => (hz == null ? "—" : `${(hz / 1000).toFixed(1)} kHz`);

// The sound may trail the picture by up to 125 ms, or lead it by 45 ms, before
// viewers tend to notice (ITU-R BT.1359's detectability thresholds).
export const SYNC_OK = { lead: -0.045, lag: 0.125 };
// The bench's own bars: the file's sound starting or ending within 100 ms of
// the tap's, drifting by no more than 45 ms over a take, and matching its
// waveform with a correlation of at least 0.9.
export const EDGE_OK = 0.1;
export const DRIFT_OK = 0.045;
export const MATCH_OK = 0.9;
// The recorder shouldn't change how loud the take is: within 1 LU of the tap.
export const LOUDNESS_OK = 1;

// [label, value, verdict ("good" | "bad" | ""), topic] rows, by group.
export function metricGroups(t) {
  const a = t.analysis ?? {};
  const probe = a.file?.probe;
  const videoTrack = probe?.tracks.find((x) => x.type === "video");
  const audioTrack = probe?.tracks.find((x) => x.type === "audio");
  // Ogg has nowhere to declare a duration: players read it from the last page.
  const ogg = /^ogg$/i.test(probe?.container ?? "");
  const declared = !probe ? "—" : a.file.declaresDuration ? sec(probe.declaredDuration) : ogg ? "none (Ogg keeps it in its last page)" : `none${a.file.remuxed ? " (seekable copy made)" : ""}`;
  const groups = [];
  groups.push([
    "Durations",
    [
      ["Recording (wall clock)", sec(t.wallS), "", "m-wall"],
      ["File, from its packets", sec(probe?.duration), "", "m-container"],
      ["File, as it declares", declared, probe && !ogg ? (a.file.declaresDuration ? "good" : "bad") : "", "m-declared"],
      ["Decoded audio", sec(a.decoded?.duration), "", "m-decoded"],
      ["Tap", sec(a.tap?.duration), "", "m-tap"],
    ],
  ]);
  groups.push([
    "Audio",
    [
      ["Tap", a.tap ? `${num(a.tap.sampleRate)} Hz · ${a.tap.channels} ch` : "—", "", "m-tap-format"],
      ["File's audio track", audioTrack ? `${audioTrack.codec ?? "?"} · ${num(audioTrack.sampleRate)} Hz · ${audioTrack.channels} ch${audioTrack.bitrate ? ` · ${Math.round(audioTrack.bitrate / 1000)} kbit/s` : ""}` : probe ? "none" : "—", "", "m-audio-track"],
      ["Tap level (peak · RMS)", a.tap ? a.tap.levels.map((l) => `${db(l.peakDb)} · ${db(l.rmsDb)}`).join(" / ") : "—", "", "m-levels"],
      ["Clipped samples", a.tap ? pct(a.tap.levels.reduce((s, l) => s + l.clippedShare, 0) / a.tap.levels.length, 3) : "—", a.tap ? (a.tap.levels.some((l) => l.clipped > 0) ? "bad" : "good") : "", "m-clipped"],
      ["Silence (tap · 16 kHz)", `${pct(a.tap?.silenceShare, 0)} · ${pct(a.extracted?.silenceShare, 0)}`, "", "m-silence"],
      ["Lost or empty tap frames", a.tap ? `${num(a.tap.lostFrames)} · ${num(a.tap.emptyFrames)}` : "—", a.tap ? (a.tap.lostFrames ? "bad" : "good") : "", "m-lost"],
    ],
  ]);
  // Takes analysed before these were measured have none.
  if (a.sound) {
    const { tap, file } = a.sound;
    const both = (f) => `${f(tap)} · ${f(file)}`;
    // To a tenth of an LU, so a change too small to show reads 0.0 rather than -0.0.
    const change = a.sound.changeLu == null ? null : Math.round(a.sound.changeLu * 10) / 10 || 0;
    const act = a.activity;
    groups.push([
      "Sound",
      [
        ["Loudness (tap · file)", both((s) => lufs(s?.lufs)), "", "m-loudness"],
        ["Loudness change (file against tap)", change == null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)} LU`, change == null ? "" : Math.abs(change) <= LOUDNESS_OK ? "good" : "bad", "m-loudness-change"],
        ["Loudest moment (tap · file)", both((s) => lufs(s?.maxMomentaryLufs)), "", "m-momentary"],
        ["Noise floor · loud level (tap)", tap ? `${db(tap.floorDb)} · ${db(tap.loudDb)}` : "—", "", "m-noise-floor"],
        ["Noise floor · loud level (file)", file ? `${db(file.floorDb)} · ${db(file.loudDb)}` : "—", "", "m-noise-floor"],
        ["Bandwidth (tap · file)", both((s) => khz(s?.bandwidthHz)), "", "m-bandwidth"],
        ["DC offset (tap)", a.tap?.levels?.[0]?.dc !== undefined ? a.tap.levels.map((l) => (l.dc == null ? "—" : l.dc.toFixed(4))).join(" / ") : "—", "", "m-dc"],
        ["Stretches of sound · longest pause", act ? `${num(act.count)} · ${act.longestPauseS == null ? "none" : sec(act.longestPauseS)}` : "—", "", "m-segments"],
        ["Sound in the 16 kHz copy", act && a.extracted ? `${sec(act.soundS, 1)} of ${sec(a.extracted.duration, 1)}` : "—", "", "m-segments"],
      ],
    ]);
  }
  if (a.channels) {
    const c = a.channels;
    groups.push([
      "Channels",
      [
        // Fewer channels in the file only loses something when the tap's channels differ.
        ["Channels (tap · file)", `${c.tap} · ${c.file ?? "—"}${c.file < c.tap && c.same ? " (the tap's were the same)" : ""}`, c.file == null || (c.file < c.tap && c.same) ? "" : c.file >= c.tap ? "good" : "bad", "m-channels"],
        ["Channel 2 against 1", c.identical ? "identical (the same signal twice)" : `${signedMs(c.lagS)} · waveform match ${c.waveScore.toFixed(3)}${c.same ? " (the same sound)" : ""}`, "", "m-channel-pair"],
        // loudestTied: takes made before ties were counted apart don't have it.
        ["Loudest channel, share of sound", [...c.loudest.map((x, i) => `${i + 1}: ${pct(x, 0)}`), ...(c.loudestTied != null ? [`tied: ${pct(c.loudestTied, 0)}`] : [])].join(" · "), "", "m-loudest-channel"],
      ],
    ]);
  }
  if (a.cameras) {
    const { list, clock, offsetS } = a.cameras;
    const each = (f) => list.map((c, i) => `${i + 1}: ${f(c)}`).join(" · ");
    groups.push([
      "Cameras",
      [
        ["Timed from", clock === "capture" ? "when each frame was taken" : "when each frame reached the page", "", "m-camera-frames"],
        ["Picture size", each((c) => `${c.width}×${c.height}`), "", "m-camera-frames"],
        ["Frames · frame rate", each((c) => `${num(c.frames)} · ${c.fps ?? "—"} fps`), "", "m-camera-frames"],
        ["Gaps (dropped frames)", each((c) => `${num(c.gaps)} (${num(c.dropped)})`), list.some((c) => c.dropped) ? "bad" : "good", "m-camera-dropped"],
        ["Frames the page missed", each((c) => num(c.missed)), "", "m-camera-dropped"],
        ["Longest gap · jitter", each((c) => `${ms(c.maxGapS)} · ${ms(c.jitterS)}`), "", "m-camera-dropped"],
        ["Taken to reaching the page", list.some((c) => c.delayS != null) ? each((c) => ms(c.delayS)) : "— (this browser doesn't say when frames were taken)", "", "m-camera-delay"],
        ["Camera 2's frames against 1's", signedMs(offsetS), "", "m-camera-offset"],
      ],
    ]);
  }
  if (a.match) {
    groups.push([
      "File against tap",
      [
        ["Starts (file against tap)", signedMs(a.match.lagS), Math.abs(a.match.lagS) <= EDGE_OK ? "good" : "bad", "m-offset"],
        ["Ends (file against tap)", a.match.endS == null ? "—" : signedMs(a.match.endS), a.match.endS == null ? "" : Math.abs(a.match.endS) <= EDGE_OK ? "good" : "bad", "m-end"],
        ["Drift over the take", a.match.driftS == null ? "too short to tell" : signedMs(a.match.driftS), a.match.driftS == null ? "" : Math.abs(a.match.driftS) <= DRIFT_OK ? "good" : "bad", "m-drift"],
        // No verdict: the loudness can follow closely even where the waveform doesn't, and the reverse.
        ["Loudness match", a.match.envelopeScore.toFixed(3), "", "m-envelope"],
        ["Waveform match", a.match.waveScore.toFixed(3), a.match.waveScore >= MATCH_OK ? "good" : "bad", "m-wave"],
      ],
    ]);
  }
  // The captions said while the take recorded, as its report keeps them (without their text).
  const live = t.transcripts?.live;
  if (live) {
    const e = live.engine ?? {};
    const s = live.stats ?? {};
    const c = live.clock ?? {};
    const late = s.latencyS;
    groups.push([
      "Captions",
      [
        ["Speech model", `${esc(e.label ?? e.model ?? "?")} · ${e.device === "webgpu" ? "WebGPU" : `WebAssembly, ${num(e.threads)} thread${e.threads === 1 ? "" : "s"}`} · ${e.from === "same-origin" ? "this server" : "Hugging Face hub"}`, e.fallback ? "bad" : "", "m-cc-model"],
        ["Captions · words · interim texts", `${num(s.segments)} · ${num(s.words)} · ${num(s.interims)}${live.incomplete ? " (the last are missing: the model was still working)" : ""}`, live.incomplete ? "bad" : "", "m-cc-segments"],
        ["Caption delay (median · 95th · max)", late ? `${sec(late.median)} · ${sec(late.p95)} · ${sec(late.max)}` : "—", "", "m-cc-latency"],
        ["Model time against speech", s.rtf == null ? "—" : `${s.rtf.toFixed(2)}× (${sec(s.speechS, 1)} of speech)`, s.rtf == null ? "" : s.rtf < 1 ? "good" : "bad", "m-cc-rtf"],
        ["Take starts in the file at", c.offsetS == null ? "—" : `${signedMs(c.offsetS)} (${c.offsetFrom}${c.offsetFrom === "measured" && c.estimatedS != null ? `; estimated ${signedMs(c.estimatedS)}` : ""})`, c.offsetFrom === "measured" ? "good" : "", "m-cc-offset"],
        ["Clipped at the take's edges · lost frames", `${num(s.clipped)} · ${num(c.lostFrames)}`, c.lostFrames ? "bad" : "", "m-cc-clipped"],
        ["Word times", e.wordsFrom ? (e.wordsFrom === "align" ? "forced alignment" : e.wordsFrom === "frames" ? "the model's frames" : "Whisper's attention") : "estimated from the text", "", "ccWords"],
      ],
    ]);
  }
  if (videoTrack || a.video) {
    groups.push([
      "Video",
      [
        ["File's video track", videoTrack ? `${videoTrack.codec ?? "?"}${videoTrack.codecString && videoTrack.codecString !== videoTrack.codec ? ` (<code>${esc(videoTrack.codecString)}</code>)` : ""} · ${videoTrack.width}×${videoTrack.height}${videoTrack.bitrate ? ` · ${Math.round(videoTrack.bitrate / 1000)} kbit/s` : ""}` : "—", "", "m-video-track"],
        ["Frames · frame rate", a.video ? `${num(a.video.frames)} · ${a.video.fps ?? "—"} fps` : "—", "", "m-frames"],
        ["Key frames", videoTrack?.keyFrames != null ? num(videoTrack.keyFrames) : "—", "", "m-keyframes"],
        ["Gaps (dropped frames)", a.video ? `${num(a.video.gaps)} (${num(a.video.dropped)})` : "—", a.video ? (a.video.dropped ? "bad" : "good") : "", "m-dropped"],
        ["Longest gap · jitter", a.video ? `${ms(a.video.maxGapS)} · ${ms(a.video.jitterS)}` : "—", "", "m-jitter"],
      ],
    ]);
  }
  if (a.sync) {
    const s = a.sync;
    const off = s.offsetS?.median;
    groups.push([
      "Test signal",
      s.frames
        ? [
            ["Frame numbers read", `${num(s.frames.frames - s.frames.unreadable)} of ${num(s.frames.frames)} (${s.frames.first ?? "—"}–${s.frames.last ?? "—"})`, s.frames.unreadable ? "bad" : "good", "m-codes"],
            ["Missing · repeated frames", `${num(s.frames.missing)} · ${num(s.frames.repeated)}`, s.frames.missing ? "bad" : "good", "m-missing"],
            ["Flashes · beeps", `${s.flashes} · ${s.beeps}`, "", "m-flashes"],
            ["A/V offset (median)", off == null ? "—" : `${off >= 0 ? "+" : ""}${ms(off)}`, off == null ? "" : off >= SYNC_OK.lead && off <= SYNC_OK.lag ? "good" : "bad", "m-av-offset"],
            ["A/V offset range", s.offsetS?.min == null ? "—" : `${ms(s.offsetS.min)} to ${ms(s.offsetS.max)}`, "", "m-av-offset"],
          ]
        : [["Frames", esc(s.error ?? "not read"), "bad", "m-codes"]],
    ]);
  }
  if (t.recorder?.kind === "webcodecs") {
    const r = t.recorder;
    const w = r.webcodecs;
    groups.push([
      "Recorder",
      [
        ["Recorder", "WebCodecs, muxed by Mediabunny", "", "recorder"],
        ["Type it wrote", r.mimeType ? `<code>${esc(r.mimeType)}</code>` : "—", "", "wcContainer"],
        ["Asked for", `${esc(r.asked.container)} · ${esc(r.asked.videoCodec)} · ${esc(r.asked.audioCodec)}`, "", "group-webcodecs"],
        ["First frame after", r.startMs == null ? "—" : `${num(r.startMs)} ms`, "", "m-wc-first-frame"],
        ["Packets · bytes", `${num(r.chunks)} · ${bytes(r.bytes)}`, "", "m-wc-packets"],
        ["Error", r.error ? esc(r.error) : "none", r.error ? "bad" : "good", "event-error"],
      ],
    ]);
    const latency = (l) => (l ? `${l.median} · ${l.p95} · ${l.max} ms` : "—");
    const config = (s) => (s.config ? `<code>${esc(JSON.stringify(s.config))}</code>${s.supported === false ? " (isConfigSupported says no)" : ""}` : "—");
    if (w.video) {
      const v = w.video;
      groups.push([
        "WebCodecs video",
        [
          ["Frames from", esc(v.path), "", "wcFramePath"],
          ["Encoder config", config(v), v.supported === false ? "bad" : "", "m-wc-config"],
          ["Frames in · encoded · dropped", `${num(v.framesIn)} · ${num(v.encoded)} · ${num(v.dropped)}`, v.dropped ? "bad" : "good", "m-wc-dropped"],
          ["Key frames asked · written", `${num(v.keyFramesAsked)} · ${num(v.keyFramesOut)}`, v.keyFramesOut >= v.keyFramesAsked ? "good" : "bad", "m-wc-keyframes"],
          ["Most frames waiting", `${num(v.maxQueue)} (limit ${num(w.queueLimit)})`, "", "wcQueueLimit"],
          ["Encode latency (median · 95th · max)", latency(v.latencyMs), "", "m-wc-latency"],
        ],
      ]);
    }
    if (w.audio) {
      const a = w.audio;
      groups.push([
        "WebCodecs audio",
        [
          ["Audio from", esc(a.path), "", "wcFramePath"],
          ["Rate · channels, as delivered", a.sampleRate ? `${num(a.sampleRate)} Hz · ${num(a.channels)}` : "—", "", "wcFramePath"],
          ["Encoder config", config(a), a.supported === false ? "bad" : "", "m-wc-config"],
          ["Blocks in · packets out", `${num(a.framesIn)} · ${num(a.encoded)}`, "", "m-wc-packets"],
          ["Encode latency (median · 95th · max)", latency(a.latencyMs), "", "m-wc-latency"],
        ],
      ]);
    }
  } else if (t.recorder) {
    const r = t.recorder;
    groups.push([
      "Recorder",
      [
        ["Type it used", r.mimeType ? `<code>${esc(r.mimeType)}</code>` : "—", "", "mimeType"],
        ["Asked for", r.asked?.mimeType ? `<code>${esc(r.asked.mimeType)}</code>` : "browser's choice", "", "mimeType"],
        ["Bitrates (video · audio)", `${r.videoBitsPerSecond ? `${Math.round(r.videoBitsPerSecond / 1000)} k` : "—"} · ${r.audioBitsPerSecond ? `${Math.round(r.audioBitsPerSecond / 1000)} k` : "—"}`, "", "m-bitrates"],
        ["Start event after", r.startMs == null ? "—" : `${num(r.startMs)} ms`, "", "event-start"],
        ["Chunks · bytes", `${num(r.chunks)} · ${bytes(r.bytes)}`, "", "timeslice"],
        ["First chunk after", r.firstChunkMs == null ? "—" : `${num(r.firstChunkMs)} ms`, "", "timeslice"],
        ["Error", r.error ? esc(r.error) : "none", r.error ? "bad" : "good", "event-error"],
      ],
    ]);
  }
  if (t.webrtc) {
    groups.push([
      "WebRTC loopback",
      Object.entries(t.webrtc).map(([kind, s]) => [
        kind === "audio" ? "Audio" : "Video",
        `${esc(s.codec ?? "?")} · lost ${num(s.packetsLost)} of ${num(s.packetsReceived)}${s.framesDropped != null ? ` · dropped ${num(s.framesDropped)}` : ""}`,
        s.packetsLost ? "bad" : "good",
        "webrtc",
      ]),
    ]);
  }
  return groups;
}

const when = (ms) => new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

// The card's HTML. Its video and canvases are filled by fillCard().
export function cardHTML(t, { deletable = false } = {}) {
  const has = t.media ?? {};
  const fileButton = (key, label, title) =>
    has[key] ? `<button type="button" class="btn sm" data-download="${key}" title="${esc(title)}">${icon("download")}${label}</button>` : "";
  const ext = t.files?.ext ?? "bin";
  // Sound or picture on its own, copied out of the recording when clicked: only for a file with both.
  const kinds = new Set((t.analysis?.file?.probe?.tracks ?? []).map((x) => x.type));
  const solo = (kind, title) =>
    has.file && kinds.has("audio") && kinds.has("video") ? `<button type="button" class="btn sm" data-download="${kind}" title="${esc(title)}">${icon("download")}${kind} only</button>` : "";
  // Subtitles and the transcript, when the take has captions with something in them.
  const spoken = (t.transcripts?.[t.transcripts?.chosen] ?? t.transcripts?.live)?.stats?.segments > 0;
  const textButton = (key, label, title) => (spoken ? `<button type="button" class="btn sm" data-download="${key}" title="${esc(title)}">${icon("download")}${label}</button>` : "");
  return `
    <article class="take" data-id="${esc(t.id)}">
      <header class="block-head take-head">
        <h3>${esc(t.name)}</h3>
        <span class="meta">${esc(t.env?.browser ?? "")} · ${when(t.createdAt)}${t.imported ? ' · <span class="tag">imported, no files</span>' : ""}</span>
        <div class="actions">
          ${fileButton("file", `.${ext}`, "The recording, as the browser wrote it")}
          ${fileButton("seekable", `seekable .${ext}`, "The same packets, rewritten so the file declares its duration")}
          ${solo("audio", "The recording's sound on its own, its packets copied as they are")}
          ${solo("video", "The recording's picture on its own, its packets copied as they are")}
          ${fileButton("tap", "tap.wav", "The lossless tap, at the context's rate, every channel")}
          ${fileButton("pcm16k", "16k.wav", "The recording's audio as 16 kHz mono, ready for transcription")}
          ${has.file ? textButton("subtitled", "with subtitles", "The recording with its subtitles written into it as a track, its packets copied as they are") : ""}
          ${textButton("vtt", ".vtt", "Subtitles as WebVTT, timed on the recording")}
          ${textButton("srt", ".srt", "Subtitles as SubRip")}
          ${textButton("txt", ".txt", "The transcript as text, an utterance a line, with its times")}
          ${textButton("transcript", "transcript.json", "The transcript with its times, the model and settings, and how it was placed on the recording")}
          <button type="button" class="btn sm" data-download="report">${icon("download")}report.json</button>
          ${deletable ? `<button type="button" class="btn sm" data-delete>${icon("clear")}<span class="label">Delete</span></button>` : ""}
        </div>
      </header>
      ${has.file ? `<video class="take-video" controls playsinline preload="metadata"></video>` : ""}
      ${
        t.analysis?.overview
          ? `<div class="waves">
              ${t.analysis.overview.tap ? `<figure><figcaption data-explain="m-tap">Tap</figcaption><canvas data-wave="tap" height="56"></canvas></figure>` : ""}
              ${t.analysis.overview.file ? `<figure><figcaption data-explain="m-decoded">File</figcaption><canvas data-wave="file" height="56"></canvas></figure>` : ""}
            </div>`
          : ""
      }
      ${
        t.transcripts?.live || t.transcripts?.final
          ? `<section class="take-transcript"><h4 data-explain="take-transcript">Transcript</h4>${spoken ? `<ol class="transcript-list"></ol>` : `<p class="hint">Nothing was heard as speech while this take recorded.</p>`}</section>`
          : ""
      }
      <div class="metrics">${metricGroups(t)
        .map(
          ([title, rows]) =>
            `<section><h4>${esc(title)}</h4><dl>${rows
              .map(([label, value, verdict, topic]) => `<dt data-explain="${topic}">${esc(label)}</dt><dd class="${verdict ? `score ${verdict}` : ""}">${value}</dd>`)
              .join("")}</dl></section>`,
        )
        .join("")}</div>
      <details class="take-more"><summary>${icon("chevron")}Asked for, and what the browser gave</summary>${tracksHTML(t.tracks ?? [])}</details>
      <details class="take-more"><summary>${icon("chevron")}The whole report</summary><pre class="report">${esc(JSON.stringify(t, null, 1))}</pre></details>
    </article>`;
}

// Draws a waveform outline ([min, max, ...] from metrics.overview) to fit the canvas.
export function drawWave(canvas, data) {
  const width = (canvas.width = Math.max(100, Math.round(canvas.clientWidth * devicePixelRatio)));
  const height = (canvas.height = Math.round(56 * devicePixelRatio));
  const ctx = canvas.getContext("2d");
  const style = getComputedStyle(canvas);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = style.getPropertyValue("--wave").trim() || "#0b63ce";
  const n = data.length / 2;
  const mid = height / 2;
  for (let i = 0; i < n; i++) {
    const x0 = Math.floor((i / n) * width);
    const x1 = Math.max(x0 + 1, Math.floor(((i + 1) / n) * width));
    const top = mid - data[2 * i + 1] * mid;
    const bottom = mid - data[2 * i] * mid;
    ctx.fillRect(x0, top, x1 - x0, Math.max(1, bottom - top));
  }
}

// Fills a rendered card: its waveforms, the video from the take's files with
// the transcript as its subtitles, and the transcript's rows, which follow
// the playback and seek it when clicked. transcript: the take's (with its
// segments), or null; cueOptions: toCues()'s limits. Returns a function that
// releases the object URLs.
export function fillCard(card, t, media = {}, { transcript = null, cueOptions = {} } = {}) {
  for (const canvas of card.querySelectorAll("canvas[data-wave]")) drawWave(canvas, t.analysis.overview[canvas.dataset.wave]);
  const video = card.querySelector(".take-video");
  const source = media.seekable ?? media.file;
  const urls = [];
  if (video && source) {
    urls.push(URL.createObjectURL(source));
    video.src = urls[0];
  }
  const list = card.querySelector(".take-transcript .transcript-list");
  if (list && transcript?.segments?.length) {
    list.innerHTML = transcript.segments
      .map((s, i) => `<li data-index="${i}"${s.clipped ? ' class="clipped" title="Cut at the take\'s edge"' : ""}><time>${clock(s.start)}–${clock(s.end)}</time><span>${esc(s.transcript)}</span></li>`)
      .join("");
    if (video && source) {
      const cues = toCues(transcript.segments, { ...cueOptions, duration: t.analysis?.file?.probe?.duration ?? Infinity });
      urls.push(URL.createObjectURL(new Blob([asVtt(cues)], { type: "text/vtt" })));
      const track = Object.assign(document.createElement("track"), { kind: "captions", label: transcript.kind === "final" ? "Captions (second pass)" : "Captions (live)", srclang: "en", src: urls[1], default: true });
      video.append(track);
      // Some browsers leave a track added by script hidden until told.
      track.addEventListener("load", () => (track.track.mode = "showing"));
      // The row being said is marked as the recording plays, and a click on a row goes there.
      const rows = [...list.children];
      video.addEventListener("timeupdate", () => {
        const now = cueAt(transcript.segments, video.currentTime);
        for (const row of rows) row.classList.toggle("now", transcript.segments[row.dataset.index] === now);
      });
      list.addEventListener("click", (e) => {
        const row = e.target.closest("li[data-index]");
        if (!row) return;
        video.currentTime = transcript.segments[row.dataset.index].start;
        video.play().catch(() => {});
      });
      list.classList.add("seeks");
    }
  }
  return () => urls.forEach((url) => URL.revokeObjectURL(url));
}

// --- Asked for, and what the browser gave ------------------------------------------

const show = (v) => {
  if (v === undefined) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (v && typeof v === "object") {
    if ("min" in v || "max" in v) return `${show(v.min) || ""}–${show(v.max) || ""}${v.step ? ` (step ${show(v.step)})` : ""}`;
    if ("exact" in v) return `exactly ${show(v.exact)}`;
    if ("ideal" in v) return `ideally ${show(v.ideal)}`;
    return JSON.stringify(v);
  }
  // 1.7777777777777777 -> 1.7778
  if (typeof v === "number" && !Number.isInteger(v)) return String(Math.round(v * 10000) / 10000);
  return String(v);
};
const plain = (v) => (v && typeof v === "object" && !Array.isArray(v) ? (v.exact ?? v.ideal ?? v) : v);
const differs = (asked, got) => {
  const a = plain(asked);
  if (a === undefined || got === undefined || typeof a === "object") return false;
  if (typeof a === "number" && typeof got === "number") return Math.abs(a - got) > Math.max(0.01, Math.abs(a) * 0.01);
  return String(a) !== String(got);
};

// A table per track: each setting with what was asked (t.asked, the
// constraints for that track), what the browser gave (getSettings()) and
// what the device can do (getCapabilities()). Rows where the first two
// differ are marked.
export function tracksHTML(tracks) {
  if (!tracks.length) return `<p class="hint">No tracks.</p>`;
  return tracks
    .map((t) => {
      const want = t.asked ?? {};
      const keys = [...new Set([...Object.keys(want), ...Object.keys(t.settings ?? {}), ...Object.keys(t.capabilities ?? {})])].filter(
        (k) => !["deviceId", "groupId"].includes(k),
      );
      const rows = keys
        .map((k) => {
          const off = differs(want[k], t.settings?.[k]);
          return `<tr class="${off ? "off" : ""}"><th scope="row"><code data-explain="${esc(k)}">${esc(k)}</code></th><td>${esc(show(want[k]))}</td><td>${esc(show(t.settings?.[k]))}${off ? ' <span class="tag">not as asked</span>' : ""}</td><td class="dim">${esc(show(t.capabilities?.[k]))}</td></tr>`;
        })
        .join("");
      const events = t.events?.length ? `<p class="hint">Track events: ${t.events.map((e) => `${esc(e.type)} at ${(e.t / 1000).toFixed(2)} s`).join(", ")}</p>` : "";
      return `<div class="track-table"><h4>${t.kind === "audio" ? icon("mic") : icon("camera")}${esc(t.kind)} · ${esc(t.label || "(no label)")}</h4>
        <table class="runs asked"><thead><tr><th>Setting</th><th>Asked</th><th>Got</th><th>Can do</th></tr></thead><tbody>${rows}</tbody></table>${events}</div>`;
    })
    .join("");
}
