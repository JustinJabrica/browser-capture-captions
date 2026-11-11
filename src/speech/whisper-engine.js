// Whisper transcription core. Shared by the browser worker and the Node tests,
// so it takes the Transformers.js module as an argument instead of importing it.

import { useModelSource } from "./model-env.js";

const SAMPLE_RATE = 16000;

// Whisper's 30 s window holds at most 448 decoder positions.
const MAX_DECODER_POSITIONS = 448;
const MAX_PROMPT_TOKENS = 200;

export async function createWhisperEngine(transformers, options) {
  const {
    env,
    AutoProcessor,
    AutoTokenizer,
    WhisperForConditionalGeneration,
    LogitsProcessor,
    LogitsProcessorList,
  } = transformers;
  const {
    model,
    dtype = "q8",
    device = "wasm",
    localModelPath,
    allowRemoteModels = false,
    wasmPaths,
    onProgress,
  } = options;

  useModelSource(env, { localModelPath, allowRemoteModels, wasmPaths });

  const started = Date.now();
  const progress_callback = onProgress ?? undefined;
  const [processor, tokenizer, whisper] = await Promise.all([
    AutoProcessor.from_pretrained(model, { progress_callback }),
    AutoTokenizer.from_pretrained(model, { progress_callback }),
    WhisperForConditionalGeneration.from_pretrained(model, { dtype, device, progress_callback }),
  ]);

  const gen = whisper.generation_config;
  const multilingual = Boolean(gen.is_multilingual);
  const startOfPrev = tokenId(tokenizer, "<|startofprev|>");

  // Records the probability of each token greedy decoding picks, so results
  // can carry a real confidence score. The logits for step N are kept until
  // step N + 1 reveals which token was chosen.
  class ConfidenceTracker extends LogitsProcessor {
    logProbs = [];
    previous = null;

    _call(inputIds, logits) {
      if (this.previous) {
        const chosen = Number(inputIds[0].at(-1));
        this.logProbs.push(this.previous.data[chosen] - this.previous.logSumExp);
      }
      const data = Float32Array.from(logits.data);
      let max = -Infinity;
      for (const v of data) if (v > max) max = v;
      let sum = 0;
      for (const v of data) sum += Math.exp(v - max);
      this.previous = { data, logSumExp: max + Math.log(sum) };
      return logits;
    }
  }

  // Word times decode in timestamp mode (no <|notimestamps|>): Whisper then
  // starts with a <|0.00|> token, which takes time zero, so the first word
  // gets its real start rather than 0.
  function initTokens(language, { timestamps = false } = {}) {
    const tokens = [gen.decoder_start_token_id];
    if (multilingual) {
      const lang = gen.lang_to_id[`<|${language}|>`];
      if (lang === undefined) throw new LanguageError(language);
      tokens.push(lang, gen.task_to_id.transcribe);
    }
    if (!timestamps) tokens.push(gen.no_timestamps_token_id);
    return tokens;
  }

  // Word times need the decoder's cross-attention outputs, which only the
  // *_timestamped exports have (both kinds list alignment_heads).
  const canTimeWords =
    Boolean(gen.alignment_heads) && (whisper.sessions?.decoder_model_merged?.outputNames ?? []).some((n) => n.startsWith("cross_attentions"));
  const hopLength = processor.feature_extractor?.config?.hop_length ?? 160;
  const timestampBegin = gen.no_timestamps_token_id + 1;

  async function transcribe(audio, { language = "en", prompt = "", words = false } = {}) {
    const t0 = Date.now();
    const { input_features } = await processor(audio);
    const timed = words && canTimeWords;

    let decoderInputIds = initTokens(language, { timestamps: timed });
    if (prompt && startOfPrev !== undefined) {
      const promptIds = tokenizer
        .encode(` ${prompt.trim()}`, { add_special_tokens: false })
        .slice(-MAX_PROMPT_TOKENS);
      decoderInputIds = [startOfPrev, ...promptIds, ...decoderInputIds];
    }

    const tracker = new ConfidenceTracker();
    const logitsProcessor = new LogitsProcessorList();
    logitsProcessor.push(tracker);

    // Roughly 3-4 tokens per second of speech; the cap stops runaway
    // repetition loops on noisy input.
    const seconds = audio.length / SAMPLE_RATE;
    const maxNewTokens = Math.min(
      MAX_DECODER_POSITIONS - decoderInputIds.length,
      Math.ceil(seconds * 8) + 16,
    );

    const output = await whisper.generate({
      inputs: input_features,
      decoder_input_ids: decoderInputIds,
      logits_processor: logitsProcessor,
      max_new_tokens: maxNewTokens,
      // num_frames: the audio's own length, not Whisper's 30 s window, or the
      // times are spread over silence that isn't there.
      ...(timed && { return_timestamps: true, return_token_timestamps: true, num_frames: Math.floor(audio.length / hopLength) }),
    });
    const sequences = output.sequences ?? output;

    const generated = sequences.tolist()[0].slice(decoderInputIds.length);
    // Timestamp tokens (<|1.20|>) aren't special to the tokenizer; leave them out of the text.
    const text = tokenizer.decode(generated.filter((id) => Number(id) < timestampBegin), { skip_special_tokens: true }).trim();
    const { logProbs } = tracker;
    const confidence = logProbs.length
      ? Math.exp(logProbs.reduce((a, b) => a + b, 0) / logProbs.length)
      : 0;

    const result = { text, confidence, tokens: generated.length, ms: Date.now() - t0 };
    if (timed) {
      const times = Array.from(output.token_timestamps.data).slice(decoderInputIds.length);
      result.words = endAtSpeech(wordsFromTokens(generated.map(Number), times), audio);
    }
    return result;
  }

  // The last word's end comes from the token after it (the full stop, or the
  // end of text), which cross-attention places late, often past the clip. It
  // ends instead where the speech does: the last 20 ms frame, after the word
  // starts, louder than a tenth of the clip's loudest frame.
  function endAtSpeech(words, audio) {
    if (!words.length) return words;
    const duration = audio.length / SAMPLE_RATE;
    const frame = SAMPLE_RATE / 50;
    const rms = [];
    for (let s = 0; s + frame <= audio.length; s += frame) {
      let sum = 0;
      for (let i = s; i < s + frame; i++) sum += audio[i] * audio[i];
      rms.push(Math.sqrt(sum / frame));
    }
    const loud = Math.max(...rms) / 10;
    const last = words.at(-1);
    let speechEnd = last.start;
    for (let f = Math.floor(last.start * 50); f < rms.length; f++) if (rms[f] >= loud) speechEnd = (f + 1) / 50;
    last.end = Math.min(last.end, Math.max(last.start + 0.02, speechEnd));
    for (const w of words) w.end = Math.min(w.end, duration);
    return words;
  }

  // Groups generated tokens into words, as Whisper's own word timestamps do: a
  // token starting with a space starts a word, punctuation joins the word
  // before. A token's time is when it starts; a word ends when the next
  // token (or end of text) starts.
  const special = new Set(tokenizer.all_special_ids?.map(Number) ?? []);
  function wordsFromTokens(ids, times) {
    const words = [];
    for (let i = 0; i < ids.length; i++) {
      if (special.has(ids[i]) || ids[i] >= gen.no_timestamps_token_id) continue;
      const piece = tokenizer.decode([ids[i]], { skip_special_tokens: true });
      if (!piece) continue;
      const end = times[i + 1] ?? times[i];
      const startsWord = /^\s/.test(piece) || !words.length;
      const joinsBefore = /^[^\s\p{L}\p{N}]+$/u.test(piece.trim()) && words.length;
      if (startsWord && !joinsBefore) words.push({ word: piece.trim(), start: times[i], end });
      else Object.assign(words.at(-1), { word: words.at(-1).word + piece.trim(), end });
    }
    const round = (s) => Math.round(s * 1000) / 1000;
    return words.filter((w) => w.word).map((w) => ({ word: w.word, start: round(w.start), end: round(Math.max(w.end, w.start)) }));
  }

  return {
    transcribe,
    dispose: () => whisper.dispose(),
    info: { model, dtype, device, multilingual, words: canTimeWords, loadMs: Date.now() - started },
  };
}

// Thrown by either engine (ctc-engine.js imports it) for a language the model
// doesn't know.
export class LanguageError extends Error {
  constructor(language) {
    super(`The transcription model can't transcribe "${language}"`);
    this.name = "LanguageError";
  }
}

function tokenId(tokenizer, token) {
  const ids = tokenizer.encode(token, { add_special_tokens: false });
  return ids.length === 1 ? ids[0] : undefined;
}
