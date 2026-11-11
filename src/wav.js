// WAV files from Float32 PCM, and back. 16-bit integer is what most tools
// (and transcription models) expect; 32-bit float keeps the tap exactly as
// the browser delivered it. No DOM, so the unit tests use it too.

// channels: Float32Array per channel, all the same length.
export function encodeWav(channels, sampleRate, { float = false } = {}) {
  const count = channels.length;
  const frames = count ? channels[0].length : 0;
  const bytes = float ? 4 : 2;
  const data = frames * count * bytes;
  const buffer = new ArrayBuffer(44 + data);
  const view = new DataView(buffer);
  const text = (offset, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + data, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, float ? 3 : 1, true); // 3 = IEEE float, 1 = integer PCM
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * bytes, true);
  view.setUint16(32, count * bytes, true);
  view.setUint16(34, bytes * 8, true);
  text(36, "data");
  view.setUint32(40, data, true);

  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < count; c++) {
      const s = channels[c][i];
      if (float) {
        view.setFloat32(offset, s, true);
        offset += 4;
      } else {
        // Clamp, then scale asymmetrically so -1 and 1 both fit 16 bits.
        const x = Math.max(-1, Math.min(1, s));
        view.setInt16(offset, x < 0 ? x * 0x8000 : x * 0x7fff, true);
        offset += 2;
      }
    }
  }
  return buffer;
}

// Reads a PCM WAV (8, 16, 24 or 32-bit integer, or 32-bit float) into
// { sampleRate, channels: Float32Array[], bits, float }. Skips chunks other
// than fmt and data. Throws on anything else.
export function parseWav(input) {
  const buffer = input instanceof ArrayBuffer ? input : input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  const view = new DataView(buffer);
  const text = (offset) => String.fromCharCode(...new Uint8Array(buffer, offset, 4));
  if (buffer.byteLength < 12 || text(0) !== "RIFF" || text(8) !== "WAVE") throw new Error("Not a WAV file");
  let fmt = null;
  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const id = text(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      const tag = view.getUint16(body, true);
      fmt = {
        // 0xfffe is WAVE_FORMAT_EXTENSIBLE; its subformat's first two bytes are the real tag.
        tag: tag === 0xfffe ? view.getUint16(body + 24, true) : tag,
        count: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      if (!fmt) throw new Error("WAV data before its format");
      const { tag, count, sampleRate, bits } = fmt;
      const float = tag === 3;
      if (!float && tag !== 1) throw new Error(`Unsupported WAV format ${tag}`);
      const bytes = bits / 8;
      const length = Math.min(size, buffer.byteLength - body);
      const frames = Math.floor(length / (bytes * count));
      const channels = Array.from({ length: count }, () => new Float32Array(frames));
      let p = body;
      for (let i = 0; i < frames; i++) {
        for (let c = 0; c < count; c++) {
          let s;
          if (float) s = bits === 64 ? view.getFloat64(p, true) : view.getFloat32(p, true);
          else if (bits === 8) s = (view.getUint8(p) - 128) / 128;
          else if (bits === 16) s = view.getInt16(p, true) / 0x8000;
          else if (bits === 24) s = ((view.getUint8(p) | (view.getUint8(p + 1) << 8) | (view.getInt8(p + 2) << 16)) / 0x800000);
          else s = view.getInt32(p, true) / 0x80000000;
          channels[c][i] = s;
          p += bytes;
        }
      }
      return { sampleRate, channels, bits, float };
    }
    offset = body + size + (size % 2); // chunks are padded to an even length
  }
  throw new Error("WAV has no data");
}
