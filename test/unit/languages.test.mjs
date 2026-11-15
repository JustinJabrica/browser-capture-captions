// Captions in other languages: what each model transcribes, Whisper's
// language detection (its choice from one decoding step), the codes other
// formats need, and text in scripts written without spaces or right to left
// (subtitles, word counts, the transcript clean-up).

import assert from "node:assert/strict";
import { test } from "node:test";
import { ISO_639_2T, isRtl, languageName, tagFor, trackLanguage, wordsOf } from "../../src/captions/languages.js";
import { asVtt, toCues } from "../../src/captions/subtitles.js";
import { captionStats } from "../../src/captions/timeline.js";
import { normalizeWords, wordErrors } from "../../src/captions/wer.js";
import { cleanTranscript, isDegenerate, isMultilingual, modelLanguage, modelLanguages, modelLanguageSet } from "../../src/speech/core.js";
import { MODELS, asrFor, ofKind, resolve, timestampedFor } from "../../src/speech/registry.js";
import { pickLanguage } from "../../src/speech/whisper-engine.js";

// --- Models ------------------------------------------------------------------------------

test("the multilingual Whisper models know 99 languages, without Cantonese; large-v3-turbo knows 100", () => {
  for (const id of ["whisper-tiny", "whisper-base", "whisper-small"]) {
    assert.equal(modelLanguageSet(id).size, 99, id);
    assert.equal(modelLanguage("fr-CA", id), "fr", id);
    assert.equal(modelLanguage("nb", id), "no", id);
    assert.equal(modelLanguage("yue", id), null, `${id}: its lang_to_id has no <|yue|>`);
    assert.ok(isMultilingual(id), id);
    assert.equal(modelLanguages(id), "99 languages (" + [...modelLanguageSet(id)].join(", ") + ")");
    // Each has a word-time export, linked both ways.
    assert.equal(timestampedFor(id)?.id, `${id}-timestamped`);
    assert.equal(asrFor(`${id}-timestamped`)?.id, id);
    assert.equal(resolve(id).source.repo, `onnx-community/${id}`);
  }
  assert.equal(modelLanguage("yue", "whisper-large-v3-turbo"), "yue");
  for (const id of ["whisper-tiny.en", "whisper-base.en", "distil-small.en", "wav2vec2-base-960h"]) assert.ok(!isMultilingual(id), id);
});

test("every language a model transcribes has a track code and a name", () => {
  const all = new Set(ofKind("asr").flatMap((m) => [...modelLanguageSet(m.id)]));
  for (const code of all) {
    assert.match(trackLanguage(code), /^[a-z]{3}$/, code);
    assert.notEqual(trackLanguage(code), "und", code);
    assert.ok(languageName(code), code);
  }
  assert.equal(Object.keys(ISO_639_2T).length, 100);
  // The terminological forms Mediabunny asks for, not the bibliographic ones.
  assert.deepEqual(["fr", "de", "zh", "cs", "nl", "fa", "jw"].map(trackLanguage), ["fra", "deu", "zho", "ces", "nld", "fas", "jav"]);
  assert.equal(trackLanguage("xx"), "und");
  assert.equal(tagFor("jw"), "jv");
  assert.equal(tagFor("fr"), "fr");
  assert.equal(languageName("fr"), "French");
  assert.ok(isRtl("ar") && isRtl("he") && !isRtl("fr"));
  assert.ok(MODELS.every((m) => m.kind !== "asr" || m.languages), "every transcription model lists its languages");
});

// --- Detection -----------------------------------------------------------------------------

test("pickLanguage: a softmax over the language tokens alone, limited to the allowed ones", () => {
  const langToId = { "<|en|>": 3, "<|fr|>": 4, "<|de|>": 5 };
  const logits = new Float32Array(8);
  logits[0] = 50; // a text token, louder than any language: ignored
  logits[3] = 1;
  logits[4] = 3;
  logits[5] = 2;
  const r = pickLanguage(logits, langToId);
  assert.equal(r.language, "fr");
  const e = (x) => Math.exp(x);
  assert.equal(r.probability, Math.round((e(3) / (e(1) + e(2) + e(3))) * 1000) / 1000);
  assert.deepEqual(r.top.map(([code]) => code), ["fr", "de", "en"]);
  assert.equal(pickLanguage(logits, langToId, ["en", "de"]).language, "de");
  assert.throws(() => pickLanguage(logits, langToId, ["ja"]), /No language/);
});

// --- Text in other scripts --------------------------------------------------------------------

test("wordsOf: spaces in most languages, Intl.Segmenter in Chinese, Japanese and Thai", () => {
  assert.deepEqual(wordsOf("Bonjour  à tous.", "fr"), ["Bonjour", "à", "tous."]);
  const zh = wordsOf("今天天气很好。我们去公园吧！", "zh");
  assert.ok(zh.length >= 6, zh.join("|"));
  assert.equal(zh.join(""), "今天天气很好。我们去公园吧！", "nothing lost, punctuation kept with the word before");
  assert.ok(zh.some((w) => w.endsWith("。")));
  assert.deepEqual(wordsOf("", "zh"), []);
});

test("toCues: a language written without spaces wraps without them and ends cues at 。", () => {
  const segment = { start: 0, end: 8, transcript: "今天天气很好，我们一起去公园散步吧。然后我们去吃饭，好不好？", speaker: null };
  const cues = toCues([segment], { language: "zh", maxChars: 12 });
  for (const cue of cues) {
    assert.ok(!cue.text.includes(" "), cue.text);
    for (const line of cue.lines) assert.ok(line.length <= 12 || !line.includes("，"), line);
    assert.equal(cue.language, "zh");
    assert.equal(cue.joiner, "");
  }
  assert.equal(cues.map((c) => c.lines.join("")).join(""), segment.transcript);
  assert.ok(cues.some((c) => c.text.endsWith("。")), "a sentence end closes a cue");
  // Karaoke tags go between the words, without spaces.
  const karaoke = asVtt(cues, { karaoke: true });
  assert.ok(!/> /.test(karaoke.split("\n").filter((l) => l.includes("<0")).join("")), karaoke);
});

test("toCues: English is as it was, and Arabic's question mark ends a sentence", () => {
  const fox = toCues([{ start: 0.56, end: 3.24, transcript: "The quick brown fox jumps over the lazy dog.", speaker: null }]);
  assert.deepEqual(fox[0].lines, ["The quick brown fox jumps over the lazy", "dog."]);
  assert.deepEqual(fox[0].lineSizes, [8, 1]);
  const ar = toCues([{ start: 0, end: 6, transcript: "كيف حالك اليوم يا صديقي العزيز؟ أنا بخير والحمد لله شكرا لك", speaker: null }], { language: "ar" });
  assert.ok(ar.length >= 2 && ar[0].text.endsWith("؟"), ar.map((c) => c.text).join(" | "));
});

test("word counts and word error rates count a Chinese sentence's words, and keep Hindi's marks", () => {
  assert.ok(captionStats([{ start: 0, end: 2, transcript: "今天天气很好。" }], { language: "zh" }).words >= 3);
  assert.equal(captionStats([{ start: 0, end: 2, transcript: "Bonjour à tous." }], { language: "fr" }).words, 3);
  assert.deepEqual(normalizeWords("नमस्ते दुनिया", "hi"), ["नमस्ते", "दुनिया"]);
  assert.equal(wordErrors("今天天气很好", "今天天气不好", "zh").errors > 0, true);
  assert.equal(wordErrors("今天天气很好。", "今天天气很好", "zh").errors, 0);
  assert.deepEqual(wordErrors("Ceci est un enregistrement.", "ceci est un enregistrement", "fr"), { words: 4, errors: 0, rate: 0 });
});

test("the clean-up drops subtitle credits, keeps marks, and spots loops in Chinese", () => {
  assert.equal(cleanTranscript("Sous-titres réalisés par la communauté d'Amara.org", 0.9), "");
  assert.equal(cleanTranscript("Untertitel im Auftrag des ZDF, 2021", 0.9), "");
  assert.equal(cleanTranscript("Bonjour à tous.", 0.9), "Bonjour à tous.");
  assert.equal(cleanTranscript("नमस्ते दुनिया।", 0.9, { punctuation: false }), "नमस्ते दुनिया");
  assert.ok(isDegenerate("谢谢谢谢谢谢谢谢谢谢谢谢谢谢谢谢"));
  assert.ok(!isDegenerate("今天天气很好，我们一起去公园散步吧。"));
  assert.ok(!isDegenerate("The quick brown fox jumps over the lazy dog."));
});
