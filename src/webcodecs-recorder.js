// A recorder built from WebCodecs, beside MediaRecorder: the steps
// MediaRecorder does out of sight, done here in the open, so each can be set
// and measured.
//
//   1. Raw frames from each track. MediaStreamTrackProcessor turns a track into
//      a stream of VideoFrame or AudioData objects; Chromium has it on the
//      page (the spec puts it in dedicated workers, where no browser tested
//      here has it, and none can transfer a track there). Where there is
//      none (Firefox), video frames are copied from a <video> element playing
//      the track, one per requestVideoFrameCallback, and audio comes from the
//      bench's AudioWorklet tap, each block made into an AudioData.
//   2. VideoEncoder and AudioEncoder, configured as asked: codec, bitrate and
//      its mode, latency mode, hardware acceleration. Key frames come only
//      when asked for, so one is asked for every keyFrameEveryS seconds. A
//      frame that arrives while queueLimit frames are already waiting in the
//      encoder is dropped, as a live encoder must, and counted.
//   3. The encoded chunks, muxed packet for packet into WebM, MP4 or Matroska
//      by Mediabunny (its EncodedVideoPacketSource and EncodedAudioPacketSource).
//
// Each track's timestamps run on its own clock (Chromium stamps video frames
// with the camera's capture time, its audio from zero), so each track is put
// on the take's timeline by when its first frame reached the page, and keeps
// its own clock's spacing after that. Paused time is cut out, as
// MediaRecorder does. Every frame and audio block is restamped with its place
// on that timeline before it's encoded, so the encoders' output carries it
// (an audio encoder regroups its input: Opus hands back 20 ms packets made
// from 10 ms blocks, so its packets can't be matched to their input). Audio
// from before the take started is cut off. Same interface as TakeRecorder
// (src/recorder.js): stats, state, pause(), resume(), stop() -> the file, done.

import { BufferTarget, EncodedAudioPacketSource, EncodedPacket, EncodedVideoPacketSource, MkvOutputFormat, Mp4OutputFormat, Output, WebMOutputFormat } from "../vendor/mediabunny/mediabunny.mjs";
import { AUDIO_CODECS, VIDEO_CODECS, fitContainer, spread } from "./codecs.js";

const FORMATS = {
  webm: () => new WebMOutputFormat(),
  // The index (moov) is written at the front, as a player that streams the file wants.
  mp4: () => new Mp4OutputFormat({ fastStart: "in-memory" }),
  mkv: () => new MkvOutputFormat(),
};
const nowUs = () => performance.now() * 1000;
const even = (x) => Math.max(2, 2 * Math.floor(x / 2));
const round = (x, d = 1) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

// Whether frames can come from MediaStreamTrackProcessor on this page.
export const hasTrackProcessor = () => typeof globalThis.MediaStreamTrackProcessor === "function";
export const hasWebCodecs = () => typeof globalThis.VideoEncoder === "function" && typeof globalThis.AudioEncoder === "function";

// One track's way from the stream into the file: its raw frames, the encoder,
// and the muxer's packet source. kind "video" or "audio".
class Lane {
  constructor(recorder, kind) {
    this.recorder = recorder;
    this.kind = kind;
    this.encoder = null;
    this.source = null;
    this.chain = Promise.resolve(); // packets go to the muxer one at a time, in order
    this.offsetUs = null; // from this track's clock to the take's timeline
    this.lastKeyUs = -Infinity;
    // When each input went to encode(), by its timeline timestamp, in order: a
    // packet's latency is from the input its first sample or frame came in.
    this.sent = [];
    this.latencies = [];
    this.stats = { path: null, config: null, supported: null, framesIn: 0, encoded: 0, dropped: 0, keyFramesAsked: 0, keyFramesOut: 0, maxQueue: 0, width: null, height: null, sampleRate: null, channels: null, latencyMs: null };
    this.stop = () => {};
  }

  // Where a frame stamped rawUs (with durationUs of media in it) sits on the
  // take's timeline. The first frame's end is put at the moment it arrived:
  // a video frame is an instant, but an audio block arrives once it's full.
  place(rawUs, durationUs = 0) {
    const r = this.recorder;
    if (this.offsetUs == null) {
      this.offsetUs = nowUs() - r.t0Us - (rawUs + durationUs);
      // Kept with the take: on the tap's path rawUs is the context's own clock, so this places the file on it.
      this.stats.offsetS = Math.round(this.offsetUs) / 1e6;
    }
    return rawUs + this.offsetUs - r.pausedUs;
  }
}

export class WebCodecsRecorder {
  #output = null;
  #lanes = [];
  #state = "inactive";
  #pausedAt = null;
  #done = null;
  #resolveDone = null;
  #error = null;
  #onEvent = () => {};
  #stopping = null;
  // The take's stretches of recording, in page time (µs): { from, to (null
  // while open), pausedBeforeUs (the pauses before it) }. Blocks of the tap
  // (about 100 ms each) are cut to these, so a pause, a resume or Stop in the
  // middle of a block loses none of the sound recorded around it.
  #spans = [];
  t0Us = 0;
  pausedUs = 0;
  stats = null;

  // options: { container, videoCodec, audioCodec, videoBitrate, audioBitrate (bit/s),
  //   bitrateMode, latencyMode, hardwareAcceleration, keyFrameEveryS, queueLimit,
  //   framePath ("auto", or "fallback": the <video> element and the tap even where the processor exists), tap (the session's PcmTap, for the fallback) }
  static async create(stream, options = {}, { onEvent = () => {} } = {}) {
    const recorder = new WebCodecsRecorder();
    await recorder.#start(stream, options, onEvent);
    return recorder;
  }

  get state() {
    return this.#state;
  }

  get done() {
    return this.#done;
  }

  pause() {
    if (this.#state !== "recording") return;
    this.#state = "paused";
    this.#pausedAt = nowUs();
    this.#spans.at(-1).to = this.#pausedAt;
    this.#onEvent("pause");
  }

  resume() {
    if (this.#state !== "paused") return;
    const now = nowUs();
    this.pausedUs += now - this.#pausedAt;
    this.stats.pausedMs += (now - this.#pausedAt) / 1000;
    this.#pausedAt = null;
    this.#spans.push({ from: now, to: null, pausedBeforeUs: this.pausedUs });
    this.#state = "recording";
    this.#onEvent("resume");
  }

  // Resolves to the file.
  stop() {
    if (this.#state !== "inactive" && !this.#stopping) this.#stopping = this.#finish();
    return this.#done;
  }

  async #start(stream, o, onEvent) {
    this.#onEvent = onEvent;
    this.#done = new Promise((resolve) => (this.#resolveDone = resolve));
    const [videoTrack] = stream.getVideoTracks();
    const [audioTrack] = stream.getAudioTracks();
    const fit = fitContainer(o.container, o.videoCodec, o.audioCodec);
    for (const change of fit.changes) onEvent("config", change);
    const processor = o.framePath !== "fallback" && hasTrackProcessor();
    this.stats = {
      kind: "webcodecs",
      asked: { container: o.container, videoCodec: o.videoCodec, audioCodec: o.audioCodec, framePath: o.framePath ?? "auto" },
      timeslice: null,
      mimeType: "",
      videoBitsPerSecond: o.videoBitrate ?? null,
      audioBitsPerSecond: o.audioBitrate ?? null,
      audioBitrateMode: o.bitrateMode ?? null,
      startMs: null,
      stopMs: null,
      pausedMs: 0,
      chunks: 0,
      bytes: 0,
      emptyChunks: 0,
      firstChunkMs: null,
      chunkGapMaxMs: 0,
      error: null,
      endedByTracks: false,
      webcodecs: { container: fit.container, keyFrameEveryS: o.keyFrameEveryS ?? null, queueLimit: o.queueLimit ?? 8, latencyMode: o.latencyMode ?? null, hardwareAcceleration: o.hardwareAcceleration ?? null, video: null, audio: null },
    };
    this.#output = new Output({ format: FORMATS[fit.container](), target: new BufferTarget() });

    // The encoders are configured on each track's first frame, which gives the
    // picture size and the audio's rate and channels; the muxer needs its
    // tracks before it starts, so the sources come first.
    if (videoTrack) {
      const lane = new Lane(this, "video");
      lane.codecName = fit.video;
      lane.source = new EncodedVideoPacketSource(fit.video);
      const settings = videoTrack.getSettings();
      lane.fps = settings.frameRate || 30; // for H.264's level
      this.#output.addVideoTrack(lane.source, settings.frameRate ? { frameRate: Math.round(settings.frameRate) } : {});
      lane.stats.path = processor ? "MediaStreamTrackProcessor" : "<video> + requestVideoFrameCallback";
      this.stats.webcodecs.video = lane.stats;
      this.#lanes.push(lane);
    }
    if (audioTrack) {
      if (!processor && !o.tap) throw new Error("No way to read the audio here: no MediaStreamTrackProcessor and no tap");
      const lane = new Lane(this, "audio");
      lane.codecName = fit.audio;
      lane.source = new EncodedAudioPacketSource(fit.audio);
      this.#output.addAudioTrack(lane.source);
      lane.stats.path = processor ? "MediaStreamTrackProcessor" : "AudioWorklet tap";
      this.stats.webcodecs.audio = lane.stats;
      this.#lanes.push(lane);
    }
    if (!this.#lanes.length) throw new Error("The stream has no tracks to record");
    await this.#output.start();

    this.t0Us = nowUs();
    this.#spans = [{ from: this.t0Us, to: null, pausedBeforeUs: 0 }];
    this.#state = "recording";
    onEvent("start", `${fit.container}: ${this.#lanes.map((l) => `${l.kind} ${l.codecName} from ${l.stats.path}`).join(", ")}`);
    for (const lane of this.#lanes) {
      const track = lane.kind === "video" ? videoTrack : audioTrack;
      if (processor) this.#readProcessor(lane, track, o);
      else if (lane.kind === "video") this.#readElement(lane, track, o);
      else this.#readTap(lane, o);
      track.addEventListener("ended", () => {
        if (stream.getTracks().every((t) => t.readyState === "ended") && this.#state !== "inactive") {
          this.stats.endedByTracks = true;
          this.stop();
        }
      });
    }
  }

  // --- 1. Raw frames ---------------------------------------------------------------

  #readProcessor(lane, track, o) {
    const reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
    lane.stop = () => reader.cancel().catch(() => {});
    (async () => {
      for (;;) {
        const { value, done } = await reader.read().catch(() => ({ done: true }));
        if (done) return;
        if (lane.kind === "video") this.#videoFrame(lane, value, value.timestamp, o);
        else this.#audioData(lane, value, value.timestamp, o);
      }
    })();
  }

  // The fallback for video: a <video> element plays the track, and each frame
  // it presents is copied into a VideoFrame, stamped with when the camera took
  // it where the browser says (captureTime), otherwise when it was presented.
  #readElement(lane, track, o) {
    const video = Object.assign(document.createElement("video"), { muted: true, playsInline: true, srcObject: new MediaStream([track]) });
    let running = true;
    lane.stop = () => {
      running = false;
      video.pause();
      video.srcObject = null;
    };
    const onFrame = (_now, meta) => {
      if (!running) return;
      const atMs = meta?.captureTime ?? meta?.presentationTime ?? performance.now();
      try {
        this.#videoFrame(lane, new VideoFrame(video, { timestamp: Math.round(atMs * 1000) }), Math.round(atMs * 1000), o);
      } catch {
        // No picture yet.
      }
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(onFrame);
      else requestAnimationFrame((t) => onFrame(t, null));
    };
    video.play().then(() => onFrame(performance.now(), null), () => {});
  }

  // The fallback for audio: each block of the bench's AudioWorklet tap (about
  // 100 ms, every channel, at the AudioContext's rate), stamped from the
  // context's frame count and cut to the take's stretches of recording. A
  // block arrives once it's full, so its samples are taken to end when it
  // arrived. Each piece kept becomes an AudioData.
  #readTap(lane, o) {
    lane.stop = o.tap.listen((block, sampleRate) => {
      lane.onBlock?.();
      if (this.#error) return;
      const arrived = nowUs();
      const frames = block.channels[0].length;
      const durationUs = (frames / sampleRate) * 1e6;
      const rawUs = (block.frame / sampleRate) * 1e6;
      lane.place(rawUs, durationUs); // the first block sets the lane's offset
      const began = arrived - durationUs;
      for (const span of this.#spans) {
        const a = Math.max(0, Math.round(((Math.max(span.from, began) - began) * sampleRate) / 1e6));
        const b = Math.min(frames, Math.round(((Math.min(span.to ?? arrived, arrived) - began) * sampleRate) / 1e6));
        if (b <= a) continue;
        const ts = rawUs + (a / sampleRate) * 1e6 + lane.offsetUs - span.pausedBeforeUs;
        const data = new Float32Array((b - a) * block.channels.length);
        block.channels.forEach((c, i) => data.set(c.subarray(a, b), i * (b - a)));
        const audio = new AudioData({ format: "f32-planar", sampleRate, numberOfFrames: b - a, numberOfChannels: block.channels.length, timestamp: Math.round(ts), data });
        this.#encodeAudio(lane, audio, ts, o);
      }
    });
  }

  // --- 2. Encoding -------------------------------------------------------------------

  #videoFrame(lane, frame, rawUs, o) {
    if (this.#state !== "recording" || this.#error) return frame.close();
    lane.stats.framesIn++;
    this.stats.startMs ??= Math.round((nowUs() - this.t0Us) / 1000);
    if (!lane.encoder && !this.#configureVideo(lane, frame, o)) return frame.close();
    // The first frame is placed at the moment it arrived, so it's never before 0.
    const ts = Math.max(0, Math.round(lane.place(rawUs)));
    const queued = lane.encoder.encodeQueueSize;
    lane.stats.maxQueue = Math.max(lane.stats.maxQueue, queued);
    if (queued >= (o.queueLimit ?? 8)) {
      lane.stats.dropped++;
      return frame.close();
    }
    const keyFrame = ts - lane.lastKeyUs >= (o.keyFrameEveryS ?? 2) * 1e6;
    if (keyFrame) {
      lane.lastKeyUs = ts;
      lane.stats.keyFramesAsked++;
    }
    // The same picture, restamped: a new VideoFrame on the same memory, not a copy.
    const stamped = new VideoFrame(frame, { timestamp: ts });
    frame.close();
    lane.sent.push({ ts, at: performance.now() });
    try {
      lane.encoder.encode(stamped, { keyFrame });
    } catch (err) {
      this.#fail(err, "VideoEncoder.encode()");
    }
    stamped.close();
  }

  // The processor's audio: dropped while paused (10 ms at a time), placed on the timeline.
  #audioData(lane, audio, rawUs, o) {
    if (this.#state !== "recording" || this.#error) return audio.close();
    this.#encodeAudio(lane, audio, lane.place(rawUs, (audio.numberOfFrames / audio.sampleRate) * 1e6), o);
  }

  // An AudioData at timeline time ts (µs) into the encoder.
  #encodeAudio(lane, audio, placedUs, o) {
    if (this.#error) return audio.close();
    lane.stats.framesIn++;
    this.stats.startMs ??= Math.round((nowUs() - this.t0Us) / 1000);
    if (!lane.encoder && !this.#configureAudio(lane, audio, o)) return audio.close();
    const rate = audio.sampleRate;
    const frames = audio.numberOfFrames;
    let ts = placedUs;
    // Samples from before the take started are cut off.
    const skip = ts < 0 ? Math.min(frames, Math.round((-ts * rate) / 1e6)) : 0;
    if (skip) ts = 0;
    const count = frames - skip;
    if (!count) return audio.close();
    // Copied out (planar float, whatever the source's format) and restamped.
    const data = new Float32Array(count * audio.numberOfChannels);
    for (let c = 0; c < audio.numberOfChannels; c++) audio.copyTo(data.subarray(c * count, (c + 1) * count), { planeIndex: c, frameOffset: skip, frameCount: count, format: "f32-planar" });
    const channels = audio.numberOfChannels;
    audio.close();
    const stamped = new AudioData({ format: "f32-planar", sampleRate: rate, numberOfFrames: count, numberOfChannels: channels, timestamp: Math.round(ts), data });
    lane.stats.maxQueue = Math.max(lane.stats.maxQueue, lane.encoder.encodeQueueSize);
    lane.sent.push({ ts: Math.round(ts), at: performance.now() });
    try {
      lane.encoder.encode(stamped);
    } catch (err) {
      this.#fail(err, "AudioEncoder.encode()");
    }
    stamped.close();
  }

  #configureVideo(lane, frame, o) {
    const width = even(frame.displayWidth);
    const height = even(frame.displayHeight);
    const config = {
      codec: VIDEO_CODECS[lane.codecName].codec(width, height, lane.fps),
      width,
      height,
      ...(o.videoBitrate ? { bitrate: o.videoBitrate } : {}),
      ...(o.bitrateMode ? { bitrateMode: o.bitrateMode } : {}),
      ...(o.latencyMode ? { latencyMode: o.latencyMode } : {}),
      ...(o.hardwareAcceleration ? { hardwareAcceleration: o.hardwareAcceleration } : {}),
      // Length-prefixed NAL units, with their parameter sets in the decoder
      // config, as MP4 and Matroska store H.264 and H.265.
      ...(lane.codecName === "avc" ? { avc: { format: "avc" } } : lane.codecName === "hevc" ? { hevc: { format: "hevc" } } : {}),
    };
    Object.assign(lane.stats, { config, width, height });
    lane.encoder = new VideoEncoder({ output: (chunk, meta) => this.#mux(lane, chunk, meta), error: (e) => this.#fail(e, "VideoEncoder") });
    try {
      lane.encoder.configure(config);
    } catch (err) {
      this.#fail(err, "VideoEncoder.configure()");
      return false;
    }
    VideoEncoder.isConfigSupported(config).then((s) => (lane.stats.supported = s.supported), () => {});
    this.#onEvent("configure", `VideoEncoder ${JSON.stringify(config)}`);
    return true;
  }

  #configureAudio(lane, audio, o) {
    const config = {
      codec: AUDIO_CODECS[lane.codecName].codec,
      sampleRate: audio.sampleRate,
      numberOfChannels: audio.numberOfChannels,
      ...(o.audioBitrate ? { bitrate: o.audioBitrate } : {}),
      ...(o.bitrateMode ? { bitrateMode: o.bitrateMode } : {}),
      // Raw AAC frames, with the AudioSpecificConfig in the decoder config, as MP4 stores them.
      ...(lane.codecName === "aac" ? { aac: { format: "aac" } } : {}),
    };
    Object.assign(lane.stats, { config, sampleRate: audio.sampleRate, channels: audio.numberOfChannels });
    lane.encoder = new AudioEncoder({ output: (chunk, meta) => this.#mux(lane, chunk, meta), error: (e) => this.#fail(e, "AudioEncoder") });
    try {
      lane.encoder.configure(config);
    } catch (err) {
      this.#fail(err, "AudioEncoder.configure()");
      return false;
    }
    AudioEncoder.isConfigSupported(config).then((s) => (lane.stats.supported = s.supported), () => {});
    this.#onEvent("configure", `AudioEncoder ${JSON.stringify(config)}`);
    return true;
  }

  // --- 3. Muxing ------------------------------------------------------------------------

  // An encoded chunk into the file. Its timestamp is already the timeline's
  // (the input was restamped); its latency is from the latest input that
  // started at or before it (a video encoder may hand back frames out of
  // order, so the inputs are searched, not just shifted).
  #mux(lane, chunk, meta) {
    let i = -1;
    for (let j = 0; j < lane.sent.length && lane.sent[j].ts <= chunk.timestamp; j++) i = j;
    if (i >= 0) {
      lane.latencies.push(performance.now() - lane.sent[i].at);
      if (lane.kind === "audio") lane.sent.splice(0, i);
      else lane.sent.splice(i, 1);
    }
    lane.stats.encoded++;
    if (lane.kind === "video" && chunk.type === "key") lane.stats.keyFramesOut++;
    const now = Math.round((nowUs() - this.t0Us) / 1000);
    if (this.stats.firstChunkMs == null) this.stats.firstChunkMs = now;
    else this.stats.chunkGapMaxMs = Math.max(this.stats.chunkGapMaxMs, now - (this.lastChunkMs ?? now));
    this.lastChunkMs = now;
    this.stats.chunks++;
    this.stats.bytes += chunk.byteLength;
    const packet = EncodedPacket.fromEncodedChunk(chunk);
    lane.chain = lane.chain.then(() => lane.source.add(packet, meta)).catch((err) => this.#fail(err, "Mediabunny"));
  }

  #fail(err, where) {
    if (this.#error) return;
    this.#error = err;
    this.stats.error = `${where}: ${err?.name ?? "Error"}: ${err?.message ?? err}`;
    this.#onEvent("error", this.stats.error);
    this.stop();
  }

  async #finish() {
    const wasPaused = this.#state === "paused";
    this.#state = "inactive";
    if (wasPaused) this.stats.pausedMs += (nowUs() - this.#pausedAt) / 1000;
    const stoppedAt = nowUs();
    this.stats.stopMs = Math.round((stoppedAt - this.t0Us) / 1000);
    this.stats.pausedMs = Math.round(this.stats.pausedMs);
    const last = this.#spans.at(-1);
    if (last && last.to == null) last.to = stoppedAt;
    // The tap's last sound up to Stop is still in its next block: wait for it (a block comes every ~100 ms).
    const tapLanes = this.#lanes.filter((l) => l.stats.path === "AudioWorklet tap" && !this.#error);
    await Promise.all(tapLanes.map((l) => new Promise((resolve) => ((l.onBlock = resolve), setTimeout(resolve, 250)))));
    for (const lane of this.#lanes) lane.stop();
    for (const lane of this.#lanes) {
      if (lane.encoder?.state === "configured") await lane.encoder.flush().catch((e) => this.#fail(e, `${lane.kind} flush`));
      await lane.chain;
      lane.encoder?.state !== "closed" && lane.encoder?.close();
      lane.source.close();
      const l = spread(lane.latencies);
      lane.stats.latencyMs = l && { median: round(l.median), p95: round(l.p95), max: round(l.max) };
    }
    let file;
    try {
      await this.#output.finalize();
      this.stats.mimeType = await this.#output.getMimeType().catch(() => this.#output.format.mimeType);
      file = new Blob([this.#output.target.buffer], { type: this.stats.mimeType });
    } catch (err) {
      this.stats.error ??= `Mediabunny finalize(): ${err?.name ?? "Error"}: ${err?.message ?? err}`;
      this.stats.mimeType ||= this.#output.format.mimeType;
      file = new Blob([], { type: this.stats.mimeType });
    }
    this.stats.bytes = file.size;
    this.#onEvent("stop", `${this.stats.chunks} packets, ${file.size.toLocaleString()} bytes`);
    this.#resolveDone(file);
  }
}

// What this browser's encoders take, for the Browser view: each codec at 1280
// × 720, 30 fps, with software and with hardware preferred, and each audio
// codec at 48 kHz stereo. -> { video: { name: { software, hardware } }, audio: { name: bool } }
export async function encoderSupport() {
  if (!hasWebCodecs()) return null;
  const video = {};
  for (const [name, c] of Object.entries(VIDEO_CODECS)) {
    video[name] = { codec: c.codec(1280, 720, 30) };
    for (const hardwareAcceleration of ["prefer-software", "prefer-hardware"]) {
      const config = { codec: c.codec(1280, 720, 30), width: 1280, height: 720, framerate: 30, bitrate: 2_500_000, hardwareAcceleration, ...(name === "avc" ? { avc: { format: "avc" } } : {}) };
      video[name][hardwareAcceleration.slice(7)] = await VideoEncoder.isConfigSupported(config).then((s) => s.supported, () => false);
    }
  }
  const audio = {};
  for (const [name, c] of Object.entries(AUDIO_CODECS)) {
    audio[name] = await AudioEncoder.isConfigSupported({ codec: c.codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000 }).then((s) => s.supported, () => false);
  }
  return { video, audio, trackProcessor: hasTrackProcessor() };
}
