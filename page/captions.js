// Live captions on the bench: runs the speech engine on the open source's
// audio tap, shows what it hears over the preview, and reports the model's
// state in the app bar's Captions chip.
//
// The engine (src/speech/) is shared by the whole page and loads its model
// once; the settings that pick the model are engine-wide, so a change to one
// of them restarts the engine the next time a source opens.

import { MODELS_INDEX_URL } from "../src/deps.js";
import { createTapFeed } from "../src/captions/tap-feed.js";
import { config, configure, engine } from "../src/speech/core.js";
import { modelDir, resolve } from "../src/speech/registry.js";
import { Transcriber } from "../src/speech/transcriber.js";
import { clock, setChip } from "./bench.js";

// A final caption stays up this long after it arrives, unless the next one replaces it.
const LINGER_MS = 4000;

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

// log: the bench's events log; onSegment(segment, run) is called with every
// interim and final segment, run being what start() resolved to.
export function createCaptions({ overlay, chip, log, onSegment = () => {}, onError = () => {} }) {
  const finalEl = overlay.querySelector(".caption-final");
  const interimEl = overlay.querySelector(".caption-interim");
  let run = null; // { transcriber, feed, settings, model, finals, interims }
  let last = null; // the latest run, kept after it ends
  let loaded = null; // the engine-wide settings the engine loaded with, as JSON
  let lingering = 0;
  let shownFinal = null; // the id of the final segment on screen
  let shownInterim = null;

  // --- The overlay ---------------------------------------------------------------------------

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
      const part = all > 1e6 ? ` · ${Math.round((got / all) * 100)}%` : "";
      return setChip(chip, "loading", `${label()}${part}`, all ? `Loading the speech model: ${(got / 1e6).toFixed(1)} of ${(all / 1e6).toFixed(1)} MB` : "Loading the speech model");
    }
    if (engine.state === "error") return setChip(chip, "error", "Captions failed", engine.error ?? "");
    if (engine.state === "ready") {
      const i = engine.info;
      const device = i.device === "webgpu" ? "WebGPU" : `WebAssembly, ${i.threads} thread${i.threads === 1 ? "" : "s"}`;
      const from = i.from === "same-origin" ? "from this server" : "from the Hugging Face hub (kept by the browser)";
      const notes = [i.fallback, i.threads === 1 && !i.crossOriginIsolated ? "one thread: the page isn't cross-origin isolated" : ""].filter(Boolean).join(". ");
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
        log.add("result", "model", `${label()} ready in ${(i.loadMs / 1000).toFixed(1)} s · ${i.device} · ${i.dtype && typeof i.dtype === "object" ? Object.values(i.dtype).join("+") : i.dtype} · ${i.threads} thread${i.threads === 1 ? "" : "s"} · ${i.from === "same-origin" ? "this server" : "Hugging Face hub"}${i.fallback ? ` · ${i.fallback}` : ""}`);
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
  // the run ({ feed, model, settings, finals }) once audio is arriving, or to
  // null when captions are off or couldn't start (the log and onError say why).
  async function start(tap, settings) {
    stop();
    wanted = Boolean(settings.captions && tap);
    if (!wanted) {
      showEngine();
      return null;
    }
    const local = await localModels();
    const model = pickModel(settings.ccModel, local);
    let vad = settings.ccVad;
    if (vad === "silero-vad" && !local.includes(modelDir(resolve("silero-vad")))) {
      log.add("error", "captions", "Silero VAD isn't on this server (npm run download-model silero-vad): using the energy detector");
      vad = "energy";
    }
    // The model and where it runs are fixed once the engine loads: a change restarts it.
    const engineWide = JSON.stringify({ model, device: settings.ccDevice, local: local.includes(modelDir(resolve(model))) });
    if (loaded !== engineWide && engine.state !== "unloaded") engine.reset();
    loaded = engineWide;
    configure({ localModels: local, vad, vadLevel: settings.ccVadLevel ?? 2, vadThreshold: settings.ccVadThreshold ?? 0.5 });
    if (engine.state === "unloaded") configure({ model, device: settings.ccDevice });

    const transcriber = new Transcriber({
      lang: "en-US",
      interimResults: settings.ccInterim,
      interimIntervalMs: settings.ccInterimIntervalMs ?? 500,
      silenceMs: settings.ccSilenceMs ?? 800,
      maxSegmentMs: settings.ccMaxSegmentMs ?? 20000,
    });
    const mine = { transcriber, feed: createTapFeed(tap), model, settings: { ...settings, ccVad: vad }, finals: [], interims: 0 };
    run = last = mine;
    transcriber.onsegment = (event) => {
      if (run !== mine) return;
      const { id, isFinal, transcript, confidence, start: from, end, speaker, words, latency, ms } = event;
      const segment = { id, isFinal, transcript, confidence, start: from, end, speaker, ...(words && { words }), ...(latency != null && { latency }), ...(ms != null && { ms }) };
      if (isFinal && transcript) {
        mine.finals.push(segment);
        log.add("result", "caption", `[${clock(from)}–${clock(end)}] ${transcript}${latency != null ? ` · ${latency.toFixed(2)} s after it ended` : ""}`);
      } else if (!isFinal) {
        mine.interims++;
      }
      showSegment(segment);
      onSegment(segment, mine);
    };
    transcriber.onerror = (event) => {
      if (run !== mine) return;
      log.add("error", "captions", `${event.error}: ${event.message}`);
      onError(event);
    };
    transcriber.onend = () => {
      if (run === mine) run = null;
    };
    log.add("call", "captions", `${resolve(model)?.label ?? model} · ${settings.ccDevice} · ${vad} · a pause of ${settings.ccSilenceMs ?? 800} ms ends an utterance${settings.ccInterim ? ` · interim text every ${settings.ccInterimIntervalMs ?? 500} ms` : " · no interim text"}`);
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

  // Ends the run at once (the source is closing): what isn't delivered yet is dropped.
  function stop() {
    const ending = run;
    run = null;
    ending?.transcriber.abort();
    clearOverlay();
  }

  return {
    start,
    stop,
    // Ends the utterance in progress here; resolves once every caption up to now is delivered.
    cut: () => run?.transcriber.cut() ?? Promise.resolve(),
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
