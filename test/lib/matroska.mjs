// For the tests: reads the cues of a WebM or Matroska file's WebVTT subtitle
// track straight from its bytes. Mediabunny writes such tracks but can't read
// them, so this is how the tests check when each cue is shown, not just that
// the track is there. Just enough EBML for that: element ids and sizes, the
// track list, and each cluster's blocks.

const ID = {
  segment: 0x18538067,
  info: 0x1549a966,
  timestampScale: 0x2ad7b1,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  trackNumber: 0xd7,
  codecId: 0x86,
  language: 0x22b59c,
  cluster: 0x1f43b675,
  clusterTimestamp: 0xe7,
  blockGroup: 0xa0,
  block: 0xa1,
  blockDuration: 0x9b,
};
const MASTERS = new Set([ID.segment, ID.info, ID.tracks, ID.trackEntry, ID.cluster, ID.blockGroup]);

// A variable-length integer at offset: its value (with the length marker kept, for ids, or dropped, for sizes) and its length.
function vint(bytes, at, keepMarker) {
  const first = bytes[at];
  let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++;
  let value = keepMarker ? first : first & (0xff >> length);
  let unknown = (first & (0xff >> length)) === 0xff >> length;
  for (let i = 1; i < length; i++) {
    value = value * 256 + bytes[at + i];
    unknown &&= bytes[at + i] === 0xff;
  }
  return { value, length, unknown };
}

// Calls visit(id, start, end) for each element in [from, to), going into the masters.
function walk(bytes, from, to, visit) {
  let at = from;
  while (at < to) {
    const id = vint(bytes, at, true);
    const size = vint(bytes, at + id.length, false);
    const start = at + id.length + size.length;
    const end = size.unknown ? to : Math.min(to, start + size.value);
    visit(id.value, start, end);
    if (MASTERS.has(id.value)) walk(bytes, start, end, visit);
    at = end;
  }
}

const uint = (bytes, start, end) => {
  let value = 0;
  for (let i = start; i < end; i++) value = value * 256 + bytes[i];
  return value;
};
const text = (bytes, start, end) => new TextDecoder().decode(bytes.subarray(start, end));

// -> { codecs: [codec id of each track], language, cues: [{ start, end, text }] }: the first
// S_TEXT/WEBVTT track's cues, in seconds, or cues: null when the file has no such track.
export function matroskaSubtitles(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let scale = 1e6; // nanoseconds a tick, by default
  const tracks = [];
  let track = null;
  let cluster = 0;
  let group = null;
  const groups = [];
  walk(bytes, 0, bytes.length, (id, start, end) => {
    if (id === ID.timestampScale) scale = uint(bytes, start, end);
    else if (id === ID.trackEntry) tracks.push((track = { number: null, codec: null, language: null }));
    else if (id === ID.trackNumber && track) track.number = uint(bytes, start, end);
    else if (id === ID.codecId && track) track.codec = text(bytes, start, end);
    else if (id === ID.language && track) track.language = text(bytes, start, end);
    else if (id === ID.clusterTimestamp) cluster = uint(bytes, start, end);
    else if (id === ID.blockGroup) groups.push((group = { cluster, track: null, at: null, duration: null, text: null }));
    else if (id === ID.block && group) {
      const number = vint(bytes, start, false);
      const relative = new DataView(bytes.buffer, bytes.byteOffset + start + number.length, 2).getInt16(0);
      Object.assign(group, { track: number.value, at: group.cluster + relative, text: text(bytes, start + number.length + 3, end) });
    } else if (id === ID.blockDuration && group) group.duration = uint(bytes, start, end);
  });
  const subtitle = tracks.find((t) => t.codec === "S_TEXT/WEBVTT");
  const seconds = (ticks) => Math.round((ticks * scale) / 1e6) / 1000;
  return {
    codecs: tracks.map((t) => t.codec),
    language: subtitle?.language ?? null,
    cues: subtitle ? groups.filter((g) => g.track === subtitle.number).map((g) => ({ start: seconds(g.at), end: seconds(g.at + (g.duration ?? 0)), text: g.text })) : null,
  };
}
