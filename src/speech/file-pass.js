// Transcribing a finished recording, start to end: where the speech is (a
// voice activity detector over the whole of it), which stretches to give the
// model at a time, and what was said in each. The browser and Node run this
// same code; they differ only in how they reach the detector and the model,
// which they pass in as speech() and transcribe().
//
// It comes from automatic-speech-recognition-and-diarization's whole-file
// pipeline, without the speakers: there, a diarizer's turns decided the
// parts; here, the detector's stretches of speech do.

import { SAMPLE_RATE } from "./audio.js";
import { cleanTranscript, isDegenerate } from "./core.js";

export const FILE_PASS_DEFAULTS = {
  // Stretches of speech this close together are one utterance, as live: the pause that ends one.
  mergeGap: 0.8,
  // Whisper hears 30 s at a time and drops the rest unsaid, so no part is longer than this.
  maxPart: 25,
  // Sound kept either side of a part for the model to hear (a soft first or last sound), where there is room.
  pad: 0.3,
  // And how much of that lead-in and tail the segment's own times keep.
  lead: 0.1,
  punctuation: true,
};

// The parts to transcribe, from the detector's speech regions ([[start, end]]
// in seconds, in order): [{ start, end, from, to }]. start..end is the
// utterance as reported (the speech, with a little lead-in and tail);
// from..to is what the model is given (more room either side, never into the
// next part). Regions closer than mergeGap join, up to maxPart; one longer
// than maxPart is cut into equal pieces.
export function planSpeechParts(regions, { duration = Infinity, mergeGap = FILE_PASS_DEFAULTS.mergeGap, maxPart = FILE_PASS_DEFAULTS.maxPart, pad = FILE_PASS_DEFAULTS.pad, lead = FILE_PASS_DEFAULTS.lead } = {}) {
  const joined = [];
  for (const [start, end] of regions) {
    const last = joined.at(-1);
    if (last && start - last[1] <= mergeGap && end - last[0] <= maxPart) last[1] = Math.max(last[1], end);
    else joined.push([start, end]);
  }
  const pieces = joined.flatMap(([start, end]) => {
    const count = Math.ceil((end - start) / maxPart);
    if (!(count > 1)) return [[start, end]];
    const length = (end - start) / count;
    return Array.from({ length: count }, (_, i) => [start + length * i, start + length * (i + 1)]);
  });
  const round = (t) => Math.round(t * 1000) / 1000;
  return pieces.map(([start, end], i) => {
    // Up to half the gap to each neighbour, so parts never overlap.
    const lo = i ? (pieces[i - 1][1] + start) / 2 : 0;
    const hi = i < pieces.length - 1 ? (end + pieces[i + 1][0]) / 2 : duration;
    return { start: round(Math.max(lo, start - lead)), end: round(Math.min(hi, end + lead)), from: round(Math.max(lo, start - pad)), to: round(Math.min(hi, end + pad)) };
  });
}

// Runs the whole pass. io: { speech() (resolves to speech regions, [[start,
// end]] in seconds), transcribe(startSample, endSample, part) (resolves to
// { text, confidence, words?, ms } or null), check() (throws to stop),
// onProgress({ phase: "speech" | "transcribing", done, total }),
// onSegment(segment) }. settings: FILE_PASS_DEFAULTS.
// Resolves to { speech, parts, segments, dropped }: segments are the kept
// ones, in order, { id, start, end, transcript, confidence, speaker: null,
// words?, ms }, in seconds of the recording's audio; dropped counts the parts
// whose text was nothing, Whisper's inventions on noise, or a loop.
export async function runFilePass({ duration }, io, settings = {}) {
  const s = { ...FILE_PASS_DEFAULTS, ...settings };
  const { check, onProgress, onSegment } = io;
  onProgress?.({ phase: "speech", done: 0, total: 1 });
  const speech = (await io.speech()) ?? [];
  check?.();
  onProgress?.({ phase: "speech", done: 1, total: 1 });
  const parts = planSpeechParts(speech, { ...s, duration });
  const segments = [];
  let dropped = 0;
  const round = (t) => Math.round(t * 1000) / 1000;
  for (const [i, part] of parts.entries()) {
    const r = await io.transcribe(Math.round(part.from * SAMPLE_RATE), Math.round(part.to * SAMPLE_RATE), part);
    check?.();
    onProgress?.({ phase: "transcribing", done: i + 1, total: parts.length });
    let transcript = r ? cleanTranscript(r.text, r.confidence, s) : "";
    if (transcript && isDegenerate(transcript)) transcript = ""; // Whisper's loops on music and noise
    if (!transcript) {
      dropped++;
      continue;
    }
    const segment = { id: segments.length + 1, start: part.start, end: part.end, transcript, confidence: r.confidence, speaker: null };
    // Word times, when the engine gives them, are moved from the clip to the recording, and kept inside the segment.
    if (r.words?.length) {
      segment.words = r.words.map((w) => ({ ...w, start: round(Math.min(Math.max(w.start + part.from, part.start), part.end)), end: round(Math.min(Math.max(w.end + part.from, part.start), part.end)) }));
    }
    if (r.ms != null) segment.ms = r.ms;
    segments.push(segment);
    onSegment?.(segment);
  }
  return { speech, parts, segments, dropped };
}
