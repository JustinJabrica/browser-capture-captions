// Points Transformers.js at one model's files before it is loaded. A model
// on this server (localModelPath set) is read from there and nowhere else; any
// other comes from the Hugging Face hub (allowRemoteModels), which a browser
// then keeps in its Cache Storage. The settings are Transformers.js's own
// globals, so each loader sets all of them, every time: a worker that loads
// one model from the server and the next from the hub would otherwise ask the
// server for the second one's files first, and log a 404 for each.
//
// options: { localModelPath, allowRemoteModels, wasmPaths }

export function useModelSource(env, { localModelPath, allowRemoteModels = false, wasmPaths } = {}) {
  env.allowLocalModels = Boolean(localModelPath);
  if (localModelPath) env.localModelPath = localModelPath;
  env.allowRemoteModels = allowRemoteModels;
  if (wasmPaths && env.backends?.onnx?.wasm) env.backends.onnx.wasm.wasmPaths = wasmPaths;
}

// Transformers.js treats an http(s) localModelPath as remote and never looks
// there for local files, so same-origin URLs are reduced to their path.
export function sameOriginPath(path) {
  if (!path) return path;
  const url = new URL(path, self.location.href);
  return url.origin === self.location.origin ? url.pathname : path;
}
