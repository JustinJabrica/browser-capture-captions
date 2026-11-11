// MediaRecorder for a take: which formats this browser can record, and a
// wrapper that keeps every event and chunk for the take's report.

// Candidates for isTypeSupported(), roughly from most to least widely
// recorded. Each browser records only some: Firefox WebM and Ogg, Chromium
// WebM, Matroska and (in newer versions) MP4, Safari MP4 and (from 18.4)
// WebM. Versions move, so the bench only ever trusts isTypeSupported().
export const VIDEO_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1.42E01E,opus",
  "video/mp4;codecs=hvc1.1.6.L93.B0,mp4a.40.2",
  "video/mp4;codecs=vp09.00.10.08,opus",
  "video/mp4;codecs=av01.0.04M.08,opus",
  "video/mp4",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=av01,opus",
  "video/webm;codecs=h264,opus",
  "video/webm;codecs=vp9,pcm",
  "video/webm",
  "video/x-matroska;codecs=avc1,opus",
  "video/x-matroska;codecs=avc1,pcm",
];
export const AUDIO_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm;codecs=pcm",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4;codecs=opus",
  "audio/mp4",
  "audio/wav",
];

// The candidates this browser says it can record.
export function supportedTypes(candidates, isTypeSupported = (t) => globalThis.MediaRecorder?.isTypeSupported(t) ?? false) {
  return candidates.filter((type) => {
    try {
      return isTypeSupported(type);
    } catch {
      return false;
    }
  });
}

// What to ask MediaRecorder for: the wanted type when this browser records
// it, otherwise "" (the browser's own choice). An audio-only stream can't be
// recorded as a video/* type in every browser, so the audio/* type with the
// same container is used instead where there is one.
export function chooseType(wanted, { hasVideo = true, isTypeSupported } = {}) {
  if (!wanted) return "";
  let type = wanted;
  if (!hasVideo && type.startsWith("video/")) {
    const container = type.split(";")[0].replace("video/", "audio/");
    const audio = supportedTypes(AUDIO_TYPES.filter((t) => t.startsWith(container)), isTypeSupported);
    type = audio[0] ?? type;
  }
  return supportedTypes([type], isTypeSupported).length ? type : "";
}

// "video/webm;codecs=vp8,opus" -> "webm"
export function extensionFor(mimeType = "") {
  const base = mimeType.split(";")[0].trim();
  return { "video/mp4": "mp4", "audio/mp4": "m4a", "video/webm": "webm", "audio/webm": "weba", "audio/ogg": "ogg", "video/x-matroska": "mkv", "audio/x-matroska": "mka", "audio/wav": "wav" }[base] ?? "bin";
}

// Records a stream. stop() resolves to the file once the recorder's own stop
// event has fired (it also fires by itself when every track ends). stats
// collects what the report needs; onEvent sees every event for the log.
// Times in stats are ms after start() was called. The start event can come
// seconds after that (headless Chromium with fake devices waits for the
// first frame), but the file still begins at start(), so the take's length
// is measured from start() to the stop event, less any pauses.
export class TakeRecorder {
  #recorder = null;
  #chunks = [];
  #pausedAt = null;
  #done = null;
  stats = null;

  constructor(stream, options = {}, { onEvent = () => {} } = {}) {
    const asked = Object.fromEntries(
      Object.entries({
        mimeType: options.mimeType || undefined,
        videoBitsPerSecond: options.videoBitsPerSecond ?? undefined,
        audioBitsPerSecond: options.audioBitsPerSecond ?? undefined,
        audioBitrateMode: options.audioBitrateMode || undefined,
        videoKeyFrameIntervalDuration: options.videoKeyFrameIntervalDuration ?? undefined,
      }).filter(([, v]) => v !== undefined),
    );
    // Throws NotSupportedError for a type it can't record.
    this.#recorder = new MediaRecorder(stream, asked);
    const r = this.#recorder;
    const t0 = performance.now();
    const since = () => Math.round(performance.now() - t0);
    this.stats = {
      asked,
      timeslice: options.timeslice || null,
      mimeType: r.mimeType,
      videoBitsPerSecond: r.videoBitsPerSecond,
      audioBitsPerSecond: r.audioBitsPerSecond,
      audioBitrateMode: r.audioBitrateMode ?? null,
      startMs: null,
      stopMs: null,
      pausedMs: 0,
      chunks: 0,
      bytes: 0,
      emptyChunks: 0,
      firstChunkMs: null,
      chunkGapMaxMs: 0,
      error: null,
      endedByTracks: false,
    };
    let lastChunk = null;
    this.#done = new Promise((resolve) => {
      r.addEventListener("start", () => {
        this.stats.startMs = since();
        // Some browsers only settle the real type once recording starts.
        this.stats.mimeType = r.mimeType || this.stats.mimeType;
        onEvent("start", r.mimeType || "(no type reported)");
      });
      r.addEventListener("dataavailable", ({ data, timecode }) => {
        const now = since();
        if (!data.size) this.stats.emptyChunks++;
        else this.#chunks.push(data);
        this.stats.chunks++;
        this.stats.bytes += data.size;
        this.stats.firstChunkMs ??= now;
        if (lastChunk != null) this.stats.chunkGapMaxMs = Math.max(this.stats.chunkGapMaxMs, now - lastChunk);
        lastChunk = now;
        onEvent("dataavailable", `${data.size.toLocaleString()} bytes${timecode ? ` · timecode ${Math.round(timecode)}` : ""}`);
      });
      r.addEventListener("pause", () => {
        this.#pausedAt = performance.now();
        onEvent("pause");
      });
      r.addEventListener("resume", () => {
        this.stats.pausedMs += performance.now() - this.#pausedAt;
        this.#pausedAt = null;
        onEvent("resume");
      });
      r.addEventListener("error", (e) => {
        const err = e.error ?? e;
        this.stats.error = `${err.name ?? "Error"}: ${err.message ?? ""}`.trim();
        onEvent("error", this.stats.error);
      });
      r.addEventListener("stop", () => {
        this.stats.stopMs = since();
        // Stopped while paused: the pause lasted until now.
        if (this.#pausedAt != null) this.stats.pausedMs += performance.now() - this.#pausedAt;
        this.stats.pausedMs = Math.round(this.stats.pausedMs);
        this.stats.endedByTracks = stream.getTracks().every((t) => t.readyState === "ended");
        onEvent("stop", `${this.stats.chunks} chunk${this.stats.chunks === 1 ? "" : "s"}, ${this.stats.bytes.toLocaleString()} bytes`);
        resolve(new Blob(this.#chunks, { type: this.stats.mimeType || this.#chunks[0]?.type || "" }));
      });
    });
    r.start(options.timeslice || undefined);
  }

  get state() {
    return this.#recorder.state;
  }

  pause() {
    if (this.#recorder.state === "recording") this.#recorder.pause();
  }

  resume() {
    if (this.#recorder.state === "paused") this.#recorder.resume();
  }

  // Resolves to the recorded Blob.
  stop() {
    if (this.#recorder.state !== "inactive") this.#recorder.stop();
    return this.#done;
  }

  // Resolves when the recorder stops for any reason.
  get done() {
    return this.#done;
  }
}
