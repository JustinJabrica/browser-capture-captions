// Languages, as the other formats name them. Whisper names a language by its
// ISO 639-1 code ("fr"), with a few of its own ("jw" for Javanese, "haw" and
// "yue" that have no two-letter code); subtitle tracks inside a file
// (Matroska, MP4) take a three-letter ISO 639-2/T code ("fra": the
// terminological form, not the bibliographic "fre"), and a <track> element a
// BCP 47 tag ("fr", "jv"). No DOM.

// Whisper's code -> ISO 639-2/T, for every language a Whisper model transcribes.
export const ISO_639_2T = {
  en: "eng", zh: "zho", de: "deu", es: "spa", ru: "rus", ko: "kor", fr: "fra", ja: "jpn", pt: "por", tr: "tur",
  pl: "pol", ca: "cat", nl: "nld", ar: "ara", sv: "swe", it: "ita", id: "ind", hi: "hin", fi: "fin", vi: "vie",
  he: "heb", uk: "ukr", el: "ell", ms: "msa", cs: "ces", ro: "ron", da: "dan", hu: "hun", ta: "tam", no: "nor",
  th: "tha", ur: "urd", hr: "hrv", bg: "bul", lt: "lit", la: "lat", mi: "mri", ml: "mal", cy: "cym", sk: "slk",
  te: "tel", fa: "fas", lv: "lav", bn: "ben", sr: "srp", az: "aze", sl: "slv", kn: "kan", et: "est", mk: "mkd",
  br: "bre", eu: "eus", is: "isl", hy: "hye", ne: "nep", mn: "mon", bs: "bos", kk: "kaz", sq: "sqi", sw: "swa",
  gl: "glg", mr: "mar", pa: "pan", si: "sin", km: "khm", sn: "sna", yo: "yor", so: "som", af: "afr", oc: "oci",
  ka: "kat", be: "bel", tg: "tgk", sd: "snd", gu: "guj", am: "amh", yi: "yid", lo: "lao", uz: "uzb", fo: "fao",
  ht: "hat", ps: "pus", tk: "tuk", nn: "nno", mt: "mlt", sa: "san", lb: "ltz", my: "mya", bo: "bod", tl: "tgl",
  mg: "mlg", as: "asm", tt: "tat", haw: "haw", ln: "lin", ha: "hau", ba: "bak", jw: "jav", su: "sun", yue: "yue",
};

// Whisper's own codes that aren't the standard ones.
const BCP47 = { jw: "jv" };

// For a file's subtitle track: "fra", or "und" (undetermined) for a code this doesn't know.
export const trackLanguage = (code) => ISO_639_2T[code] ?? "und";

// For a <track srclang> or <html lang>: "fr", "jv".
export const tagFor = (code) => BCP47[code] ?? code;

// "French", in the bench's own language; the code itself when the browser has no name for it.
export function languageName(code, { locale = "en" } = {}) {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(tagFor(code)) ?? code;
  } catch {
    return code;
  }
}

// Scripts written right to left, by language.
const RTL = new Set(["ar", "he", "fa", "ur", "ps", "sd", "yi"]);
export const isRtl = (code) => RTL.has(code);

// Scripts written without spaces between words, by language: their words are
// found with Intl.Segmenter, not by splitting on spaces.
const UNSPACED = new Set(["zh", "ja", "th", "lo", "km", "my", "bo", "yue"]);
export const isUnspaced = (code) => UNSPACED.has(code);

// The words of text, in a language's own way: Intl.Segmenter's words for a
// language written without spaces (punctuation goes with the word before
// it), and whitespace-separated words otherwise.
export function wordsOf(text, code) {
  const trimmed = String(text).trim();
  if (!trimmed) return [];
  if (!isUnspaced(code) || typeof Intl.Segmenter !== "function") return trimmed.split(/\s+/);
  const words = [];
  for (const { segment, isWordLike } of new Intl.Segmenter(tagFor(code), { granularity: "word" }).segment(trimmed)) {
    if (!segment.trim()) continue;
    if (isWordLike || !words.length) words.push(segment);
    else words[words.length - 1] += segment;
  }
  return words;
}

// The joiner between words of a language: "" for one written without spaces.
export const joinerFor = (code) => (isUnspaced(code) ? "" : " ");
