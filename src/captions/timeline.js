// Where captions sit in a take. Everything is counted in AudioContext
// frames, the clock the tap counts on:
//
//   the captions' seconds  ->  context frames   (the feed: firstFrame + seconds × rate)
//   context frames         ->  take time        (the tap: from startFrame, less the pauses)
//   take time              ->  file time        (+ offsetS: where the take starts in the saved file)
//
// Take time is by construction the position in the tap's own recording
// (PcmTap.finish() keeps the same frames), so the only thing measured rather
// than counted is offsetS. No DOM: it runs in Node.

// A take on the context's clock: PcmTap.finish()'s { sampleRate, startFrame,
// endFrame, gaps }, gaps being the [from, to) frames left out while paused.
export class TakeTimeline {
  constructor({ sampleRate, startFrame, endFrame, gaps = [] }) {
    this.rate = sampleRate;
    this.startFrame = startFrame;
    this.endFrame = Math.max(startFrame, endFrame);
    // In order, inside the take, and not overlapping.
    this.gaps = gaps
      .map(([a, b]) => [Math.max(a, this.startFrame), Math.min(b, this.endFrame)])
      .filter(([a, b]) => b > a)
      .sort((x, y) => x[0] - y[0]);
  }

  // Whether the take was recording at this frame.
  recorded(frame) {
    return frame >= this.startFrame && frame < this.endFrame && !this.gaps.some(([a, b]) => frame >= a && frame < b);
  }

  // Seconds into the take at a context frame. A frame before the take is its
  // start, one after it its end, and one inside a pause the moment it paused.
  takeTime(frame) {
    const f = Math.min(Math.max(frame, this.startFrame), this.endFrame);
    let paused = 0;
    for (const [a, b] of this.gaps) paused += Math.max(0, Math.min(f, b) - a);
    return (f - this.startFrame - paused) / this.rate;
  }

  // The take's length in seconds: the tap's recording is exactly this long.
  get duration() {
    return this.takeTime(this.endFrame);
  }

  // Frames paused in all.
  get pausedFrames() {
    return this.gaps.reduce((n, [a, b]) => n + b - a, 0);
  }
}

const round = (s) => Math.round(s * 1000) / 1000;

// Where the take starts in the saved file, in seconds, and how that is known.
// The file's sound is found in the tap's by lining the two up (take-report.js's
// match), which measures it; a take with no such match, or a poor one, is
// estimated instead.
//
// analysis: analyseTake()'s; recorder: the recorder's stats; minScore: the
// waveform match that counts as measured.
// -> { offsetS, offsetFrom: "measured" | "estimated", waveScore, driftS }
export function fileOffset({ analysis, recorder, timeline, minScore = 0.9 }) {
  const audioStart = analysis?.file?.probe?.tracks?.find((t) => t.type === "audio")?.firstTimestamp ?? 0;
  const match = analysis?.match;
  const estimated = estimatedOffset({ recorder, timeline });
  if (match && match.waveScore >= minScore) {
    // lagS is where the tap's sound starts in the decoded audio, and decoding starts at the audio track's first timestamp.
    return { offsetS: round(match.lagS + audioStart), offsetFrom: "measured", estimatedS: estimated, waveScore: match.waveScore, driftS: match.driftS ?? null };
  }
  return { offsetS: estimated, offsetFrom: "estimated", estimatedS: estimated, waveScore: match?.waveScore ?? null, driftS: match?.driftS ?? null };
}

// The offset worked out without listening. The WebCodecs recorder, when its
// audio comes from the tap, stamps each block with its context frame plus one
// constant (stats.offsetS), so the file's time for the take's first frame is
// that sum. Otherwise the recorder and the tap were started together, so 0.
export function estimatedOffset({ recorder, timeline }) {
  const audio = recorder?.webcodecs?.audio;
  if (audio?.path === "AudioWorklet tap" && audio.offsetS != null && timeline) return round(timeline.startFrame / timeline.rate + audio.offsetS);
  return 0;
}

// The take's captions, on the file's timeline. segments: the transcriber's
// final segments ({ id, start, end, transcript, confidence, words?, latency?,
// ms?, cut?, continued? }, in seconds of the audio fed); clock: the feed's ({ rate, firstFrame });
// timeline: the take's; offsetS: from fileOffset(); duration: the file's, to
// clip to. Kept: the segments said while the take was recording (their
// middle is in it). Each is clipped to the take. clipped: true marks one that
// lost something to the take's edges:
// - the speech went on past a cut (its cut flag: the take paused or stopped
//   mid-sentence);
// - it began at a cut with the speech already going (its continued flag:
//   the take started or resumed mid-sentence), so its beginning is outside
//   the take;
// - or clipping moved an end by more than one of the detector's 20 ms frames.
// Words outside the take are dropped. frames is the segment's own range on
// the context's clock, so its time can be worked out again.
export function placeSegments(segments, clock, timeline, { offsetS = 0, duration = Infinity } = {}) {
  const frameAt = (seconds) => clock.firstFrame + Math.round(seconds * clock.rate);
  const fileTime = (frame) => Math.min(duration, Math.max(0, timeline.takeTime(frame) + offsetS));
  const placed = [];
  for (const s of segments) {
    if (!s.transcript) continue;
    const frames = [frameAt(s.start), frameAt(s.end)];
    if (!timeline.recorded(Math.round((frames[0] + frames[1]) / 2))) continue;
    const start = round(fileTime(frames[0]));
    const end = round(fileTime(frames[1]));
    if (end <= start) continue;
    // What the clipping took off, in seconds of speech.
    const kept = end - start;
    const out = { id: s.id, start, end, transcript: s.transcript, confidence: s.confidence, speaker: s.speaker ?? null, frames };
    if (s.cut || s.continued || s.end - s.start - kept > 0.02 + 1e-9) out.clipped = true;
    if (s.words?.length) {
      out.words = s.words
        .filter((w) => timeline.recorded(frameAt((w.start + w.end) / 2)))
        .map((w) => ({ ...w, start: round(fileTime(frameAt(w.start))), end: round(fileTime(frameAt(w.end))) }));
    }
    if (s.latency != null) out.latency = s.latency;
    if (s.ms != null) out.ms = s.ms;
    placed.push(out);
  }
  return placed.sort((a, b) => a.start - b.start);
}

// What the captions cost and how late they came: { segments, words, speechS,
// latencyS: { median, p95, max } | null, rtf } for placed segments. rtf is the
// model's time over the speech's length: under 1 keeps up.
export function captionStats(segments) {
  const latencies = segments.map((s) => s.latency).filter((x) => x != null).sort((a, b) => a - b);
  const at = (q) => latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))];
  const speechS = segments.reduce((sum, s) => sum + (s.end - s.start), 0);
  const modelS = segments.reduce((sum, s) => sum + (s.ms ?? 0), 0) / 1000;
  return {
    segments: segments.length,
    words: segments.reduce((n, s) => n + (s.words?.length ?? s.transcript.split(/\s+/).filter(Boolean).length), 0),
    speechS: round(speechS),
    latencyS: latencies.length ? { median: round(at(0.5)), p95: round(at(0.95)), max: round(latencies.at(-1)) } : null,
    rtf: speechS > 0 && segments.some((s) => s.ms != null) ? Math.round((modelS / speechS) * 100) / 100 : null,
  };
}
