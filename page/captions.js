// Live captions on the bench: runs the speech engine on the open source's
// audio tap, shows what it hears over the preview and in the transcript
// beside it, reports the model's state in the app bar's Captions chip, and
// makes each take's transcripts: the captions said while it recorded, placed
// on the saved file's timeline; and, when asked, a second pass over the
// finished recording.
//
// The engine (src/speech/) is shared by the whole page and loads its model
// once; the settings that pick the model are engine-wide, so a change to one
// of them restarts the engine the next time a source opens.

import { MODELS_INDEX_URL } from "../src/deps.js";
import { createTapFeed } from "../src/captions/tap-feed.js";
import { TakeTimeline, captionStats, fileOffset, placeSegments } from "../src/captions/timeline.js";
import { transcriptErrors } from "../src/captions/wer.js";
import { config, configure, createEngine, engine } from "../src/speech/core.js";
import { runFilePass } from "../src/speech/file-pass.js";
import { modelDir, resolve, timestampedFor } from "../src/speech/registry.js";
import { Transcriber } from "../src/speech/transcriber.js";
import { parseWav } from "../src/wav.js";
import { clock, setChip } from "./bench.js";

// A final caption stays up this long after it arrives, unless the next one replaces it.
const LINGER_MS = 4000;
export const TRANSCRIPT_FORMAT = "caption-bench-transcript/1";

// The folders under models/ on this server, from models/index.json: [] when
// there is no list (a static host that publishes none).
export async function localModels() {
  try {
    const response = await fetch(MODELS_INDEX_URL, { cache: "no-store" });
    const list = response.ok ? (await response.json()).models : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// "auto": Whisper base.en when it's on this server, else tiny.en, the
// smallest download from the hub.
export function pickModel(choice, local) {
  if (choice !== "auto") return choice;
  return local.includes(modelDir(resolve("whisper-base.en"))) ? "whisper-base.en" : "whisper-tiny.en";
}

// overlay: the text over the preview; list: the transcript's <ol>; chip: the
// app bar's; log: the bench's events log.
export function createCaptions({ overlay, list, chip, log }) {
  const finalEl = overlay.querySelector(".caption-final");
  const interimEl = overlay.querySelector(".caption-interim");
  let run = null; // { transcriber, feed, settings, model, finals, interimStarts }
  let last = null; // the latest run, kept after it ends
  let loaded = null; // the engine-wide settings the engine loaded with, as JSON
  let lingering = 0;
  let shownFinal = null; // the id of the final segment on screen
  let shownInterim = null;

  // --- The overlay and the transcript ----------------------------------------------------

  function show() {
    overlay.hidden = !finalEl.textContent && !interimEl.textContent;
  }
  function clearOverlay() {
    clearTimeout(lingering);
    finalEl.textContent = interimEl.textContent = "";
    shownFinal = shownInterim = null;
    show();
  }
  function showSegment(segment) {
    if (!segment.isFinal) {
      interimEl.textContent = segment.transcript;
      shownInterim = segment.id;
    } else {
      // The final text replaces its own interim; an empty one withdraws it.
      if (shownInterim === segment.id) {
        interimEl.textContent = "";
        shownInterim = null;
      }
      if (segment.transcript) {
        finalEl.textContent = segment.transcript;
        shownFinal = segment.id;
        clearTimeout(lingering);
        lingering = setTimeout(() => {
          if (shownFinal !== segment.id) return;
          finalEl.textContent = "";
          shownFinal = null;
          show();
        }, LINGER_MS);
      }
    }
    show();
  }

  // One row per utterance, by its id: an interim row becomes the final one, or goes.
  function listSegment(segment) {
    let row = list.querySelector(`li[data-id="${segment.id}"]`);
    if (segment.isFinal && !segment.transcript) return row?.remove();
    const atEnd = list.scrollTop + list.clientHeight >= list.scrollHeight - 8;
    if (!row) {
      row = document.createElement("li");
      row.dataset.id = segment.id;
      row.append(document.createElement("time"), document.createElement("span"));
      list.append(row);
    }
    row.classList.toggle("interim", !segment.isFinal);
    row.querySelector("time").textContent = `${clock(segment.start)}–${clock(segment.end)}`;
    row.querySelector("span").textContent = segment.transcript;
    if (atEnd) list.scrollTop = list.scrollHeight;
  }

  // --- The chip -------------------------------------------------------------------------------

  const label = () => resolve(config.model, { kind: "asr" })?.label ?? config.model;
  // Bytes of each file as it downloads; Transformers.js reports them one file at a time.
  const files = new Map();
  let wanted = false;
  function showEngine() {
    if (!wanted) return setChip(chip, "unloaded", "Captions off", "Turn captions on in the Captions tab, then open a source");
    if (engine.state === "loading") {
      let got = 0;
      let all = 0;
      for (const f of files.values()) {
        got += f.loaded;
        all += f.total;
      }
      // A percentage once the model's own files (megabytes) have started, not for the small configs.
      const part = all > 1e6 ? ` · ${Math.round((got / all) * 100)}%` : "";
      return setChip(chip, "loading", `${label()}${part}`, all ? `Loading the speech model: ${(got / 1e6).toFixed(1)} of ${(all / 1e6).toFixed(1)} MB` : "Loading the speech model");
    }
    if (engine.state === "error") return setChip(chip, "error", "Captions failed", engine.error ?? "");
    if (engine.state === "ready") {
      const i = engine.info;
      const device = i.device === "webgpu" ? "WebGPU" : `WebAssembly, ${i.threads} thread${i.threads === 1 ? "" : "s"}`;
      const from = i.from === "same-origin" ? "from this server" : "from the Hugging Face hub (kept by the browser)";
      const notes = [i.fallback, i.threads === 1 && !i.crossOriginIsolated ? "one thread: the page isn't cross-origin isolated" : "", i.wordsFrom ? `word times from ${i.wordsFrom === "align" ? "forced alignment" : i.wordsFrom === "frames" ? "the model's frames" : "Whisper's attention"}` : ""]
        .filter(Boolean)
        .join(". ");
      return setChip(chip, i.fallback ? "warn" : "ready", `${label()} · ${i.device === "webgpu" ? "WebGPU" : `${i.threads}×`}`, `${label()} on ${device}, ${from}${notes ? `. ${notes}` : ""}`);
    }
    setChip(chip, "unloaded", "Captions", "The speech model loads when a source opens");
  }
  let lastState = engine.state;
  engine.addEventListener("statechange", () => {
    if (engine.state !== lastState) {
      if (engine.state === "loading") log.add("life", "model", `loading ${label()} (${config.device === "webgpu" ? "WebGPU" : "WebAssembly"})`);
      if (engine.state === "ready") {
        const i = engine.info;
        log.add("result", "model", `${label()} ready in ${(i.loadMs / 1000).toFixed(1)} s · ${i.device} · ${i.dtype && typeof i.dtype === "object" ? Object.values(i.dtype).join("+") : i.dtype} · ${i.threads} thread${i.threads === 1 ? "" : "s"} · ${i.from === "same-origin" ? "this server" : "Hugging Face hub"}${i.wordsFrom ? ` · word times: ${i.wordsFrom}` : ""}${i.fallback ? ` · ${i.fallback}` : ""}`);
      }
      if (engine.state === "error") log.add("error", "model", engine.error ?? "the speech engine failed to load");
      lastState = engine.state;
    }
    if (engine.state !== "loading") files.clear();
    showEngine();
  });
  engine.addEventListener("progress", ({ detail }) => {
    if (detail.status !== "progress" || !detail.file || !detail.total) return;
    files.set(`${detail.name}/${detail.file}`, { loaded: detail.loaded, total: detail.total });
    showEngine();
  });
  showEngine();

  // --- Runs ------------------------------------------------------------------------------------

  // Starts captioning a tap. settings: the Captions tab's values. Resolves to
  // the run once audio is arriving, or to null when captions are off or
  // couldn't start (the log says why).
  async function start(tap, settings) {
    stop();
    wanted = Boolean(settings.captions && tap);
    if (!wanted) {
      showEngine();
      return null;
    }
    list.replaceChildren();
    const local = await localModels();
    const model = pickModel(settings.ccModel, local);
    let vad = settings.ccVad;
    if (vad === "silero-vad" && !local.includes(modelDir(resolve("silero-vad")))) {
      log.add("error", "captions", "Silero VAD isn't on this server (npm run download-model silero-vad): using the energy detector");
      vad = "energy";
    }
    const words = settings.ccWords ?? "off";
    // The model, where it runs and how words are timed are fixed once the engine loads: a change restarts it.
    const isLocal = (id, kind) => local.includes(modelDir(resolve(id, { kind })));
    const loads = words === "whisper" ? (timestampedFor(model)?.id ?? model) : model;
    const engineWide = JSON.stringify({ model, device: settings.ccDevice, words, local: [isLocal(loads, "asr"), words === "align" && isLocal(config.alignmentModel, "alignment")] });
    if (loaded !== engineWide && engine.state !== "unloaded") engine.reset();
    loaded = engineWide;
    configure({ localModels: local, vad, vadLevel: settings.ccVadLevel ?? 2, vadThreshold: settings.ccVadThreshold ?? 0.5 });
    if (engine.state === "unloaded") configure({ model, device: settings.ccDevice, words });

    const transcriber = new Transcriber({
      lang: "en-US",
      interimResults: settings.ccInterim,
      interimIntervalMs: settings.ccInterimIntervalMs ?? 500,
      silenceMs: settings.ccSilenceMs ?? 800,
      maxSegmentMs: settings.ccMaxSegmentMs ?? 20000,
    });
    const mine = { transcriber, feed: createTapFeed(tap), model, settings: { ...settings, ccVad: vad, ccModel: model }, finals: [], interimStarts: [] };
    run = last = mine;
    transcriber.onsegment = (event) => {
      if (run !== mine) return;
      const { id, isFinal, transcript, confidence, start: from, end, speaker, words: timed, latency, ms, cut, continued } = event;
      const segment = { id, isFinal, transcript, confidence, start: from, end, speaker, ...(timed && { words: timed }), ...(latency != null && { latency }), ...(ms != null && { ms }), ...(cut && { cut }), ...(continued && { continued }) };
      if (isFinal && transcript) {
        mine.finals.push(segment);
        log.add("result", "caption", `[${clock(from)}–${clock(end)}] ${transcript}${latency != null ? ` · ${latency.toFixed(2)} s after it ended` : ""}`);
      } else if (!isFinal) {
        mine.interimStarts.push(from);
      }
      showSegment(segment);
      listSegment(segment);
    };
    transcriber.onerror = (event) => {
      if (run !== mine) return;
      log.add("error", "captions", `${event.error}: ${event.message}`);
    };
    transcriber.onend = () => {
      if (run === mine) run = null;
    };
    log.add(
      "call",
      "captions",
      `${resolve(model)?.label ?? model} · ${settings.ccDevice} · ${vad} · a pause of ${settings.ccSilenceMs ?? 800} ms ends an utterance${settings.ccInterim ? ` · interim text every ${settings.ccInterimIntervalMs ?? 500} ms` : " · no interim text"}${words !== "off" ? ` · word times: ${words}` : ""}`,
    );
    showEngine();
    try {
      await transcriber.start(mine.feed);
    } catch (err) {
      if (run === mine) run = null;
      if (err?.code !== "aborted") log.add("error", "captions", err?.message ?? String(err));
      return null;
    }
    return run === mine ? mine : null;
  }

  // Ends the run at once (the source is closing): what isn't delivered yet is
  // dropped. The transcript beside the preview stays, to read.
  function stop() {
    const ending = run;
    run = null;
    ending?.transcriber.abort();
    clearOverlay();
    for (const row of list.querySelectorAll("li.interim")) row.remove();
  }

  // A take starts, pauses, resumes or stops at this context frame: the
  // utterance in progress is cut exactly there, so no caption spans it.
  // Resolves, once every caption up to the frame has been delivered, to true;
  // or to false after waitMs (the model is still working, or the audio never
  // reached the frame).
  function boundary(frame, { waitMs = 30000 } = {}) {
    const mine = run;
    const feedClock = mine?.feed.clock;
    if (!feedClock || frame == null) return Promise.resolve(true);
    return new Promise((done) => {
      let cut = false;
      const giveUp = setTimeout(() => done(false), waitMs);
      const doCut = () => {
        if (cut) return;
        cut = true;
        mine.transcriber.cut().then(
          () => (clearTimeout(giveUp), done(true)),
          () => (clearTimeout(giveUp), done(false)),
        );
      };
      // If the audio stops arriving (a suspended context), cut where it got to.
      const now = feedClock.at(frame, doCut);
      setTimeout(now, 1500);
    });
  }

  // The transcript of the take that just ended, from the run in progress:
  // the captions said while it recorded, on the saved file's timeline. tap:
  // PcmTap.finish()'s result; analysis and recorder: the take's. complete:
  // what boundary() resolved to at Stop. Null when captions weren't running.
  function takeTranscript({ takeId, tap, analysis, recorder, complete = true }) {
    const mine = run ?? last;
    const feedClock = mine?.feed.clock;
    if (!mine || !tap || feedClock?.firstFrame == null) return null;
    const timeline = new TakeTimeline(tap);
    const offset = fileOffset({ analysis, recorder, timeline });
    const duration = analysis?.file?.probe?.duration ?? Infinity;
    const segments = placeSegments(mine.finals, feedClock, timeline, { offsetS: offset.offsetS, duration });
    const interims = mine.interimStarts.filter((s) => timeline.recorded(feedClock.frameAt(s))).length;
    const i = engine.info ?? {};
    const s = mine.settings;
    return {
      format: TRANSCRIPT_FORMAT,
      takeId,
      kind: "live",
      createdAt: Date.now(),
      engine: { model: i.model ?? modelDir(resolve(mine.model)), label: resolve(mine.model)?.label ?? mine.model, dtype: i.dtype ?? null, device: i.device ?? null, threads: i.threads ?? null, crossOriginIsolated: i.crossOriginIsolated ?? null, fallback: i.fallback ?? null, wordsFrom: i.wordsFrom ?? null, from: i.from ?? null },
      settings: { lang: "en-US", model: s.ccModel, device: s.ccDevice, vad: s.ccVad, vadLevel: s.ccVadLevel, vadThreshold: s.ccVadThreshold, silenceMs: s.ccSilenceMs, maxSegmentMs: s.ccMaxSegmentMs, interimResults: s.ccInterim, interimIntervalMs: s.ccInterimIntervalMs, words: s.ccWords ?? "off" },
      clock: { rate: timeline.rate, firstFedFrame: feedClock.firstFrame, startFrame: timeline.startFrame, endFrame: timeline.endFrame, gaps: timeline.gaps, lostFrames: feedClock.lostFrames, ...offset },
      segments,
      stats: { ...captionStats(segments), interims, clipped: segments.filter((x) => x.clipped).length },
      ...(complete ? {} : { incomplete: true }),
    };
  }

  // --- The second pass ------------------------------------------------------------------------

  // An engine of its own, so the pass neither waits behind live captions nor
  // holds them up, and can use another model. Kept between passes; a change
  // of model, device or word times replaces it.
  const second = { engine: null, signature: null, runs: 0 };

  // Transcribes a finished take again, from its 16 kHz copy: the detector
  // finds the speech in the whole of it, and each stretch is transcribed
  // with no clock to keep up with. take: its report; pcm16k: the Blob;
  // settings: the Captions tab's; live: the take's live transcript, to
  // compare with, or null. onProgress({ phase, done, total }).
  // Resolves to a transcript record (kind "final"), on the file's timeline.
  async function secondPass({ take, pcm16k, settings, live = null, onProgress = () => {} }) {
    const started = performance.now();
    const local = await localModels();
    const model = settings.ccFinalModel && settings.ccFinalModel !== "same" ? settings.ccFinalModel : pickModel(settings.ccModel, local);
    const words = settings.ccFinalWords ?? "off";
    let vad = settings.ccVad;
    if (vad === "silero-vad" && !local.includes(modelDir(resolve("silero-vad")))) vad = "energy";
    const signature = JSON.stringify({ model, device: settings.ccDevice, words, local });
    if (second.signature !== signature) {
      second.engine?.reset();
      const made = createEngine({ model, device: settings.ccDevice, words, localModels: local });
      made.addEventListener("statechange", () => {
        if (made.state === "loading") log.add("life", "model", `loading ${resolve(model)?.label ?? model} for the second pass`);
        if (made.state === "error") log.add("error", "model", made.error ?? "the second pass's engine failed to load");
      });
      Object.assign(second, { engine: made, signature });
    }
    const eng = second.engine;
    const audio = parseWav(await pcm16k.arrayBuffer()).channels[0];
    const samples = audio.length;
    const duration = samples / 16000;
    onProgress({ phase: "loading", done: 0, total: 1 });
    await eng.load();
    const session = `second-pass-${++second.runs}`;
    const fileId = eng.openFile(audio); // the audio moves to the worker
    let pass;
    try {
      pass = await runFilePass(
        { duration },
        {
          speech: async () => (await eng.speech({ fileId, start: 0, end: samples }, { vad, vadLevel: settings.ccVadLevel ?? 2, vadThreshold: settings.ccVadThreshold ?? 0.5 }, { session }))?.regions ?? [],
          transcribe: (from, to) => eng.transcribe({ fileId, start: from, end: to }, { language: "en", prompt: "", words: true }, { session }),
          onProgress,
        },
        { mergeGap: (settings.ccSilenceMs ?? 800) / 1000 },
      );
    } finally {
      eng.closeFile(fileId);
    }
    // The 16 kHz copy starts where the file's audio track does.
    const fileDuration = take.analysis?.file?.probe?.duration ?? Infinity;
    const offsetS = take.analysis?.file?.probe?.tracks?.find((t) => t.type === "audio")?.firstTimestamp ?? 0;
    const place = (t) => Math.round(Math.min(fileDuration, Math.max(0, t + offsetS)) * 1000) / 1000;
    const segments = pass.segments.map((s) => ({ ...s, start: place(s.start), end: place(s.end), ...(s.words && { words: s.words.map((w) => ({ ...w, start: place(w.start), end: place(w.end) })) }) })).filter((s) => s.end > s.start);
    const i = eng.info ?? {};
    return {
      format: TRANSCRIPT_FORMAT,
      takeId: take.id,
      kind: "final",
      createdAt: Date.now(),
      engine: { model: i.model ?? modelDir(resolve(model)), label: resolve(model)?.label ?? model, dtype: i.dtype ?? null, device: i.device ?? null, threads: i.threads ?? null, crossOriginIsolated: i.crossOriginIsolated ?? null, fallback: i.fallback ?? null, wordsFrom: i.wordsFrom ?? null, from: i.from ?? null },
      settings: { lang: "en-US", model, device: settings.ccDevice, vad, vadLevel: settings.ccVadLevel, vadThreshold: settings.ccVadThreshold, mergeGapMs: settings.ccSilenceMs ?? 800, words },
      clock: { offsetS, offsetFrom: "decoded" },
      segments,
      stats: {
        ...captionStats(segments),
        speechRegions: pass.speech.length,
        parts: pass.parts.length,
        dropped: pass.dropped,
        tookS: Math.round(performance.now() - started) / 1000,
        // How the live captions differ from this pass, word for word.
        againstLive: live?.segments ? transcriptErrors(segments, live.segments) : null,
      },
    };
  }

  return {
    start,
    stop,
    boundary,
    takeTranscript,
    secondPass,
    get run() {
      return run;
    },
    // The latest run, still there after its source has closed.
    get last() {
      return last;
    },
    get text() {
      return [finalEl.textContent, interimEl.textContent].filter(Boolean).join(" ");
    },
  };
}
