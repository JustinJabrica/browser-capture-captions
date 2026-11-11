// Burns a take's subtitles into its picture: a copy of the recording whose
// video frames have the captions drawn on them, for players and sites that
// show no subtitle track at all. Unlike a track, they can't be turned off,
// and the picture is encoded again, so it is made only when asked for.
//
// Two ways, with the same drawing (caption-draw.js):
//
// - burnIn(): with WebCodecs, through Mediabunny. Each frame is decoded, drawn
//   on with whichever cue is on screen at the frame's own timestamp, and
//   encoded into a file of the recording's kind, in the recording's own
//   codec where this browser encodes it. The sound's packets are copied as
//   they are. It runs as fast as the machine decodes and encodes, and every
//   frame keeps its timestamp.
// - burnInRealtime(): without. The recording is played in a <video>, each
//   frame is drawn to a canvas with its caption, and the canvas and the
//   element's sound are recorded with MediaRecorder (then rewritten so the
//   copy can be seeked). It takes as long as the recording lasts, encodes the
//   sound again, and keeps the frames it manages to draw: for a browser with
//   no VideoEncoder, and for comparing the two.

import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  MkvOutputFormat,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  VideoSample,
  VideoSampleSink,
  VideoSampleSource,
  WebMOutputFormat,
  canEncodeVideo,
  getFirstEncodableVideoCodec,
} from "../../vendor/mediabunny/mediabunny.mjs";
import { elementStream } from "../audio.js";
import { remux } from "../container.js";
import { TakeRecorder, chooseType, extensionFor } from "../recorder.js";
import { CAPTION_STYLE, drawCaption } from "./caption-draw.js";
import { embedTarget } from "./embed.js";
import { cueAt } from "./subtitles.js";

const TARGETS = {
  webm: { format: () => new WebMOutputFormat(), ext: "webm", type: "video/webm" },
  mkv: { format: () => new MkvOutputFormat(), ext: "mkv", type: "video/x-matroska" },
  mp4: { format: () => new Mp4OutputFormat({ fastStart: "in-memory" }), ext: "mp4", type: "video/mp4" },
};

// Whether this browser can decode and encode video itself.
export const canBurnIn = () => typeof globalThis.VideoEncoder === "function" && typeof globalThis.VideoDecoder === "function";

const abortError = () => new DOMException("Burning the captions in was cancelled", "AbortError");

// blob: the recording; cues: toCues()'s. onProgress(share 0..1); signal: an
// AbortSignal that cancels it. Resolves to { blob, ext, container, method:
// "webcodecs", width, height, frames, captioned (frames drawn on), videoCodec,
// sourceCodec }. Rejects when the recording has no picture, or this browser
// can't decode it or encode a codec the container holds.
//
// The picture goes through a loop of its own (decode a frame, draw, encode)
// rather than Mediabunny's conversion, which skips a frame whose duration is
// 0: MediaRecorder's WebM stores no duration for the last frame of each
// cluster, so one frame a second would be lost. The sound, and any other
// track, is copied by a conversion that leaves the picture out.
export async function burnIn(blob, cues, { onProgress = () => {}, signal, style = CAPTION_STYLE } = {}) {
  if (signal?.aborted) throw abortError();
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("This recording has no picture to draw captions on");
    if (!(await track.canDecode())) throw new Error(`This browser can't decode the recording's picture (${track.codec ?? "an unknown codec"})`);
    const [width, height] = [await track.getDisplayWidth(), await track.getDisplayHeight()];
    const key = embedTarget((await input.getFormat()).name);
    const target = TARGETS[key];
    const format = target.format();
    // The take's own codec where this browser encodes it, else the first the container holds that it does.
    const holds = format.getSupportedVideoCodecs();
    const videoCodec = (holds.includes(track.codec) && (await canEncodeVideo(track.codec, { width, height })) ? track.codec : null) ?? (await getFirstEncodableVideoCodec(holds, { width, height }));
    if (!videoCodec) throw new Error(`This browser encodes none of the video codecs ${target.ext.toUpperCase()} holds`);

    const output = new Output({ format, target: new BufferTarget() });
    const picture = new VideoSampleSource({ codec: videoCodec, bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
    output.addVideoTrack(picture, { frameRate: undefined });
    // Everything but the picture, packet for packet, from 0 so it keeps the recording's times.
    const rest = await Conversion.init({ input, output, composable: true, video: { discard: true }, copy: { mode: "forced" }, trim: { start: 0 }, showWarnings: false });
    output.setMetadataTags(await input.getMetadataTags().catch(() => ({})));
    await output.start();

    const canvas = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(width, height) : Object.assign(document.createElement("canvas"), { width, height });
    const ctx = canvas.getContext("2d");
    const duration = await track.computeDuration();
    let frames = 0;
    let captioned = 0;
    const drawAll = async () => {
      for await (const sample of new VideoSampleSink(track).samples()) {
        try {
          if (signal?.aborted) throw abortError();
          ctx.clearRect(0, 0, width, height);
          sample.draw(ctx, 0, 0, width, height);
          frames++;
          if (drawCaption(ctx, cueAt(cues, sample.timestamp), width, height, style)) captioned++;
          // The canvas is read here, so one canvas serves every frame; the frame keeps its own time.
          const drawn = new VideoSample(canvas, { timestamp: sample.timestamp, duration: sample.duration });
          try {
            await picture.add(drawn);
          } finally {
            drawn.close();
          }
          if (duration > 0) onProgress(Math.min(1, sample.timestamp / duration));
        } finally {
          sample.close();
        }
      }
      picture.close();
    };
    try {
      await Promise.all([drawAll(), rest.execute()]);
      await output.finalize();
    } catch (err) {
      await output.cancel().catch(() => {});
      throw signal?.aborted ? abortError() : err;
    }
    onProgress(1);
    return { blob: new Blob([output.target.buffer], { type: target.type }), ext: target.ext, container: key, method: "webcodecs", width, height, frames, captioned, videoCodec, sourceCodec: track.codec };
  } finally {
    input.dispose();
  }
}

// The same, by playing the recording and recording a canvas: see the top of
// this file. mimeType: a MediaRecorder type to ask for ("" for the
// browser's choice). Resolves to { blob, ext, method: "realtime", width,
// height, frames, captioned, mimeType }.
export async function burnInRealtime(blob, cues, { onProgress = () => {}, signal, style = CAPTION_STYLE, mimeType = "" } = {}) {
  if (signal?.aborted) throw abortError();
  const url = URL.createObjectURL(blob);
  // Played silently, by its volume and not by muting: a muted element's captured stream may carry no sound.
  const video = Object.assign(document.createElement("video"), { src: url, playsInline: true, preload: "auto", volume: 0 });
  let recorder = null;
  let capture = null;
  let drawing = false;
  let timer = 0;
  try {
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = () => reject(new Error(`This browser can't play the recording to draw on it: ${video.error?.message ?? "unknown error"}`));
    });
    const [width, height] = [video.videoWidth, video.videoHeight];
    if (!width || !height) throw new Error("This recording has no picture to draw captions on");
    const canvas = Object.assign(document.createElement("canvas"), { width, height });
    const ctx = canvas.getContext("2d");
    let frames = 0;
    let captioned = 0;
    const draw = () => {
      ctx.drawImage(video, 0, 0, width, height);
      if (!drawing) return;
      frames++;
      if (drawCaption(ctx, cueAt(cues, video.currentTime), width, height, style)) captioned++;
      if (Number.isFinite(video.duration) && video.duration > 0) onProgress(Math.min(1, video.currentTime / video.duration));
    };

    // The element's sound, as a stream. Some browsers only add its tracks once it plays, so it
    // is played until they arrive (or 1 s), then put back at the start for the recording.
    capture = elementStream(video);
    const arrived = new Promise((resolve) => {
      const check = () => capture.stream.getAudioTracks().length && resolve();
      capture.stream.addEventListener("addtrack", check);
      setTimeout(resolve, 1000);
      check();
    });
    await video.play();
    await arrived;
    video.pause();
    await new Promise((resolve) => {
      video.onseeked = resolve;
      video.currentTime = 0;
    });
    if (signal?.aborted) throw abortError();

    const stream = canvas.captureStream();
    for (const t of capture.stream.getAudioTracks()) stream.addTrack(t);
    draw(); // the first frame, in the canvas before the recorder starts
    recorder = new TakeRecorder(stream, { mimeType: chooseType(mimeType, { hasVideo: true }) || undefined });
    // A frame of the canvas for each frame the element shows, where the browser says when that is.
    drawing = true;
    if (video.requestVideoFrameCallback) {
      const next = () => {
        if (!drawing) return;
        draw();
        video.requestVideoFrameCallback(next);
      };
      video.requestVideoFrameCallback(next);
    } else {
      timer = setInterval(draw, 1000 / 30);
    }
    const ended = new Promise((resolve, reject) => {
      video.onended = resolve;
      video.onerror = () => reject(new Error(video.error?.message ?? "the recording stopped playing"));
      signal?.addEventListener("abort", () => reject(abortError()), { once: true });
    });
    await video.play();
    await ended;
    drawing = false;
    const recorded = await recorder.stop();
    recorder = null;
    onProgress(1);
    const type = recorded.type || mimeType;
    // MediaRecorder's WebM declares no duration and has no index: rewritten, packet for packet, so the copy can be seeked.
    const out = (await remux(recorded)) ?? recorded;
    return { blob: out, ext: extensionFor(type), method: "realtime", width, height, frames, captioned, mimeType: type };
  } finally {
    drawing = false;
    clearInterval(timer);
    video.pause();
    if (recorder) await recorder.stop().catch(() => {});
    capture?.stop();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
