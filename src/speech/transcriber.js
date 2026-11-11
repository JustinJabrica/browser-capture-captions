// Transcriber: live transcription with timestamps, from audio it is fed.
// Carried over from automatic-speech-recognition-and-diarization's
// src/transcriber.js, without the speaker labels and with the audio coming
// from a feed (the bench's tap, src/captions/tap-feed.js) rather than its own
// capture, so the times it reports can be placed on the tap's clock.
//
//   const t = new Transcriber({ lang: "en-US" });
//   t.onsegment = ({ id, isFinal, start, end, transcript }) => ...;
//   await t.start(feed);           // feed.open({ onAudio, onEnded }) -> { stop() }
//   await t.cut();                 // end the utterance in progress, here
//   t.stop();
//
// A feed calls onAudio with 16 kHz mono Float32Arrays, in order and with no
// gaps; a segment's start and end are seconds of that audio, counted from the
// first sample fed.

import { cleanTranscript, configure, detectorOptions, engine, modelLanguage, modelLanguages, promptFromPhrases, resolveLang } from "./core.js";
import { SAMPLE_RATE, Segmenter } from "./audio.js";
import { createLiveDetector } from "./vad.js";

export { configure };

const DEFAULTS = {
  lang: "", // BCP 47; empty uses <html lang>, then navigator.language
  interimResults: true,
  phrases: [], // strings or { phrase, boost } the recognizer should expect
  punctuation: true,
  silenceMs: 800,
  maxSegmentMs: 20000,
  interimIntervalMs: 500,
};

const EVENTS = ["start", "segment", "vad", "error", "end"];

// A transcript segment. Interim segments (isFinal false) share their id with
// the final segment that replaces them; a final segment with an empty
// transcript withdraws interim text that turned out not to be speech.
// With word timing on (configure({ words })), final segments also carry
// words: [{ word, start, end, estimated? }], in the same seconds as start/end.
// Final segments also carry latency: seconds from the moment the utterance
// closed (silenceMs of quiet after the speech, maxSegmentMs, or a cut) to
// this segment's delivery, which includes waiting behind earlier utterances.
// cut is true on a final segment that cut() ended while the speech went on.
// speaker is always null here: speaker labels are a later stage.
export class SegmentEvent extends Event {
  constructor(type, { id, isFinal, transcript, confidence, start, end, speaker, words, latency, cut }) {
    super(type);
    Object.assign(this, { id, isFinal, transcript, confidence, start, end, speaker });
    if (words) this.words = words;
    if (latency != null) this.latency = latency;
    if (cut) this.cut = true;
  }
}

// Word times from a clip, moved to the clip's place in the recording.
const shiftWords = (words, offset) =>
  words?.map((w) => ({ ...w, start: Math.round((w.start + offset) * 1000) / 1000, end: Math.round((w.end + offset) * 1000) / 1000 }));

// Every 20 ms frame: what the voice activity detector made of it.
// time: the frame's end, in seconds from start; score: 0-1 (Silero's speech
// probability, 0 or 1 for the others); speech: whether it counts as speech.
export class VadEvent extends Event {
  constructor(type, { time, score, speech }) {
    super(type);
    Object.assign(this, { time, score, speech });
  }
}

export class TranscriberErrorEvent extends Event {
  constructor(type, { error, message }) {
    super(type);
    this.error = error; // "language-not-supported", "audio-capture" or "network"
    this.message = message;
  }
}

const transcriberError = (code, message) => Object.assign(new Error(message), { code });
const seconds = (samples) => Math.round((samples / SAMPLE_RATE) * 1000) / 1000;

export class Transcriber extends EventTarget {
  #run = null;
  #nextId = 1;
  #handlers = {};

  constructor(options = {}) {
    super();
    // Read at each start(); change them between runs.
    this.options = { ...DEFAULTS, ...options };
  }

  get running() {
    return Boolean(this.#run);
  }

  // Resolves once audio is arriving. Rejects (after an error event) with an
  // Error whose `code` is one of the error event's codes, or "aborted" if
  // abort() was called first.
  start(feed) {
    if (this.#run) return Promise.reject(new DOMException("The transcriber is already running", "InvalidStateError"));
    if (typeof feed?.open !== "function") return Promise.reject(new TypeError("start() expects a feed: { open({ onAudio, onEnded }) }"));
    const run = new LiveRun({
      options: { ...this.options },
      feed,
      nextId: () => this.#nextId++,
      emit: (event) => this.dispatchEvent(event),
      onDone: () => {
        if (this.#run === run) this.#run = null;
      },
    });
    this.#run = run;
    return run.begin();
  }

  // Ends the utterance in progress where it is, as a final segment, and
  // carries on listening. Resolves once every segment up to here has been
  // delivered (or withdrawn).
  cut() {
    return this.#run?.cut() ?? Promise.resolve();
  }

  // Finishes the utterance in progress, delivers what is pending, then ends.
  stop() {
    this.#run?.stop();
  }

  // Ends at once, dropping anything not yet delivered.
  abort() {
    this.#run?.abort();
  }

  // Loads the model ahead of the first start().
  static async load({ onProgress } = {}) {
    const forward = ({ detail }) => onProgress?.(detail);
    engine.addEventListener("progress", forward);
    try {
      await engine.load();
    } finally {
      engine.removeEventListener("progress", forward);
    }
  }

  static {
    for (const type of EVENTS) {
      Object.defineProperty(this.prototype, `on${type}`, {
        get() {
          return this.#handlers[type] ?? null;
        },
        set(fn) {
          if (this.#handlers[type]) this.removeEventListener(type, this.#handlers[type]);
          this.#handlers[type] = typeof fn === "function" ? fn : null;
          if (this.#handlers[type]) this.addEventListener(type, this.#handlers[type]);
        },
        configurable: true,
        enumerable: true,
      });
    }
  }
}

// One start()..end run of a Transcriber.
let runCount = 0;

class LiveRun {
  state = "starting"; // starting | capturing | finishing | done
  pending = new Set();
  delivery = Promise.resolve();
  active = null; // the utterance in progress
  interimBusy = false;
  lastInterim = 0;

  constructor({ options, feed, nextId, emit, onDone }) {
    Object.assign(this, { options, feed, nextId, emit, onDone });
    this.key = `transcriber-${++runCount}`;
  }

  async begin() {
    await null; // start() returns before any event fires

    this.lang = resolveLang(this.options.lang);
    this.language = modelLanguage(this.lang);
    this.prompt = promptFromPhrases(this.options.phrases);
    if (!this.language) {
      return this.failStart("language-not-supported", `${this.lang} is not supported (the model transcribes ${modelLanguages()})`);
    }
    engine.load().catch(() => {}); // failures surface when transcribing

    let detector;
    try {
      detector = await createLiveDetector(...detectorOptions());
    } catch (err) {
      return this.failStart("network", `Speech detector unavailable: ${err?.message ?? err}`);
    }
    if (this.state !== "starting") {
      detector?.close();
      throw transcriberError("aborted", "start() was aborted");
    }
    this.detector = detector;
    let frames = 0;
    this.segmenter = new Segmenter(
      {
        sound: () => {},
        vad: (score, speech) => {
          if (this.state === "done") return;
          this.emit(new VadEvent("vad", { time: ++frames * 0.02, score, speech }));
        },
        speechStart: (utterance, startSample) => this.speechStart(utterance, startSample),
        progress: (utterance, ms, getAudio) => this.speechProgress(utterance, ms, getAudio),
        segment: (utterance, audio, startSample, how) => this.utteranceEnd(utterance, audio, startSample, how),
        discard: (utterance) => this.discard(utterance),
      },
      { ...this.options, detector },
    );
    const flowing = new Promise((resolve) => (this.onFirstAudio = resolve));

    let capture;
    try {
      capture = await this.feed.open({ onAudio: (pcm) => this.audio(pcm), onEnded: () => this.stop() });
    } catch (err) {
      return this.failStart(err.code ?? "audio-capture", err.message);
    }
    if (this.state !== "starting") {
      capture.stop();
      throw transcriberError("aborted", "start() was aborted");
    }
    this.capture = capture;

    // "start" waits for audio to actually arrive (Firefox's first
    // AudioContext can take a second to run). Times count from the first
    // sample fed.
    await Promise.race([flowing, new Promise((resolve) => setTimeout(resolve, 3000))]);
    if (this.state !== "starting") throw transcriberError("aborted", "start() was aborted");
    this.state = "capturing";
    this.emit(new Event("start"));
    if (this.stopRequested) this.stop();
  }

  failStart(code, message) {
    this.fail(code, message);
    throw transcriberError(code, message);
  }

  audio(pcm) {
    if (this.state !== "starting" && this.state !== "capturing") return;
    this.onFirstAudio();
    this.segmenter.push(pcm);
  }

  speechStart(utterance, startSample) {
    this.active = { utterance, id: this.nextId(), start: seconds(startSample), shown: false };
  }

  speechProgress(utterance, ms, getAudio) {
    const active = this.active;
    if (!this.options.interimResults || active?.utterance !== utterance) return;
    if (this.interimBusy || engine.state !== "ready") return;
    const now = performance.now();
    if (ms < 400 || now - this.lastInterim < this.options.interimIntervalMs) return;
    this.lastInterim = now;
    this.interimBusy = true;
    engine
      .transcribe(getAudio(), this.jobOptions(), { session: this.key, replaceKey: `${this.key}-interim` })
      .then((r) => {
        if (!r || this.active !== active || this.state === "done") return;
        const transcript = cleanTranscript(r.text, r.confidence, this.options);
        if (!transcript) return;
        active.shown = true;
        this.emitSegment({
          id: active.id,
          isFinal: false,
          transcript,
          confidence: 0,
          start: active.start,
          end: active.start + ms / 1000,
          speaker: null,
        });
      })
      .catch(() => {})
      .finally(() => (this.interimBusy = false));
  }

  utteranceEnd(utterance, audio, startSample, { cut = false } = {}) {
    const active =
      this.active?.utterance === utterance
        ? this.active
        : { utterance, id: this.nextId(), start: seconds(startSample), shown: false };
    active.cut = cut;
    this.active = null;
    // An interim still waiting is out of date now: the whole utterance is about to be transcribed.
    engine.cancel(this.key, `${this.key}-interim`);
    this.queueDelivery(this.transcribeUtterance(active, audio), performance.now());
  }

  discard(utterance) {
    const active = this.active;
    if (active?.utterance !== utterance) return;
    this.active = null;
    // Withdraw interim text for what turned out to be noise.
    if (active.shown) this.queueDelivery(Promise.resolve([this.withdrawal(active)]));
  }

  // Resolves to the final segments for one utterance.
  async transcribeUtterance(utterance, audio) {
    const end = utterance.start + seconds(audio.length); // before the buffer moves to the worker
    // Ahead of any interim: a finished utterance's caption matters more than a guess at the next one.
    const r = await engine.transcribe(audio, this.jobOptions({ words: true }), { session: this.key, priority: true });
    const transcript = r ? cleanTranscript(r.text, r.confidence, this.options) : "";
    if (!transcript) return utterance.shown ? [this.withdrawal(utterance)] : [];
    return [
      {
        id: utterance.id,
        isFinal: true,
        transcript,
        confidence: r.confidence,
        start: utterance.start,
        end,
        speaker: null,
        words: shiftWords(r.words, utterance.start),
        ms: r.ms,
        cut: utterance.cut,
      },
    ];
  }

  withdrawal({ id, start }) {
    return { id, isFinal: true, transcript: "", confidence: 0, start, end: start, speaker: null };
  }

  // Final segments go out in utterance order, whatever order their work
  // finishes in.
  // closedAt: performance.now() when the utterance closed, to time final segments.
  queueDelivery(work, closedAt) {
    work.catch(() => {}); // handled below, in order
    const job = (this.delivery = this.delivery
      .then(() => work)
      .then(
        (segments) => {
          const latency = closedAt == null ? undefined : Math.round(performance.now() - closedAt) / 1000;
          for (const segment of segments) this.emitSegment(segment.isFinal && segment.transcript ? { ...segment, latency } : segment);
        },
        (err) => this.engineFailed(err),
      )
      .finally(() => {
        this.pending.delete(job);
        this.maybeFinish();
      }));
    this.pending.add(job);
  }

  // words: ask for word times (final results only; interims skip the cost).
  jobOptions({ words = false } = {}) {
    return { language: this.language, prompt: this.prompt, words };
  }

  emitSegment(segment) {
    if (this.state === "done") return;
    const round = (s) => Math.round(s * 1000) / 1000;
    const event = new SegmentEvent("segment", { ...segment, start: round(segment.start), end: round(segment.end) });
    if (segment.ms != null) event.ms = segment.ms; // how long the model took
    this.emit(event);
  }

  // Resolves once everything heard up to the cut has been delivered. Speech
  // that comes after it isn't waited for: on a machine where the model can't
  // keep up, that wait would never end.
  async cut() {
    if (this.state !== "capturing") return;
    const cutting = this.segmenter.cut();
    // An asynchronous detector (Silero) still has frames to decide; the
    // utterance ends once it has, and is queued then.
    if (cutting) {
      this.queueDelivery(cutting.then(() => []));
      await cutting.catch(() => {});
    }
    await this.delivery;
  }

  stop() {
    if (this.state === "starting") {
      this.stopRequested = true;
      return;
    }
    if (this.state !== "capturing") return;
    const flushed = this.segmenter.flush();
    this.state = "finishing";
    this.release();
    // An asynchronous detector (Silero) still has frames to decide; the run
    // ends after the utterance they finish.
    if (flushed) this.queueDelivery(flushed.then(() => []));
    this.maybeFinish();
  }

  abort() {
    if (this.state === "done") return;
    engine.cancel(this.key);
    this.release();
    this.finish();
  }

  maybeFinish() {
    if (this.state === "finishing" && this.pending.size === 0) this.finish();
  }

  engineFailed(err) {
    if (this.state === "done") return;
    if (err?.language) this.fail("language-not-supported", err.message);
    else this.fail("network", `Speech engine unavailable: ${err?.message ?? err}`);
  }

  fail(error, message) {
    if (this.state === "done") return;
    this.emit(new TranscriberErrorEvent("error", { error, message }));
    engine.cancel(this.key);
    this.release();
    this.finish();
  }

  release() {
    this.capture?.stop();
    this.capture = null;
  }

  finish() {
    if (this.state === "done") return;
    this.state = "done";
    this.detector?.close();
    this.onDone();
    this.emit(new Event("end"));
  }
}
