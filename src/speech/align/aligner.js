// Word times for any transcript, by forced alignment against a CTC model
// (wav2vec2): the model hears the audio, src/align/ctc.js lines the words up
// with what it heard. Takes the Transformers.js module as an argument, like
// the engines, so the worker and the Node tests share it.

import { useModelSource } from "../model-env.js";
import { alignFrames, logSoftmax, toSeconds } from "./ctc.js";

export async function createAligner(transformers, options) {
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

  // The vocabulary, from the tokenizer's own JSON (get_vocab() is empty in
  // Transformers.js 4): single characters, the word delimiter and the blank.
  const vocab = tokenizer._tokenizerJSON?.model?.vocab ?? {};
  const charToId = new Map();
  for (const [token, id] of Object.entries(vocab)) {
    if ([...token].length === 1 && token !== "|") charToId.set(token.toUpperCase(), id);
  }
  if (!charToId.size) throw new Error(`${model} has no character vocabulary to align with`);
  const blank = tokenizer.pad_token_id ?? 0;
  const delimiter = vocab["|"] ?? null;

  // Words of `text` with their times in `audio` (seconds from its start).
  async function align(audio, text) {
    const words = String(text ?? "").split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const { logits } = await ctc(await processor(audio));
    const [, frames, size] = logits.dims;
    const emissions = logSoftmax(logits.data, frames, size);
    const duration = audio.length / 16000;
    return toSeconds(alignFrames(emissions, frames, size, words, { charToId, blank, delimiter }), duration / frames, duration);
  }

  return {
    align,
    dispose: () => ctc.dispose(),
    info: { model, dtype, device, loadMs: Date.now() - started },
  };
}
