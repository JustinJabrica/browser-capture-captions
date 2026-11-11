// How far apart two transcripts of the same recording are, in words: the
// word error rate of one against the other. Used to compare what the live
// captions heard with the second pass over the finished take. No DOM.
//
// Words are compared without case or punctuation. The count is the fewest
// substitutions, insertions and deletions that turn one list of words into
// the other (their edit distance), over the reference's length.

export const normalizeWords = (text) =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

// -> { words (in the reference), errors, rate (errors / words, or null with no reference words) }
export function wordErrors(reference, hypothesis) {
  const ref = normalizeWords(reference);
  const hyp = normalizeWords(hypothesis);
  // One row of the edit-distance table at a time.
  let row = Array.from({ length: hyp.length + 1 }, (_, j) => j);
  for (let i = 1; i <= ref.length; i++) {
    const next = [i];
    for (let j = 1; j <= hyp.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
    row = next;
  }
  const errors = row[hyp.length];
  return { words: ref.length, errors, rate: ref.length ? Math.round((errors / ref.length) * 1000) / 1000 : null };
}

// Two transcripts' segments compared as running text.
export const transcriptErrors = (reference, hypothesis) => wordErrors(reference.map((s) => s.transcript).join(" "), hypothesis.map((s) => s.transcript).join(" "));
