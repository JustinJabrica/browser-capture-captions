// Sources for the WebCodecs recorder's explanations (topics-webcodecs.js).
// Same shape as sources-media.js: SOURCES[id] = [{ title, by, year?, where, url }].

const WEBCODECS = { title: "WebCodecs", by: "W3C", where: "W3C Editor's Draft", url: "https://w3c.github.io/webcodecs/" };
const REGISTRY = { title: "WebCodecs Codec Registry", by: "W3C", where: "W3C Editor's Draft", url: "https://w3c.github.io/webcodecs/codec_registry.html" };
const TRANSFORM = { title: "MediaStreamTrack Insertable Media Processing using Streams", by: "W3C", where: "W3C Editor's Draft", url: "https://w3c.github.io/mediacapture-transform/" };
const MEDIABUNNY_SOURCES = { title: "Media sources", by: "Mediabunny", where: "mediabunny.dev", url: "https://mediabunny.dev/guide/media-sources" };
const MDN = (path, title) => ({ title, by: "MDN Web Docs (Mozilla)", where: "MDN", url: `https://developer.mozilla.org/en-US/docs/Web/API/${path}` });
const CONFIGURE = MDN("VideoEncoder/configure", "VideoEncoder: configure() method");
const AUDIO_CONFIGURE = MDN("AudioEncoder/configure", "AudioEncoder: configure() method");

export const WEBCODECS_SOURCES = {
  recorder: [WEBCODECS, MDN("MediaRecorder", "MediaRecorder"), MEDIABUNNY_SOURCES],
  "group-webcodecs": [WEBCODECS, CONFIGURE, AUDIO_CONFIGURE],
  wcContainer: [MEDIABUNNY_SOURCES, { title: "Output formats", by: "Mediabunny", where: "mediabunny.dev", url: "https://mediabunny.dev/guide/output-formats" }],
  wcVideoCodec: [
    REGISTRY,
    { title: "AVC (H.264) WebCodecs Registration", by: "W3C", where: "W3C Editor's Draft", url: "https://w3c.github.io/webcodecs/avc_codec_registration.html" },
    { title: "H.264: Advanced video coding for generic audiovisual services (Annex A, levels)", by: "ITU-T", where: "ITU-T Recommendation", url: "https://www.itu.int/rec/T-REC-H.264" },
    MDN("VideoEncoder/isConfigSupported_static", "VideoEncoder: isConfigSupported() static method"),
  ],
  wcAudioCodec: [
    REGISTRY,
    { title: "Opus WebCodecs Registration", by: "W3C", where: "W3C Editor's Draft", url: "https://w3c.github.io/webcodecs/opus_codec_registration.html" },
    { title: "AAC WebCodecs Registration", by: "W3C", where: "W3C Editor's Draft", url: "https://w3c.github.io/webcodecs/aac_codec_registration.html" },
  ],
  wcVideoBitrate: [CONFIGURE, WEBCODECS],
  wcAudioBitrate: [AUDIO_CONFIGURE, WEBCODECS],
  wcBitrateMode: [CONFIGURE, AUDIO_CONFIGURE, WEBCODECS],
  wcLatencyMode: [CONFIGURE, WEBCODECS],
  wcHardwareAcceleration: [CONFIGURE, WEBCODECS],
  wcKeyFrameEveryS: [MDN("VideoEncoder/encode", "VideoEncoder: encode() method"), WEBCODECS],
  wcQueueLimit: [MDN("VideoEncoder/encodeQueueSize", "VideoEncoder: encodeQueueSize property"), WEBCODECS],
  wcFramePath: [
    TRANSFORM,
    MDN("MediaStreamTrackProcessor", "MediaStreamTrackProcessor"),
    MDN("VideoFrame/VideoFrame", "VideoFrame: VideoFrame() constructor"),
    MDN("AudioData/AudioData", "AudioData: AudioData() constructor"),
    MDN("HTMLVideoElement/requestVideoFrameCallback", "HTMLVideoElement: requestVideoFrameCallback() method"),
  ],
  "m-wc-config": [CONFIGURE, AUDIO_CONFIGURE, REGISTRY],
  "m-wc-dropped": [MDN("VideoEncoder/encodeQueueSize", "VideoEncoder: encodeQueueSize property")],
  "m-wc-keyframes": [MDN("VideoEncoder/encode", "VideoEncoder: encode() method")],
  "m-wc-latency": [WEBCODECS],
  "caps-encoders": [MDN("VideoEncoder/isConfigSupported_static", "VideoEncoder: isConfigSupported() static method"), MDN("AudioEncoder/isConfigSupported_static", "AudioEncoder: isConfigSupported() static method")],
};
