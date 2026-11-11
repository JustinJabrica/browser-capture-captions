// Module worker that runs Silero VAD for live mode, so speech detection never
// waits behind Whisper in the speech worker.
//
// In:  { type: "load", config: { transformersUrl, wasmPaths, model, localModelPath, allowRemoteModels } }
//      { type: "samples", samples } | { type: "flush" }
// Out: { type: "ready" } | { type: "load-error", message }
//      { type: "probs", pairs: [[window, probability]] } | { type: "flushed" }

import { sameOriginPath } from "./model-env.js";
import { loadSilero, sileroStream } from "./vad.js";

let stream = null;
let pending = []; // samples that arrive while the model loads

self.onmessage = async ({ data }) => {
  switch (data.type) {
    case "load":
      try {
        const transformers = await import(data.config.transformersUrl);
        const silero = await loadSilero(transformers, { ...data.config, localModelPath: sameOriginPath(data.config.localModelPath) });
        stream = sileroStream(silero);
        self.postMessage({ type: "ready" });
        for (const samples of pending.splice(0)) send(stream.push(samples));
      } catch (err) {
        self.postMessage({ type: "load-error", message: err instanceof Error ? err.message : String(err) });
      }
      break;
    case "samples":
      if (stream) send(stream.push(data.samples));
      else pending.push(data.samples);
      break;
    case "flush":
      await send(stream.flush());
      self.postMessage({ type: "flushed" });
      break;
  }
};

const send = (work) => work.then((pairs) => pairs.length && self.postMessage({ type: "probs", pairs }));
