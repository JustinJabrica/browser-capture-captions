// AudioWorklet that copies every input channel, as the browser delivers it
// (the context's sample rate, no mixing), to the main thread in blocks of
// about 100 ms. Each block carries the frame it starts at, so the main
// thread can tell where blocks were lost. When nothing is connected (the
// source ended), the input has no channels: the block is filled with silence
// and those frames are counted as empty. "flush" sends the part-filled block
// at once, marked flushed; "stop" does the same, then stops.

class PcmTapProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.channels = null;
    this.size = 0;
    this.filled = 0;
    this.start = 0;
    this.empty = 0;
    this.stopped = false;
    this.port.onmessage = ({ data }) => {
      if ((data !== "flush" && data !== "stop") || this.stopped) return;
      const channels = (this.channels ?? []).map((c) => c.slice(0, this.filled));
      this.port.postMessage({ frame: this.start, empty: this.empty, channels, flushed: true }, channels.map((c) => c.buffer));
      this.filled = 0;
      this.empty = 0;
      this.stopped = data === "stop";
    };
  }

  process(inputs) {
    if (this.stopped) return false;
    const input = inputs[0] ?? [];
    const frames = input.length ? input[0].length : 128;
    // The channel count and block size are fixed by the first audio to arrive:
    // about 100 ms, a whole number of render quanta.
    if (!this.channels) {
      if (!input.length) return true;
      this.size = Math.max(frames, Math.round(sampleRate / 10 / frames) * frames);
      this.channels = input.map(() => new Float32Array(this.size));
    }
    if (!this.filled) this.start = currentFrame;
    if (!input.length) this.empty += frames;
    for (let c = 0; c < this.channels.length; c++) {
      // A source that loses a channel repeats its first one.
      const from = input[c] ?? input[0];
      if (from) this.channels[c].set(from, this.filled);
      else this.channels[c].fill(0, this.filled, this.filled + frames);
    }
    this.filled += frames;
    if (this.filled >= this.size) {
      this.port.postMessage({ frame: this.start, empty: this.empty, channels: this.channels }, this.channels.map((c) => c.buffer));
      this.channels = this.channels.map(() => new Float32Array(this.size));
      this.filled = 0;
      this.empty = 0;
    }
    return true;
  }
}

registerProcessor("pcm-tap", PcmTapProcessor);
