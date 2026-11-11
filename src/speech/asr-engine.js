// Picks the transcription engine for a model from its config.json: Whisper
// models get the Whisper engine (prompts, confidence, languages), CTC models
// (wav2vec2, Parakeet CTC) the CTC engine. Both have the same interface.

import { createCtcEngine } from "./ctc-engine.js";
import { useModelSource } from "./model-env.js";
import { createWhisperEngine } from "./whisper-engine.js";

const WHISPER = new Set(["whisper", "lite-whisper"]);

export async function createAsrEngine(transformers, options) {
  const { env, AutoConfig } = transformers;
  useModelSource(env, options);
  const config = await AutoConfig.from_pretrained(options.model, { progress_callback: options.onProgress });
  return WHISPER.has(config.model_type) ? createWhisperEngine(transformers, options) : createCtcEngine(transformers, options);
}
