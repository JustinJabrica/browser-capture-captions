// What's inside a recorded file, read with Mediabunny: the container, each
// track's codec, timing and packet counts, and the duration the file
// declares (Chromium's WebM declares none, so players can't seek it). Also
// remuxes such a file into one that does, copies its audio or its video out
// on its own, and reads the test pattern back from decoded video frames.

import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSink,
  Conversion,
  EncodedPacketSink,
  FlacOutputFormat,
  Input,
  MkvOutputFormat,
  Mp3OutputFormat,
  Mp4OutputFormat,
  OggOutputFormat,
  Output,
  WavOutputFormat,
  WebMOutputFormat,
} from "../vendor/mediabunny/mediabunny.mjs";
import { lumaFromRGBA, readPattern } from "./pattern.js";

const open = (blob) => new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
const round = (x, d = 3) => (x == null || !Number.isFinite(x) ? x ?? null : Math.round(x * 10 ** d) / 10 ** d);
const quietly = async (promise) => {
  try {
    return await promise;
  } catch {
    return null;
  }
};

// Resolves to { probe, videoTimestamps } or rejects when the file can't be
// read. probe goes into the take's report; videoTimestamps (seconds, every
// video packet) are for frame timing and aren't kept.
export async function probe(blob) {
  const input = open(blob);
  try {
    const format = await input.getFormat();
    const tracks = await input.getTracks();
    const out = [];
    let videoTimestamps = null;
    for (const track of tracks) {
      const t = {
        type: track.type,
        codec: track.codec,
        codecString: await quietly(track.getCodecParameterString()),
        firstTimestamp: round(await quietly(track.getFirstTimestamp())),
        duration: round(await quietly(track.computeDuration())),
        declaredDuration: round(await quietly(track.getDurationFromMetadata())),
      };
      const stats = await quietly(track.computePacketStats());
      if (stats) Object.assign(t, { packets: stats.packetCount, packetRate: round(stats.averagePacketRate, 2), bitrate: Math.round(stats.averageBitrate) });
      if (track.isVideoTrack()) {
        Object.assign(t, { width: track.displayWidth, height: track.displayHeight, rotation: track.rotation });
        const rate = await quietly(track.computeFrameRateMetrics());
        if (rate) Object.assign(t, { frameRate: round(rate.bestGuessFrameRate, 2), frameRateConstant: rate.frameRateIsConstant });
        // Every packet, for key frames and the gaps between frames.
        const times = [];
        let keys = 0;
        for await (const packet of new EncodedPacketSink(track).packets()) {
          times.push(packet.timestamp);
          if (packet.type === "key") keys++;
        }
        t.keyFrames = keys;
        videoTimestamps ??= times;
      } else if (track.isAudioTrack()) {
        Object.assign(t, { sampleRate: track.sampleRate, channels: track.numberOfChannels });
      }
      out.push(t);
    }
    return {
      probe: {
        container: format.name,
        mimeType: await quietly(input.getMimeType()),
        duration: round(await quietly(input.computeDuration())),
        declaredDuration: round(await quietly(input.getDurationFromMetadata())),
        tracks: out,
      },
      videoTimestamps,
    };
  } finally {
    input.dispose();
  }
}

// A WebM or Matroska file rewritten packet for packet (no re-encoding), so
// that it declares its duration and has an index to seek with. Resolves to
// null when the file isn't Matroska or the copy isn't possible.
export async function remux(blob) {
  const input = open(blob);
  try {
    const format = await input.getFormat();
    if (!/webm|matroska/i.test(format.name)) return null;
    const webm = /webm/i.test(format.name) || blob.type.includes("webm");
    const output = new Output({ format: webm ? new WebMOutputFormat() : new MkvOutputFormat(), target: new BufferTarget() });
    const conversion = await Conversion.init({ input, output, showWarnings: false });
    if (!conversion.isValid) return null;
    await conversion.execute();
    return new Blob([output.target.buffer], { type: blob.type || output.format.mimeType });
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}

const OUTPUTS = { ogg: OggOutputFormat, mp4: Mp4OutputFormat, webm: WebMOutputFormat, mkv: MkvOutputFormat, wav: WavOutputFormat, flac: FlacOutputFormat, mp3: Mp3OutputFormat };
// Each container's file extension and MIME type, for a file of only audio or only video.
const NAMES = {
  audio: { ogg: ["ogg", "audio/ogg"], mp4: ["m4a", "audio/mp4"], webm: ["weba", "audio/webm"], mkv: ["mka", "audio/x-matroska"], wav: ["wav", "audio/wav"], flac: ["flac", "audio/flac"], mp3: ["mp3", "audio/mpeg"] },
  video: { mp4: ["mp4", "video/mp4"], webm: ["webm", "video/webm"], mkv: ["mkv", "video/x-matroska"] },
};

// The containers that one track of a recording ("audio" or "video", with
// Mediabunny's codec name) could be copied into on its own, best first, as
// [container, extension, MIME type]. Audio goes in its codec's usual file
// (Opus and Vorbis in Ogg, AAC in .m4a, PCM in WAV), video in the
// recording's own kind of container; Matroska is the fallback, since it
// holds almost any codec. Whether one really holds the codec is checked
// when copying.
export function soloTargets(kind, codec, container = "") {
  const family = /webm/i.test(container) ? "webm" : /matroska/i.test(container) ? "mkv" : /mp4|quicktime/i.test(container) ? "mp4" : null;
  const own =
    kind === "video"
      ? family
      : /^(opus|vorbis)$/.test(codec)
        ? "ogg"
        : codec === "aac"
          ? "mp4"
          : /^(pcm-|ulaw$|alaw$)/.test(codec)
            ? "wav"
            : ["flac", "mp3"].includes(codec)
              ? codec
              : family;
  return [...new Set([own, family, "mkv"])].filter((c) => c && NAMES[kind][c]).map((c) => [c, ...NAMES[kind][c]]);
}

// A recording's audio or its video ("audio" or "video") on its own: the
// first track of that kind, its packets copied as they are (no re-encoding)
// into the first of soloTargets() that holds its codec. The copy keeps the
// recording's timeline, so it starts where it did in the recording. Resolves
// to { blob, ext, container }, or null when the file has no such track or no
// container takes its codec as it is.
export async function extractTrack(blob, kind) {
  const input = open(blob);
  try {
    const format = await input.getFormat();
    const tracks = await input.getTracks();
    const track = tracks.find((t) => t.type === kind);
    if (!track) return null;
    const starts = (await Promise.all(tracks.map((t) => quietly(t.getFirstTimestamp())))).filter(Number.isFinite);
    const start = Math.max(0, starts.length ? Math.min(...starts) : 0);
    const keep = (t) => (t === track ? {} : { discard: true });
    for (const [name, ext, type] of soloTargets(kind, track.codec, format.name)) {
      const target = new OUTPUTS[name]();
      if (!target.getSupportedCodecs().includes(track.codec)) continue;
      const output = new Output({ format: target, target: new BufferTarget() });
      // Forced copying discards a track rather than re-encode it.
      const conversion = await Conversion.init({ input, output, video: keep, audio: keep, copy: { mode: "forced" }, trim: { start }, showWarnings: false });
      if (!conversion.isValid || !conversion.utilizedTracks.includes(track)) continue;
      await conversion.execute();
      return { blob: new Blob([output.target.buffer], { type }), ext, container: name };
    }
    return null;
  } finally {
    input.dispose();
  }
}

// Reads the test pattern from every decoded frame: [{ t, code, flash }], with
// t in seconds. Resolves to null when this browser can't decode the video
// (WebCodecs is missing, or doesn't have the codec).
export async function readFrames(blob, { width = 320, height = 180, onProgress } = {}) {
  const input = open(blob);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return null;
    const duration = await quietly(track.computeDuration());
    const frames = [];
    for await (const { canvas, timestamp } of new CanvasSink(track, { width, height, fit: "fill", poolSize: 1 }).canvases()) {
      const pixels = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, width, height).data;
      frames.push({ t: timestamp, ...readPattern(lumaFromRGBA(pixels, width, height), width, height) });
      if (duration && frames.length % 30 === 0) onProgress?.(Math.min(1, timestamp / duration));
    }
    return frames;
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}
