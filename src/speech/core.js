// The speech engine's settings, the client for the engine worker, and
// language and transcript helpers. Every importer on a page gets the same
// engine and worker; createEngine() makes another, with settings of its own
// (a different model, say), for work that shouldn't wait behind live captions. Carried over from
// automatic-speech-recognition-and-diarization's src/core.js, without the
// speaker models and the server-side engines.

import { MODELS_URL, ORT_WASM_PATHS, TRANSFORMERS_URL } from "../deps.js";
import { modelDir, resolve, timestampedFor } from "./registry.js";

const here = new URL(".", import.meta.url);

// Engine-wide settings. They can be changed with configure() until the
// engine starts loading, and again after engine.reset().
export const config = {
  // A registry id or a Hugging Face repo.
  model: "whisper-base.en",
  // Models on this server (models/<repo>/, from npm run download-model), and
  // which are there: the repos in localModels load from modelPath, the rest
  // from the Hugging Face hub, which the browser then keeps in its Cache
  // Storage. The page sets localModels from models/index.json.
  modelPath: MODELS_URL,
  localModels: [],
  transformersUrl: TRANSFORMERS_URL,
  wasmPaths: ORT_WASM_PATHS,
  // "wasm" runs the transcription model on the CPU. "webgpu" runs Whisper's
  // encoder on the GPU (CTC models have no WebGPU setup) and falls back to
  // "wasm" if that fails; it is faster only on some machines.
  device: "wasm",
  // "auto" picks per device; otherwise a Transformers.js dtype, or an object
  // of them per model file.
  dtype: "auto",
  // Word times on final segments: "off", "whisper" (the model's *_timestamped
  // export, loaded in its place) or "align" (wav2vec2 forced alignment of the
  // text). CTC models time their own words whenever this isn't "off".
  words: "off",
  alignmentModel: "wav2vec2-align",
  // Voice activity detection (vad.js), which cuts live audio into utterances:
  // "energy" (the built-in rule), "webrtc-vad" (aggressiveness vadLevel, 0-3)
  // or "silero-vad" (speech when its probability reaches vadThreshold). These
  // are read at each start().
  vad: "energy",
  vadLevel: 2,
  vadThreshold: 0.5,
  // transcribeFile() refuses longer recordings: decoded 16 kHz mono (32-bit
  // floats) is about 230 MB an hour.
  maxFileSeconds: 7200,
};

// The model the worker loads, as its registry entry: with words: "whisper",
// the model's timestamped export (same weights, plus the cross-attention
// outputs word times need).
export function loadedModel(settings = config) {
  const entry = resolve(settings.model, { kind: "asr" });
  return (settings.words === "whisper" && timestampedFor(settings.model)) || entry;
}

// Where a model's files come from: { model (its repo), localModelPath,
// allowRemoteModels, from: "same-origin" | "hub" }.
export function modelSource(idOrRepo, kind, settings = config) {
  const entry = resolve(idOrRepo, { kind });
  const repo = modelDir(entry) ?? idOrRepo;
  const local = settings.localModels.includes(repo);
  return { model: repo, localModelPath: local ? settings.modelPath : null, allowRemoteModels: !local, from: local ? "same-origin" : "hub" };
}

// Settings that are read per run, so they can change after the engine loads.
const RUN_OPTIONS = ["vad", "vadLevel", "vadThreshold", "localModels"];

// What createLiveDetector() and Silero's worker need.
export function detectorOptions() {
  return [
    { vad: config.vad, vadLevel: config.vadLevel, vadThreshold: config.vadThreshold },
    { transformersUrl: config.transformersUrl, wasmPaths: config.wasmPaths, ...modelSource("silero-vad", "vad") },
  ];
}

export function configure(options = {}) {
  const perRun = Object.keys(options).filter((key) => RUN_OPTIONS.includes(key));
  for (const key of perRun) if (options[key] !== undefined) config[key] = options[key];
  if (perRun.length === Object.keys(options).length) return config;
  if (engine.state !== "unloaded") {
    console.warn("configure() has no effect once the speech engine has started loading: engine.reset() first");
    return config;
  }
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || !(key in config)) continue;
    config[key] = value;
  }
  return config;
}

// ---------------------------------------------------------------------------
// Engine: one shared worker for the whole page, which hosts the models.
// ---------------------------------------------------------------------------

class EngineClient extends EventTarget {
  // settings: the shared config, or a copy with its own model and device.
  constructor(settings = config) {
    super();
    this.settings = settings;
  }

  state = "unloaded"; // unloaded | loading | ready | error
  info = null;
  error = null;
  #worker = null;
  #loading = null;
  #rejectLoad = null;
  #queue = [];
  #inflight = null;
  #nextId = 1;
  #nextFile = 1;

  load() {
    if (this.#loading) return this.#loading;
    this.#setState("loading");
    const worker = new Worker(new URL("engine-worker.js", here), { type: "module" });
    this.#worker = worker;
    this.#loading = new Promise((resolve, reject) => {
      this.#rejectLoad = reject;
      worker.onmessage = ({ data }) => this.#worker === worker && this.#onMessage(data, resolve, reject);
      worker.onerror = (event) => {
        event.preventDefault();
        if (this.#worker === worker) this.#failLoad(event.message || "The speech worker failed to start", reject);
      };
      const s = this.settings;
      const asr = modelSource(loadedModel(s).id, loadedModel(s).kind, s);
      worker.postMessage({
        type: "load",
        config: {
          ...asr,
          words: s.words,
          alignment: modelSource(s.alignmentModel, "alignment", s),
          silero: modelSource("silero-vad", "vad", s),
          dtype: s.dtype,
          device: s.device,
          transformersUrl: s.transformersUrl,
          wasmPaths: s.wasmPaths,
        },
      });
    });
    this.#loading.catch(() => {});
    return this.#loading;
  }

  // Stops the worker and forgets the loaded models, so configure() can change
  // the engine-wide settings and the next load() starts afresh. Queued and
  // running jobs resolve to null, as cancelled ones do.
  reset() {
    this.#worker?.terminate();
    this.#worker = null;
    if (this.state === "loading") this.#rejectLoad?.(new Error("The speech engine was reset while it loaded"));
    this.#loading = null;
    this.info = null;
    this.error = null;
    for (const job of this.#queue.splice(0)) job.resolve(null);
    this.#inflight?.resolve(null);
    this.#inflight = null;
    this.#setState("unloaded");
  }

  // Queues a transcription. `audio` is a Float32Array (handed over to the
  // worker, so the caller can't use it afterwards) or { fileId, start, end }.
  // Jobs run one at a time, in order; priority jobs go ahead of the others.
  // A job with a replaceKey supersedes any queued job with the same key
  // (used for interim results, where only the newest one matters).
  // Cancelled and superseded jobs resolve to null.
  transcribe(audio, options, { session, replaceKey, priority } = {}) {
    // Retries the load if an earlier attempt failed; a failure rejects the job.
    this.load().catch(() => {});
    return this.#enqueue({ type: "transcribe", audio, options, session, replaceKey, priority });
  }

  // Queues speech detection over audio (usually a whole file):
  // { regions: [[start, end]] } in seconds. options: { vad, vadLevel, vadThreshold }.
  speech(audio, options, { session } = {}) {
    this.load().catch(() => {});
    return this.#enqueue({ type: "speech", audio, options, session });
  }

  // Sends a whole recording to the worker once; jobs then refer to ranges of
  // it as { fileId, start, end }. The audio is handed over, not copied.
  openFile(audio) {
    this.load().catch(() => {});
    if (!this.#worker) throw new Error(this.error ?? "The speech worker is not running");
    const fileId = this.#nextFile++;
    this.#worker.postMessage({ type: "file-open", fileId, audio }, [audio.buffer]);
    return fileId;
  }

  closeFile(fileId) {
    this.#worker?.postMessage({ type: "file-close", fileId });
  }

  // Drops queued (not yet running) jobs for a session, or only those with
  // the given replaceKey.
  cancel(session, replaceKey) {
    this.#queue = this.#queue.filter((job) => {
      if (job.session !== session || (replaceKey && job.replaceKey !== replaceKey)) return true;
      job.resolve(null);
      return false;
    });
  }

  #enqueue(job) {
    return new Promise((resolve, reject) => {
      Object.assign(job, { resolve, reject });
      if (job.replaceKey) this.cancel(job.session, job.replaceKey);
      if (job.priority) {
        const firstNormal = this.#queue.findIndex((queued) => !queued.priority);
        this.#queue.splice(firstNormal < 0 ? this.#queue.length : firstNormal, 0, job);
      } else {
        this.#queue.push(job);
      }
      this.#pump();
    });
  }

  #onMessage(data, resolve, reject) {
    switch (data.type) {
      case "progress":
        this.dispatchEvent(new CustomEvent("progress", { detail: data }));
        break;
      case "ready":
        this.info = data.info;
        this.#setState("ready");
        resolve();
        this.#pump();
        break;
      case "load-error":
        this.#failLoad(data.message, reject);
        break;
      case "result":
      case "error": {
        const job = this.#inflight;
        this.#inflight = null;
        if (job) {
          if (data.type === "result") job.resolve(data);
          else job.reject(Object.assign(new Error(data.message), { language: data.language }));
        }
        // On a later task, so code awaiting this job can queue follow-up
        // jobs (with priority) before the next one is sent.
        setTimeout(() => this.#pump(), 0);
        break;
      }
    }
  }

  #failLoad(message, reject) {
    this.error = message;
    this.#worker?.terminate();
    this.#worker = null;
    this.#loading = null;
    this.#setState("error");
    const err = new Error(message);
    for (const job of this.#queue.splice(0)) job.reject(err);
    reject(err);
  }

  #pump() {
    if (this.#inflight || this.state !== "ready" || !this.#queue.length) return;
    const job = this.#queue.shift();
    this.#inflight = job;
    const transfer = job.audio instanceof Float32Array ? [job.audio.buffer] : [];
    this.#worker.postMessage({ type: job.type, id: this.#nextId++, audio: job.audio, options: job.options }, transfer);
  }

  #setState(state) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

export const engine = new EngineClient();

// Another engine, in a worker of its own, with the shared settings as they
// are now and these in place of some: { model, device, words, localModels }.
// It loads on first use and holds its model until reset().
export const createEngine = (overrides = {}) => new EngineClient({ ...config, ...overrides });

// ---------------------------------------------------------------------------
// Languages and transcripts
// ---------------------------------------------------------------------------

const WHISPER_LANGUAGES = new Set(
  ("en zh de es ru ko fr ja pt tr pl ca nl ar sv it id hi fi vi he uk el ms cs ro da hu ta no th " +
    "ur hr bg lt la mi ml cy sk te fa lv bn sr az sl kn et mk br eu is hy ne mn bs kk sq sw gl mr pa " +
    "si km sn yo so af oc ka be tg sd gu am yi lo uz fo ht ps tk nn mt sa lb my bo tl mg as tt haw ln " +
    "ha ba jw su yue").split(" "),
);
const LANGUAGE_ALIASES = { nb: "no", jv: "jw", fil: "tl", iw: "he", in: "id" };

const ENGLISH_ONLY = new Set(["en"]);

// The languages the transcription model (config.model) transcribes, from its
// registry entry. A model the registry doesn't know (any Hugging Face repo)
// is taken to be a Whisper export: English only when its name ends in ".en",
// else Whisper's whole list.
function modelLanguageSet() {
  const { languages } = resolve(config.model, { kind: "asr" }) ?? {};
  if (Array.isArray(languages)) return new Set(languages);
  if (languages === "whisper") return WHISPER_LANGUAGES;
  return /\.en$/i.test(config.model) ? ENGLISH_ONLY : WHISPER_LANGUAGES;
}

// BCP 47 tag -> the language code the engine takes (Whisper's), or null if
// the transcription model can't do it.
export function modelLanguage(lang) {
  const primary = String(lang).split(/[-_]/)[0].toLowerCase();
  const code = LANGUAGE_ALIASES[primary] ?? primary;
  return modelLanguageSet().has(code) ? code : null;
}

// What the transcription model understands, for messages: "English only",
// "Whisper's languages" or "25 languages (bg, cs, …)".
export function modelLanguages() {
  const set = modelLanguageSet();
  if (set === WHISPER_LANGUAGES) return "Whisper's languages";
  if (set.size === 1 && set.has("en")) return "English only";
  return `${set.size} languages (${[...set].join(", ")})`;
}

export function resolveLang(lang) {
  return lang || globalThis.document?.documentElement.lang || globalThis.navigator?.language || "en-US";
}

// Whisper's usual output on non-speech. Dropped when confidence is low.
const HALLUCINATIONS =
  /^(you|thank you|thanks|thanks for watching|thank you for watching|bye|okay|so)[.!?]*$/i;

export function cleanTranscript(text, confidence, { punctuation = true } = {}) {
  let clean = text
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ") // [BLANK_AUDIO], (music), ...
    .replace(/\s+/g, " ")
    .trim();
  if (HALLUCINATIONS.test(clean) && confidence < 0.5) clean = "";
  // Off: bare lower-case words ("blue", not "Blue.").
  if (!punctuation) {
    clean = clean.replace(/[^\p{L}\p{N}\s'’-]/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
  }
  return clean;
}

// On music, silence and noise Whisper tends to loop: the same word or phrase
// over and over. Real speech isn't like that, so this flags the loops without
// touching genuine transcripts. Conservative on purpose: it only judges results
// of six or more words, and triggers on a very low ratio of distinct words, or
// the same three-word phrase repeated several times. (A genuine chant like
// "no no no no no no" can trip it; rare, and acceptable where this only ever
// drops obvious loops.)
export function isDegenerate(text) {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (words.length < 6) return false;
  if (new Set(words).size / words.length < 0.3) return true; // "la la la la la la"
  const trigrams = new Map();
  for (let i = 0; i + 3 <= words.length; i++) {
    const gram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    trigrams.set(gram, (trigrams.get(gram) ?? 0) + 1);
  }
  return Math.max(0, ...trigrams.values()) >= 4;
}

// Contextual biasing, done by prompting. Whisper has no per-phrase boost, so
// phrases (strings or { phrase, boost }) become a decoder prompt, highest
// boost last: nearest the transcription, and kept when a long prompt is cut,
// since the engine keeps the prompt's end (as OpenAI's decoding.py does).
// Equal boosts keep their order.
export function promptFromPhrases(phrases) {
  if (!phrases?.length) return "";
  return [...phrases]
    .map((p) => (typeof p === "string" ? { phrase: p, boost: 1 } : p))
    .filter((p) => p?.phrase && p.boost > 0)
    .sort((a, b) => a.boost - b.boost)
    .map((p) => p.phrase)
    .join(", ");
}
