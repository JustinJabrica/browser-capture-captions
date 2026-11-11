// Web Audio for the bench: one shared AudioContext, the PCM tap (lossless
// audio straight from the stream, beside the recorder), decoding a recorded
// file, resampling, and capturing what a media element plays.

// One AudioContext shared by all taps. Firefox takes up to a second to start
// the first AudioContext on a page (and audio played in that time is lost),
// and Chrome and Safari only let one start during a user gesture, so it is
// created or resumed on every click, key press and open(), and kept for a
// while after the last tap closes. It runs at the device's own rate, so the
// tap keeps the audio exactly as delivered (and Firefox before 148 couldn't
// connect a stream to a context at a different rate).
export const audioGraph = {
  context: null,
  moduleReady: null,
  users: 0,
  idleTimer: null,

  open() {
    if (!this.context || this.context.state === "closed") {
      this.context = new AudioContext();
      this.moduleReady = this.context.audioWorklet.addModule(new URL("tap-processor.js", import.meta.url));
      this.moduleReady.catch(() => {});
    }
    // Not awaited: without a user gesture, resume() can stay pending forever.
    if (this.context.state === "suspended") this.context.resume().catch(() => {});
    return this.context;
  },

  async acquire() {
    clearTimeout(this.idleTimer);
    const context = this.open();
    try {
      await this.moduleReady;
    } catch (err) {
      this.context = null;
      context.close().catch(() => {});
      throw err;
    }
    this.users++;
    return context;
  },

  release() {
    this.users = Math.max(0, this.users - 1);
    if (!this.users) this.scheduleClose();
  },

  warm() {
    try {
      this.open();
      if (!this.users) this.scheduleClose();
    } catch {
      // No Web Audio; taps will fail when opened.
    }
  },

  scheduleClose() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.users) return;
      this.context?.close().catch(() => {});
      this.context = null;
    }, 30000);
  },
};

let warmListening = false;
export function warmOnGestures() {
  if (warmListening) return;
  warmListening = true;
  const warm = () => audioGraph.warm();
  addEventListener("pointerdown", warm, true);
  addEventListener("keydown", warm, true);
}

// --- The tap ---------------------------------------------------------------------

// Taps a stream's audio tracks. Blocks arrive about every 100 ms and feed
// onLevels ({ peaks, rms } per channel) the whole time; between record() and
// finish() they are also kept, except between pause() and resume(), as the
// recorder does. Frames are counted on the context's clock, so the take
// starts at the frame playing when record() is called.
export class PcmTap {
  #context = null;
  #source = null;
  #node = null;
  #sink = null;
  #blocks = null;
  #from = 0;
  #gaps = []; // [from, to) frame ranges left out while paused
  #pausedAt = null;
  #flushed = null;
  #onLevels = null;
  #listeners = new Set();
  #flowing = null;
  // Resolves when the first audio arrives. Firefox can take most of a second
  // to start its first AudioContext, so a take begun before then would have a
  // short tap; the bench waits for this before it starts the recorder.
  ready = new Promise((resolve) => (this.#flowing = resolve));

  static async open(stream, { onLevels } = {}) {
    const tap = new PcmTap();
    tap.#onLevels = onLevels;
    const context = await audioGraph.acquire();
    tap.#context = context;
    try {
      tap.#source = context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
      tap.#node = new AudioWorkletNode(context, "pcm-tap");
      // A node is only processed while something pulls on its output; a silent gain does.
      tap.#sink = context.createGain();
      tap.#sink.gain.value = 0;
      tap.#source.connect(tap.#node).connect(tap.#sink).connect(context.destination);
      tap.#node.port.onmessage = ({ data }) => tap.#block(data);
    } catch (err) {
      tap.close();
      throw err;
    }
    return tap;
  }

  get sampleRate() {
    return this.#context.sampleRate;
  }

  get contextState() {
    return this.#context?.state ?? "closed";
  }

  #block(block) {
    if (block.channels.length) this.#flowing();
    if (block.channels.length && this.#onLevels) {
      const peaks = [];
      const rms = [];
      for (const channel of block.channels) {
        let peak = 0;
        let sum = 0;
        for (const x of channel) {
          const a = Math.abs(x);
          if (a > peak) peak = a;
          sum += x * x;
        }
        peaks.push(peak);
        rms.push(Math.sqrt(sum / (channel.length || 1)));
      }
      this.#onLevels({ peaks, rms });
    }
    if (block.channels.length) for (const listener of this.#listeners) listener(block, this.#context.sampleRate);
    this.#blocks?.push(block);
    if (block.flushed) this.#flushed?.();
  }

  #now() {
    return Math.round(this.#context.currentTime * this.#context.sampleRate);
  }

  record() {
    this.#blocks = [];
    this.#gaps = [];
    this.#pausedAt = null;
    this.#from = this.#now();
  }

  pause() {
    if (this.recording && this.#pausedAt == null) this.#pausedAt = this.#now();
  }

  resume() {
    if (this.#pausedAt == null) return;
    this.#gaps.push([this.#pausedAt, this.#now()]);
    this.#pausedAt = null;
  }

  get recording() {
    return this.#blocks !== null;
  }

  // Calls fn(block, sampleRate) with every block of audio as it arrives
  // ({ frame, channels }: the context frame it starts at, and a Float32Array
  // per channel), whether or not a take is recording. -> a function that stops it.
  // The WebCodecs recorder takes its audio from here where the browser has no
  // MediaStreamTrackProcessor.
  listen(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  // Ends the take: { sampleRate, channels, frames, startFrame, lostFrames,
  // emptyFrames }. lostFrames counts frames that never arrived between blocks.
  async finish() {
    const to = this.#now();
    if (this.#pausedAt != null) this.#gaps.push([this.#pausedAt, to]);
    this.#pausedAt = null;
    const flushed = new Promise((resolve) => {
      this.#flushed = resolve;
      setTimeout(resolve, 500); // a suspended context never answers
    });
    this.#node?.port.postMessage("flush");
    await flushed;
    this.#flushed = null;
    const blocks = (this.#blocks ?? []).filter((b) => b.channels.length);
    this.#blocks = null;
    const count = Math.max(0, ...blocks.map((b) => b.channels.length));
    const take = { sampleRate: this.#context.sampleRate, channels: [], frames: 0, startFrame: this.#from, lostFrames: 0, emptyFrames: 0 };
    if (!count) return take;
    // Only the frames from record() to finish(), less the pauses: blocks are trimmed to fit.
    const pieces = [];
    let expected = null;
    for (const b of blocks) {
      const length = b.channels[0].length;
      const start = Math.max(b.frame, this.#from);
      const end = Math.min(b.frame + length, to);
      if (end <= start) continue;
      if (expected != null && b.frame > expected) take.lostFrames += b.frame - expected;
      expected = b.frame + length;
      take.emptyFrames += b.empty;
      for (const [s, e] of without(start, end, this.#gaps)) pieces.push(b.channels.map((c) => c.subarray(s - b.frame, e - b.frame)));
    }
    take.frames = pieces.reduce((n, p) => n + p[0].length, 0);
    for (let c = 0; c < count; c++) {
      const out = new Float32Array(take.frames);
      let offset = 0;
      for (const p of pieces) {
        out.set(p[c] ?? p[0], offset);
        offset += p[0].length;
      }
      take.channels.push(out);
    }
    return take;
  }

  // Safe to call twice.
  close() {
    this.#node?.port.postMessage("stop");
    if (this.#node) this.#node.port.onmessage = null;
    this.#source?.disconnect();
    this.#node?.disconnect();
    this.#sink?.disconnect();
    if (this.#context) audioGraph.release();
    this.#context = this.#source = this.#node = this.#sink = null;
    this.#blocks = null;
    this.#listeners.clear();
  }
}

// [start, end) less every [from, to) gap, as a list of ranges.
export function without(start, end, gaps) {
  let ranges = [[start, end]];
  for (const [from, to] of gaps) {
    ranges = ranges.flatMap(([s, e]) => (to <= s || from >= e ? [[s, e]] : [from > s && [s, from], to < e && [to, e]].filter(Boolean)));
  }
  return ranges;
}

// --- Decoding and resampling --------------------------------------------------------------

// Decodes a recorded file's audio at sampleRate (an OfflineAudioContext
// resamples to its own rate while decoding), keeping its channels. Resolves
// to null when the file has no audio the browser can decode.
export async function decodeAudio(blob, sampleRate) {
  try {
    const data = await blob.arrayBuffer();
    return await new OfflineAudioContext(1, 1, sampleRate).decodeAudioData(data);
  } catch {
    return null;
  }
}

export const channelsOf = (buffer) => Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));

// Converts PCM to another rate, and to mono when asked, by rendering it
// through an OfflineAudioContext (the browser's own resampler and down-mix).
export async function resample(channels, fromRate, toRate, { mono = false } = {}) {
  const frames = channels[0]?.length ?? 0;
  if (!frames) return channels.map(() => new Float32Array(0)).slice(0, mono ? 1 : undefined);
  const outChannels = mono ? 1 : channels.length;
  const length = Math.max(1, Math.round((frames * toRate) / fromRate));
  const context = new OfflineAudioContext(outChannels, length, toRate);
  const buffer = context.createBuffer(channels.length, frames, fromRate);
  channels.forEach((c, i) => buffer.copyToChannel(c, i));
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
  return channelsOf(await context.startRendering());
}

// --- Capturing a media element -------------------------------------------------------------

// Safari has no captureStream(): its audio goes through this context, which is
// never closed, because once an element feeds createMediaElementSource() it
// only plays through that context (so the context also feeds the speakers).
let elementContext = null;
const elementSources = new WeakMap();

// A stream of what a media element plays, and how it was made. Chromium has
// captureStream(); Firefox has mozCaptureStream() (and captureStream() in
// versions that ship it unprefixed).
// Safari has neither, so its audio comes through Web Audio and its video is
// drawn onto a canvas every frame and captured from there.
export function elementStream(media) {
  if (media.captureStream) return { stream: media.captureStream(), method: "captureStream()", stop() {} };
  if (media.mozCaptureStream) return { stream: media.mozCaptureStream(), method: "mozCaptureStream()", stop() {} };

  elementContext ??= new AudioContext();
  let source = elementSources.get(media);
  if (!source) {
    source = elementContext.createMediaElementSource(media);
    source.connect(elementContext.destination);
    elementSources.set(media, source);
    media.addEventListener("play", () => elementContext.resume().catch(() => {}));
  }
  elementContext.resume().catch(() => {});
  const destination = elementContext.createMediaStreamDestination();
  source.connect(destination);
  const tracks = [...destination.stream.getAudioTracks()];

  let drawing = false;
  if (media instanceof HTMLVideoElement && media.videoWidth) {
    const canvas = Object.assign(document.createElement("canvas"), { width: media.videoWidth, height: media.videoHeight });
    const ctx = canvas.getContext("2d");
    const stream = canvas.captureStream();
    drawing = true;
    const draw = () => {
      if (!drawing) return;
      ctx.drawImage(media, 0, 0, canvas.width, canvas.height);
      if (media.requestVideoFrameCallback) media.requestVideoFrameCallback(draw);
      else requestAnimationFrame(draw);
    };
    draw();
    tracks.unshift(...stream.getVideoTracks());
  }
  return {
    stream: new MediaStream(tracks),
    method: drawing ? "Web Audio + canvas.captureStream()" : "Web Audio",
    stop() {
      drawing = false;
      source.disconnect(destination);
      for (const t of tracks) t.stop();
    },
  };
}
