// CTC forced alignment, WhisperX-style: given a CTC model's per-frame log
// probabilities for a clip and the words someone said in it (Whisper's text),
// find when each word was spoken. Pure functions, so they're unit-tested on
// synthetic emissions; src/align/aligner.js runs the model.
//
// Each word becomes the vocabulary characters it has (A-Z and the apostrophe,
// for wav2vec2), with the word delimiter between words. Viterbi over the
// trellis (frames x characters) finds the most likely frame for each
// character; a word spans its characters' frames. Words with no characters the
// model knows ("15%") can't be aligned: they share the gap between their
// neighbours and are marked estimated.

// Rows of log-probabilities from logits: Float32Array, frames x vocab.
export function logSoftmax(logits, frames, vocab) {
  const out = new Float32Array(frames * vocab);
  for (let f = 0; f < frames; f++) {
    const row = f * vocab;
    let max = -Infinity;
    for (let v = 0; v < vocab; v++) max = Math.max(max, logits[row + v]);
    let sum = 0;
    for (let v = 0; v < vocab; v++) sum += Math.exp(logits[row + v] - max);
    const lse = max + Math.log(sum);
    for (let v = 0; v < vocab; v++) out[row + v] = logits[row + v] - lse;
  }
  return out;
}

// The character tokens for each word: an array per word (empty if none of
// its characters is in the vocabulary). charToId maps "A" -> id.
export function wordTokens(words, charToId) {
  return words.map((word) => {
    const ids = [];
    for (const c of word.toUpperCase()) if (charToId.has(c)) ids.push(charToId.get(c));
    return ids;
  });
}

// Aligns words to frames. emissions: log-probabilities, frames x vocab.
// Returns, per word, { word, start, end } in frames (end exclusive), or
// { word, start: null, end: null } for a word with no alignable characters.
export function alignFrames(emissions, frames, vocab, words, { charToId, blank, delimiter }) {
  const perWord = wordTokens(words, charToId);
  // The token sequence, with the delimiter between aligned words, and which
  // word each token belongs to (-1 for a delimiter).
  const tokens = [];
  const owner = [];
  for (const [w, ids] of perWord.entries()) {
    if (!ids.length) continue;
    if (tokens.length && delimiter != null) {
      tokens.push(delimiter);
      owner.push(-1);
    }
    for (const id of ids) {
      tokens.push(id);
      owner.push(w);
    }
  }
  const result = words.map((word) => ({ word, start: null, end: null }));
  const n = tokens.length;
  if (!n || frames < n) return result;

  // score[t][j]: the best log-probability of having emitted the first j
  // tokens after t frames. A frame either stays (blank, or the current token
  // again) or emits the next token. Kept as two rows, with the choices kept
  // for the backtrack.
  const NEG = -Infinity;
  let prev = new Float64Array(n + 1).fill(NEG);
  let next = new Float64Array(n + 1);
  prev[0] = 0;
  const advanced = new Uint8Array(frames * (n + 1));
  for (let t = 0; t < frames; t++) {
    const row = t * vocab;
    const blankP = emissions[row + blank];
    for (let j = 0; j <= n; j++) {
      const stay = prev[j] + (j === 0 ? blankP : Math.max(blankP, emissions[row + tokens[j - 1]]));
      const move = j > 0 ? prev[j - 1] + emissions[row + tokens[j - 1]] : NEG;
      if (move > stay) {
        next[j] = move;
        advanced[t * (n + 1) + j] = 1;
      } else next[j] = stay;
    }
    [prev, next] = [next, prev];
  }
  if (prev[n] === NEG) return result;

  // Backtrack: the frame each token was emitted on, extended over the frames
  // where it repeats rather than blanks.
  const first = new Int32Array(n).fill(-1);
  const last = new Int32Array(n).fill(-1);
  let j = n;
  for (let t = frames - 1; t >= 0; t--) {
    if (advanced[t * (n + 1) + j]) {
      first[j - 1] = t;
      if (last[j - 1] < 0) last[j - 1] = t;
      j--;
    } else if (j > 0 && emissions[t * vocab + tokens[j - 1]] >= emissions[t * vocab + blank] && last[j - 1] < 0) {
      last[j - 1] = t;
    }
    if (j === 0) break;
  }
  for (let k = 0; k < n; k++) {
    const w = owner[k];
    if (w < 0) continue;
    const r = result[w];
    r.start = r.start == null ? first[k] : Math.min(r.start, first[k]);
    r.end = Math.max(r.end ?? 0, last[k] + 1);
  }
  return result;
}

// Frames to seconds, with unaligned words spread over the gap between their
// neighbours (within [0, duration]). Returns [{ word, start, end, estimated? }].
export function toSeconds(aligned, secondsPerFrame, duration) {
  const round = (s) => Math.round(s * 1000) / 1000;
  const words = aligned.map((a) => ({
    word: a.word,
    start: a.start == null ? null : a.start * secondsPerFrame,
    end: a.end == null ? null : Math.min(duration, a.end * secondsPerFrame),
  }));
  for (let i = 0; i < words.length; ) {
    if (words[i].start != null) {
      i++;
      continue;
    }
    let k = i;
    while (k < words.length && words[k].start == null) k++;
    const from = i > 0 ? words[i - 1].end : 0;
    const to = k < words.length ? words[k].start : duration;
    const step = Math.max(0, to - from) / (k - i);
    for (let m = i; m < k; m++) {
      words[m].start = from + step * (m - i);
      words[m].end = from + step * (m - i + 1);
      words[m].estimated = true;
    }
    i = k;
  }
  return words.map((w) => ({ ...w, start: round(w.start), end: round(w.end) }));
}
