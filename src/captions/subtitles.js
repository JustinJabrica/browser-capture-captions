// Subtitles from a transcript: cues short enough to read, and the files
// that carry them (WebVTT, SubRip, plain text, JSON). No DOM: it runs in
// Node, and the unit tests check every format there.
//
// A transcript's segments are whole utterances, up to 20 s of speech each,
// which is far more than a screen holds. toCues() cuts them into cues of a
// couple of short lines, timed from the words: the words' own times when the
// transcript has them, or else an estimate that shares the segment's time out
// by each word's length.

// The usual subtitle limits: 42 characters a line, two lines, between about
// a second and six on screen.
export const CUE_DEFAULTS = { maxChars: 42, maxLines: 2, maxDurationS: 6, minDurationS: 0.7 };

const round = (s) => Math.round(s * 1000) / 1000;

// A segment's words with times: its own, or estimated from the text.
function timedWords(segment) {
  if (segment.words?.length) return segment.words.map((w) => ({ text: w.word, start: w.start, end: w.end }));
  const texts = segment.transcript.split(/\s+/).filter(Boolean);
  // Each word takes time in proportion to its letters, plus one for the gap after it.
  const total = texts.reduce((n, t) => n + t.length + 1, 0);
  const span = Math.max(0, segment.end - segment.start);
  let at = segment.start;
  return texts.map((text) => {
    const start = at;
    at += (span * (text.length + 1)) / total;
    return { text, start, end: at, estimated: true };
  });
}

// Lines of at most maxChars, filled in order. A word longer than a line gets a line of its own.
function wrap(words, maxChars) {
  const lines = [];
  for (const word of words) {
    const last = lines.at(-1);
    if (last && last.length + 1 + word.length <= maxChars) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

// Cues from segments ({ start, end, transcript, speaker?, words? }, in order):
// [{ start, end, text, lines, speaker, words: [{ text, start, end }] }]. A cue
// holds at most maxLines lines of maxChars and lasts at most maxDurationS, and
// ends where a sentence does once it has half a line or more. Cues never overlap and their starts
// only increase; one shorter than minDurationS is held until the next begins,
// if there is room. duration clips them to a file's length.
export function toCues(segments, options = {}) {
  const { maxChars, maxLines, maxDurationS, minDurationS } = { ...CUE_DEFAULTS, ...options };
  const duration = options.duration ?? Infinity;
  const cues = [];
  for (const segment of segments) {
    if (!segment.transcript?.trim()) continue;
    let current = [];
    const close = () => {
      if (!current.length) return;
      const lines = wrap(current.map((w) => w.text), maxChars);
      cues.push({ start: current[0].start, end: current.at(-1).end, text: lines.join("\n"), lines, speaker: segment.speaker ?? null, words: current });
      current = [];
    };
    for (const word of timedWords(segment)) {
      const next = [...current, word];
      const tooLong = wrap(next.map((w) => w.text), maxChars).length > maxLines || word.end - next[0].start > maxDurationS;
      if (current.length && tooLong) close();
      current.push(word);
      // The end of a sentence is a good place to stop, unless the cue is only a word or two so far.
      const text = current.map((w) => w.text).join(" ");
      if (/[.!?…]["')\]]?$/.test(word.text) && text.length >= maxChars / 2) close();
    }
    close();
  }

  // Times: in order, inside the file, not overlapping, and long enough to read where there is room.
  cues.sort((a, b) => a.start - b.start);
  const out = [];
  for (const [i, cue] of cues.entries()) {
    const floor = out.length ? out.at(-1).end : 0;
    const start = Math.min(duration, Math.max(cue.start, floor, 0));
    const nextStart = cues[i + 1]?.start ?? Infinity;
    let end = Math.min(duration, Math.max(cue.end, start));
    if (end - start < minDurationS) end = Math.min(start + minDurationS, Math.max(end, nextStart), duration);
    end = Math.min(end, Math.max(nextStart, start + 0.001));
    if (round(end) <= round(start)) continue;
    out.push({ ...cue, start: round(start), end: round(end) });
  }
  return out;
}

// "00:01:02.345" (WebVTT) or, with sep ",", "00:01:02,345" (SubRip).
export function formatTime(seconds, sep = ".") {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const pad = (n, width = 2) => String(n).padStart(width, "0");
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}${sep}${pad(ms % 1000, 3)}`;
}

// "1:02.3", for people.
const clock = (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;

// WebVTT keeps &, < and > for its own markup, and "-->" can't appear in a cue.
export const escapeCueText = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A WebVTT file. Speakers become voice spans (<v Speaker 1>). karaoke: a
// time tag before each word after a cue's first, so a player can light the
// words up as they are said (only worth it with real word times).
export function asVtt(cues, { karaoke = false } = {}) {
  const blocks = cues.map((cue, i) => {
    let text;
    if (karaoke) {
      // The words in their lines, each after the first with its start time before it.
      let n = 0;
      text = cue.lines
        .map((line) =>
          line
            .split(" ")
            .map((word) => {
              const w = cue.words[n++];
              return `${n > 1 && w ? `<${formatTime(Math.max(w.start, cue.start))}>` : ""}${escapeCueText(word)}`;
            })
            .join(" "),
        )
        .join("\n");
    } else {
      text = cue.lines.map(escapeCueText).join("\n");
    }
    if (cue.speaker != null) text = `<v Speaker ${cue.speaker}>${text}`;
    return `${i + 1}\n${formatTime(cue.start)} --> ${formatTime(cue.end)}\n${text}`;
  });
  return `WEBVTT\n\n${blocks.join("\n\n")}${blocks.length ? "\n" : ""}`;
}

// A SubRip (.srt) file: numbered cues, a comma before the milliseconds, plain text.
export function asSrt(cues) {
  return cues
    .map((cue, i) => `${i + 1}\n${formatTime(cue.start, ",")} --> ${formatTime(cue.end, ",")}\n${cue.speaker != null ? `Speaker ${cue.speaker}: ` : ""}${cue.lines.join("\n")}\n`)
    .join("\n");
}

// The transcript as text, an utterance a line: "[0:00.5–0:03.3] Speaker 1: …".
export function asText(segments, { timestamps = true } = {}) {
  return segments
    .filter((s) => s.transcript)
    .map((s) => `${timestamps ? `[${clock(s.start)}–${clock(s.end)}] ` : ""}${s.speaker != null ? `Speaker ${s.speaker}: ` : ""}${s.transcript}`)
    .join("\n")
    .concat("\n");
}

// The transcript record as JSON, with what it is a transcript of.
export function asJson(transcript, { source = null } = {}) {
  return `${JSON.stringify({ source, ...transcript }, null, 1)}\n`;
}

// The cue on screen at time t (seconds), or null. cues: toCues()'s, in order.
export function cueAt(cues, t) {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t < cues[mid].start) hi = mid - 1;
    else if (t >= cues[mid].end) lo = mid + 1;
    else return cues[mid];
  }
  return null;
}
