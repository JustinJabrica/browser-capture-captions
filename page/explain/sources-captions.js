// Sources for the captions' explanations (topics-captions.js). Same shape as
// sources-media.js: SOURCES[id] = [{ title, by, year?, where, url }]. The
// links are ones automatic-speech-recognition-and-diarization cited;
// npm run check:sources checks them.

const WHISPER = {
  title: "Robust Speech Recognition via Large-Scale Weak Supervision",
  by: "Alec Radford, Jong Wook Kim, Tao Xu, Greg Brockman, Christine McLeavey, Ilya Sutskever (OpenAI)",
  year: 2022,
  where: "arXiv",
  url: "https://arxiv.org/abs/2212.04356",
};
const WHISPER_CODE = { title: "openai/whisper", by: "OpenAI", where: "GitHub", url: "https://github.com/openai/whisper" };
const TRANSFORMERS_JS = { title: "Transformers.js", by: "Hugging Face", where: "official docs", url: "https://huggingface.co/docs/transformers.js/index" };
const TRANSFORMERS_ENV = { title: "Transformers.js API: env", by: "Hugging Face", where: "official docs", url: "https://huggingface.co/docs/transformers.js/api/env" };
const TRANSFORMERS_WEBGPU = { title: "Transformers.js: Running models on WebGPU", by: "Hugging Face", where: "official docs", url: "https://huggingface.co/docs/transformers.js/guides/webgpu" };
const ORT_WEB = { title: "ONNX Runtime Web", by: "Microsoft (ONNX Runtime)", where: "official docs", url: "https://onnxruntime.ai/docs/tutorials/web/" };
const ORT_FLAGS = {
  title: "ONNX Runtime Web: the 'env' flags and session options",
  by: "Microsoft (ONNX Runtime)",
  where: "official docs",
  url: "https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html",
};
const HUB = { title: "Hugging Face Hub: Models", by: "Hugging Face", where: "official docs", url: "https://huggingface.co/docs/hub/models" };
const ONNX_COMMUNITY = { title: "onnx-community (ONNX Community) on Hugging Face", by: "ONNX Community", where: "Hugging Face", url: "https://huggingface.co/onnx-community" };
const WEBGPU = {
  title: "WebGPU (Candidate Recommendation Draft)",
  by: "W3C GPU for the Web WG; editors Kai Ninomiya, Brandon Jones (Google), Jim Blandy (Mozilla)",
  year: 2026,
  where: "W3C",
  url: "https://www.w3.org/TR/webgpu/",
};
const WEBGPU_MDN = { title: "WebGPU API", by: "MDN Web Docs (Mozilla)", year: 2026, where: "MDN", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API" };
const VAD = { title: "Voice activity detection (Wikipedia)", by: "Wikipedia contributors", year: 2025, where: "Wikipedia", url: "https://en.wikipedia.org/wiki/Voice_activity_detection" };
const WHISPERX = {
  title: "WhisperX: Time-Accurate Speech Transcription of Long-Form Audio (INTERSPEECH 2023)",
  by: "Max Bain, Jaesung Huh, Tengda Han, Andrew Zisserman",
  year: 2023,
  where: "arXiv",
  url: "https://arxiv.org/abs/2303.00747",
};
const SILERO = { title: "Silero VAD: pre-trained enterprise-grade Voice Activity Detector", by: "Silero Team", year: 2024, where: "GitHub", url: "https://github.com/snakers4/silero-vad" };
const WEBRTC_VAD = { title: "WebRTC source: common_audio/vad", by: "The WebRTC project (Google)", where: "webrtc.googlesource.com", url: "https://webrtc.googlesource.com/src/+/refs/heads/main/common_audio/vad/" };
const LIBFVAD = { title: "libfvad: voice activity detection library based on WebRTC's VAD engine", by: "Daniel Pirch (dpirch)", where: "GitHub", url: "https://github.com/dpirch/libfvad" };
const PY_WEBRTCVAD = { title: "py-webrtcvad: Python interface to the WebRTC Voice Activity Detector", by: "John Wiseman (wiseman)", where: "GitHub", url: "https://github.com/wiseman/py-webrtcvad" };
const INTERIM = {
  title: "SpeechRecognition: interimResults property",
  by: "MDN Web Docs (Mozilla)",
  year: 2025,
  where: "MDN",
  url: "https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/interimResults",
};

const WEBVTT = { title: "WebVTT: The Web Video Text Tracks Format", by: "W3C Timed Text Working Group", year: 2019, where: "W3C Candidate Recommendation", url: "https://www.w3.org/TR/webvtt1/" };
const WEBVTT_MDN = { title: "Web Video Text Tracks Format (WebVTT)", by: "MDN Web Docs (Mozilla)", where: "MDN", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebVTT_API/Web_Video_Text_Tracks_Format" };
const TRACK = { title: "<track>: The Embed Text Track element", by: "MDN Web Docs (Mozilla)", where: "MDN", url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/track" };
const SUBRIP = { title: "SubRip (Wikipedia)", by: "Wikipedia contributors", where: "Wikipedia", url: "https://en.wikipedia.org/wiki/SubRip" };
const BBC_SUBTITLES = { title: "Subtitle Guidelines", by: "BBC", where: "bbc.co.uk", url: "https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/" };
const WHISPER_TIMING = { title: "openai/whisper: timing.py (word timestamps from cross-attention and dynamic time warping)", by: "OpenAI", where: "GitHub", url: "https://github.com/openai/whisper/blob/main/whisper/timing.py" };
const CURRENT_FRAME = { title: "AudioWorkletGlobalScope: currentFrame property", by: "MDN Web Docs (Mozilla)", where: "MDN", url: "https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletGlobalScope/currentFrame" };
const WEB_AUDIO = { title: "Web Audio API 1.1", by: "W3C Audio Working Group", where: "W3C", url: "https://www.w3.org/TR/webaudio/" };

const MATROSKA_CODECS = { title: "Matroska Codec Mappings (S_TEXT/WEBVTT)", by: "Matroska.org", where: "matroska.org", url: "https://www.matroska.org/technical/codec_specs.html" };
const MEDIABUNNY_SUBTITLES = { title: "Media sources: subtitle sources", by: "Mediabunny", where: "mediabunny.dev", url: "https://mediabunny.dev/guide/media-sources" };
const MEDIABUNNY_CONVERSION = { title: "Converting media files", by: "Mediabunny", where: "mediabunny.dev", url: "https://mediabunny.dev/guide/converting-media-files" };

const WER = { title: "Word error rate (Wikipedia)", by: "Wikipedia contributors", where: "Wikipedia", url: "https://en.wikipedia.org/wiki/Word_error_rate" };

const MEDIABUNNY_SINKS = { title: "Media sinks", by: "Mediabunny", where: "mediabunny.dev", url: "https://mediabunny.dev/guide/media-sinks" };
const WEBCODECS_SPEC = { title: "WebCodecs", by: "W3C", where: "W3C Editor's Draft", url: "https://w3c.github.io/webcodecs/" };
const CANVAS_CAPTURE = { title: "HTMLCanvasElement: captureStream() method", by: "MDN Web Docs (Mozilla)", where: "MDN", url: "https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream" };
const RVFC = { title: "HTMLVideoElement: requestVideoFrameCallback() method", by: "MDN Web Docs (Mozilla)", where: "MDN", url: "https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback" };

export const CAPTIONS_SOURCES = {
  "download-burned": [MEDIABUNNY_SINKS, MEDIABUNNY_SUBTITLES, WEBCODECS_SPEC, BBC_SUBTITLES],
  ccBurnMethod: [WEBCODECS_SPEC, CANVAS_CAPTURE, RVFC],
  "second-pass": [WHISPER, WHISPERX, VAD],
  ccFinalModel: [WHISPER, HUB],
  ccFinalWords: [WHISPER_TIMING, WHISPERX],
  "m-fp-wer": [WER],
  "download-subtitled": [MEDIABUNNY_SUBTITLES, MEDIABUNNY_CONVERSION, MATROSKA_CODECS, WEBVTT],
  "take-transcript": [WEBVTT, TRACK],
  "captions-on-the-timeline": [CURRENT_FRAME, WEB_AUDIO],
  ccWords: [WHISPER_TIMING, WHISPERX, WHISPER],
  ccCueChars: [BBC_SUBTITLES, WEBVTT],
  ccCueLines: [BBC_SUBTITLES],
  ccCueSeconds: [BBC_SUBTITLES],
  "download-vtt": [WEBVTT, WEBVTT_MDN, TRACK],
  "download-srt": [SUBRIP],
  "group-captions": [WHISPER, TRANSFORMERS_JS, ORT_WEB],
  captions: [TRANSFORMERS_JS, ORT_WEB],
  ccModel: [WHISPER, WHISPER_CODE, HUB, ONNX_COMMUNITY, TRANSFORMERS_ENV],
  ccDevice: [TRANSFORMERS_WEBGPU, ORT_WEB, ORT_FLAGS, WEBGPU, WEBGPU_MDN],
  ccVad: [VAD, WHISPERX, WEBRTC_VAD, LIBFVAD, SILERO],
  ccVadLevel: [PY_WEBRTCVAD, LIBFVAD],
  ccVadThreshold: [SILERO],
  ccMaxSegmentMs: [WHISPER],
  ccInterim: [INTERIM, WHISPER],
  ccInterimIntervalMs: [INTERIM],
  "chip-speech": [ORT_FLAGS, TRANSFORMERS_JS],
  "live-captions": [WHISPER],
  "event-model": [TRANSFORMERS_ENV, HUB],
};
