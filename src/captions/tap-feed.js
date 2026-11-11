// Feeds the speech engine from the bench's PCM tap (src/audio.js), so
// captions hear exactly the audio the take's tap keeps, on the same clock.
//
// The tap's blocks arrive at the AudioContext's own rate, one Float32Array a
// channel, each with the context frame it starts at. The feed mixes them
// down to mono, resamples to the 16 kHz the engine takes, and remembers the
// frame of the first sample it fed. The engine counts its segment times in
// seconds from that first sample, so
//
//   context frame = firstFrame + seconds × rate
//
// places any caption on the tap's clock, which is also the clock the take's
// start, pauses and end are counted on. The sum only holds while no audio
// goes missing, so frames lost between blocks are fed as silence (and
// counted), and a block that overlaps what was already fed is trimmed.
//
// at(frame, fn) calls fn when the audio fed reaches a context frame, with
// exactly the audio before that frame fed and none after it: that is how an
// utterance is cut at a take's start, pauses and end.

import { Resampler, SAMPLE_RATE } from "../speech/audio.js";

// The feed without the tap: push() takes the tap's blocks ({ frame, channels }).
// No DOM, so it runs in Node.
export class FeedClock {
  firstFrame = null; // the context frame of the first sample fed
  fed = 0; // input frames fed so far, silence for lost frames included
  lostFrames = 0;
  #resampler;
  #onAudio;
  #marks = []; // [{ frame, fn }] still to come, earliest first

  constructor(rate, onAudio) {
    this.rate = rate;
    this.#resampler = new Resampler(rate, SAMPLE_RATE);
    this.#onAudio = onAudio;
  }

  push({ frame, channels }) {
    const length = channels[0]?.length ?? 0;
    if (!length) return;
    this.firstFrame ??= frame;
    const expected = this.firstFrame + this.fed;
    let skip = 0;
    if (frame > expected) {
      this.lostFrames += frame - expected;
      this.#feed(new Float32Array(frame - expected));
    } else if (frame < expected) {
      skip = Math.min(length, expected - frame);
    }
    if (skip < length) this.#feed(mixDown(channels, skip));
  }

  // Feeds mono, stopping at each mark on the way to call it.
  #feed(mono) {
    let from = 0;
    while (this.#marks.length) {
      const at = this.#marks[0].frame - (this.firstFrame + this.fed);
      if (at > mono.length - from) break;
      if (at > 0) this.#resample(mono.subarray(from, from + at));
      from += Math.max(0, at);
      this.#marks.shift().fn();
    }
    if (from < mono.length) this.#resample(from ? mono.subarray(from) : mono);
  }

  #resample(mono) {
    this.fed += mono.length;
    const out = this.#resampler.process(mono);
    if (out.length) this.#onAudio(out);
  }

  // Calls fn once the audio fed reaches context frame `frame`: at once if it
  // already has, or if nothing has been fed yet. Returns a function that
  // calls it now instead, if it hasn't been called (for a clock that stopped).
  at(frame, fn) {
    if (this.firstFrame == null || frame <= this.firstFrame + this.fed) {
      fn();
      return () => {};
    }
    const mark = { frame, fn };
    const i = this.#marks.findIndex((m) => m.frame > frame);
    this.#marks.splice(i < 0 ? this.#marks.length : i, 0, mark);
    return () => {
      const at = this.#marks.indexOf(mark);
      if (at < 0) return;
      this.#marks.splice(at, 1);
      fn();
    };
  }

  // The context frame playing at `seconds` of the audio fed, or null before any was.
  frameAt(seconds) {
    return this.firstFrame == null ? null : this.firstFrame + Math.round(seconds * this.rate);
  }

  // The other way: seconds of the audio fed at a context frame.
  secondsAt(frame) {
    return this.firstFrame == null ? null : (frame - this.firstFrame) / this.rate;
  }
}

// The channels' mean, from sample `from` on.
function mixDown(channels, from = 0) {
  if (channels.length === 1) return from ? channels[0].subarray(from) : channels[0];
  const out = new Float32Array(channels[0].length - from);
  for (const channel of channels) for (let i = 0; i < out.length; i++) out[i] += channel[from + i];
  for (let i = 0; i < out.length; i++) out[i] /= channels.length;
  return out;
}

// A feed for Transcriber.start(), from an open PcmTap. clock is the
// FeedClock of the run in progress (null before the first).
export function createTapFeed(tap) {
  const feed = {
    clock: null,
    open({ onAudio }) {
      const clock = new FeedClock(tap.sampleRate, onAudio);
      feed.clock = clock;
      const unlisten = tap.listen((block) => clock.push(block));
      return { stop: unlisten };
    },
  };
  return feed;
}
