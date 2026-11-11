// CTC transcription core (wav2vec2, Parakeet CTC): one forward pass, the most
// likely token per frame, decoded the way Transformers.js's ASR pipeline
// does. Same interface as the Whisper engine, so the worker, the file
// pipeline and the Node tests use either. Takes the Transformers.js module as
// an argument instead of importing it.
//
// Differences from Whisper: English only, no prompt (phrases are ignored), and
// no punctuation. wav2vec2 gives upper-case letters and Parakeet lower-case,
// so single-case text is put in sentence case.

import { useModelSource } from "./model-env.js";
import { LanguageError } from "./whisper-engine.js";

export async function createCtcEngine(transformers, options) {
  const { env, AutoProcessor, AutoTokenizer, AutoModelForCTC } = transformers;
  const { model, dtype = "q8", device = "wasm", localModelPath, allowRemoteModels = false, wasmPaths, onProgress } = options;

  useModelSource(env, { localModelPath, allowRemoteModels, wasmPaths });

  const started = Date.now();
  const progress_callback = onProgress ?? undefined;
  const [processor, tokenizer, ctc] = await Promise.all([
    AutoProcessor.from_pretrained(model, { progress_callback }),
    AutoTokenizer.from_pretrained(model, { progress_callback }),
    AutoModelForCTC.from_pretrained(model, { dtype, device, progress_callback }),
  ]);

  // Frame ids to text. CTC merges repeated frames, then drops the blanks, so a
  // doubled letter survives as "O, blank, O". wav2vec2's tokenizer has a CTC
  // decoder that does exactly that, given the frames with their blanks; asking
  // it to skip special tokens removes the blanks first and turns "look" into
  // "lok" (Transformers.js's own ASR pipeline does this). Other tokenizers
  // (Parakeet's) don't merge at all, so they get the collapsed ids.
  const ctcDecoder = tokenizer.constructor.name === "Wav2Vec2CTCTokenizer";
  function decode(ids, blank) {
    if (ctcDecoder) return tokenizer.decode(ids, { skip_special_tokens: false }).replace(/<\/?s>|<unk>|<pad>/g, " ");
    const collapsed = ids.filter((id, f) => id !== blank && (f === 0 || ids[f - 1] !== id));
    return collapsed.length ? tokenizer.decode(collapsed, { skip_special_tokens: true }) : ""; // silence: all blanks
  }

  async function transcribe(audio, { language = "en", words = false } = {}) {
    if (language !== "en") throw new LanguageError(language);
    const t0 = Date.now();
    const { logits } = await ctc(await processor(audio));
    const [, frames, vocab] = logits.dims;
    const data = logits.data;
    const ids = new Array(frames);
    // Confidence: the geometric mean of the chosen token's probability, over
    // the frames that emit a new token (repeats and blanks don't count).
    const blank = tokenizer.pad_token_id ?? vocab - 1;
    let logSum = 0;
    let emitted = 0;
    for (let f = 0; f < frames; f++) {
      const row = f * vocab;
      let best = 0;
      let max = -Infinity;
      for (let v = 0; v < vocab; v++) {
        if (data[row + v] > max) [max, best] = [data[row + v], v];
      }
      ids[f] = best;
      if (best !== blank && (f === 0 || ids[f - 1] !== best)) {
        let sum = 0;
        for (let v = 0; v < vocab; v++) sum += Math.exp(data[row + v] - max);
        logSum -= Math.log(sum); // log p(best) = max - logSumExp
        emitted++;
      }
    }
    let text = decode(ids, blank).replace(/\s+/g, " ").trim();
    // wav2vec2 shouts and Parakeet whispers; either way, sentence case reads better.
    if (text === text.toUpperCase() || text === text.toLowerCase()) {
      text = text.toLowerCase().replace(/^\p{L}/u, (c) => c.toUpperCase()).replace(/\bi\b/g, "I");
    }
    const confidence = emitted ? Math.exp(logSum / emitted) : 0;
    const result = { text, confidence, tokens: emitted, ms: Date.now() - t0 };
    if (words) result.words = wordsFromFrames(ids, blank, audio.length / 16000 / frames, text);
    return result;
  }

  // Word times straight from the frames: a word starts on its first token's
  // first frame and ends after its last token's last frame. wav2vec2 marks
  // word breaks with "|", sentencepiece models (Parakeet) with a leading "▁".
  const idToToken = [];
  for (const [token, id] of Object.entries(tokenizer._tokenizerJSON?.model?.vocab ?? {})) idToToken[id] = token;
  function wordsFromFrames(ids, blank, secondsPerFrame, text) {
    const words = [];
    let current = null;
    for (let f = 0; f < ids.length; f++) {
      const id = ids[f];
      if (id === blank) continue;
      const token = idToToken[id] ?? "";
      const repeat = f > 0 && ids[f - 1] === id;
      if (token === "|") {
        current = null;
        continue;
      }
      if (repeat && current) {
        current.end = f + 1;
        continue;
      }
      if (!current || token.startsWith("▁")) {
        current = { word: "", start: f, end: f + 1 };
        words.push(current);
      }
      current.word += token.replace(/^▁/, "");
      current.end = f + 1;
    }
    // Show each word as the text spells it (sentence case), when they line up.
    const spelled = text.split(" ").filter(Boolean);
    const round = (s) => Math.round(s * 1000) / 1000;
    return words.map((w, i) => ({
      word: spelled.length === words.length ? spelled[i] : w.word.toLowerCase(),
      start: round(w.start * secondsPerFrame),
      end: round(w.end * secondsPerFrame),
    }));
  }

  return {
    transcribe,
    dispose: () => ctc.dispose(),
    info: { model, dtype, device, multilingual: false, kind: "ctc", words: true, loadMs: Date.now() - started },
  };
}
