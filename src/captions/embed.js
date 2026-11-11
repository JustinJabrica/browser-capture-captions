// Writes a take's subtitles into its recording, as a track of the file
// itself: one file that carries the picture, the sound and the captions,
// which a player can show or hide.
//
// The recording isn't re-encoded. Mediabunny copies every packet of every
// track into a new file of the same kind and adds one more track, WebVTT,
// which is the only subtitle format it writes: as S_TEXT/WEBVTT in WebM and
// Matroska, and as wvtt in MP4. A recording in a container that can't hold
// a subtitle track (Ogg, which Firefox writes for sound alone) is copied
// into WebM instead.
//
// Mediabunny can write subtitle tracks but not read them back, so:
// - what comes out is checked by its bytes and by the tracks it can read;
// - copying a file that already has a subtitle track would drop it, so the
//   subtitles are always written into the take's original recording.

import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, MkvOutputFormat, Mp4OutputFormat, Output, TextSubtitleSource, WebMOutputFormat } from "../../vendor/mediabunny/mediabunny.mjs";

const TARGETS = {
  webm: { format: () => new WebMOutputFormat(), ext: "webm", video: "video/webm", audio: "audio/webm", marker: "S_TEXT/WEBVTT" },
  mkv: { format: () => new MkvOutputFormat(), ext: "mkv", video: "video/x-matroska", audio: "audio/x-matroska", marker: "S_TEXT/WEBVTT" },
  mp4: { format: () => new Mp4OutputFormat({ fastStart: "in-memory" }), ext: "mp4", video: "video/mp4", audio: "audio/mp4", marker: "wvtt" },
};

// The container a recording's subtitled copy is written as, by the
// recording's own (Mediabunny's name for it): its own kind where that can
// hold subtitles, WebM for Ogg, Matroska for anything else.
export function embedTarget(container = "") {
  if (/webm/i.test(container)) return "webm";
  if (/matroska/i.test(container)) return "mkv";
  if (/mp4|quicktime|mov/i.test(container)) return "mp4";
  if (/ogg/i.test(container)) return "webm";
  return "mkv";
}

// blob: the recording; vtt: a WebVTT file's text (subtitles.js's asVtt()).
// Resolves to { blob, container, ext, marker, tracks: [{ type, codec }] }: the
// copy with its subtitle track, and the tracks that were copied into it.
// Rejects when a track can't be copied as it is into the target container.
export async function embedSubtitles(blob, vtt, { language = "eng", name = "Captions" } = {}) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
  try {
    const key = embedTarget((await input.getFormat()).name);
    const target = TARGETS[key];
    const output = new Output({ format: target.format(), target: new BufferTarget() });
    // Composable: the conversion only adds the recording's tracks and feeds their packets;
    // starting and finishing the file stay here, so a track of our own can go in beside them.
    const conversion = await Conversion.init({ input, output, composable: true, copy: { mode: "forced" }, trim: { start: 0 }, showWarnings: false });
    const tracks = conversion.utilizedTracks.map((t) => ({ type: t.type, codec: t.codec }));
    if (!tracks.length || conversion.discardedTracks.length) {
      const lost = conversion.discardedTracks.map((d) => `${d.track.type} (${d.track.codec ?? "?"}): ${d.reason}`).join("; ");
      throw new Error(`${target.ext.toUpperCase()} can't take this recording's tracks as they are${lost ? `: ${lost}` : ""}`);
    }
    const subtitles = new TextSubtitleSource("webvtt");
    output.addSubtitleTrack(subtitles, { languageCode: language, name });
    // A composable conversion leaves the tags to its owner.
    output.setMetadataTags(await input.getMetadataTags().catch(() => ({})));
    await output.start();
    // All the cues at once, then closed, so the muxer never waits on this track for more.
    await subtitles.add(vtt);
    subtitles.close();
    await conversion.execute();
    await output.finalize();
    const video = tracks.some((t) => t.type === "video");
    return { blob: new Blob([output.target.buffer], { type: video ? target.video : target.audio }), container: key, ext: target.ext, marker: target.marker, tracks };
  } finally {
    input.dispose();
  }
}

// Whether a file's bytes hold a subtitle track's codec id, as embedSubtitles()
// writes it (the result's marker). A check on the output, since Mediabunny
// can't read the track back.
export async function hasMarker(blob, marker) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const want = new TextEncoder().encode(marker);
  outer: for (let i = 0; i + want.length <= bytes.length; i++) {
    for (let j = 0; j < want.length; j++) if (bytes[i + j] !== want[j]) continue outer;
    return true;
  }
  return false;
}
