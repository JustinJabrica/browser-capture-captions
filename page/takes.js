// Saved takes, in IndexedDB: every recording's report (settings, what the
// browser gave, the recorder's stats, the probe and the metrics) in one
// store, its files (the recording, a seekable copy when one was made, the
// tap's WAV and the 16 kHz WAV) in another, and its transcripts in a third,
// so the reports list quickly and the rest loads only when a take is opened.
// Reports and transcripts move between browsers as JSON (Export and
// Import); files are downloaded separately.
//
// A report:
//   { id, createdAt, name, source: { kind, label, method?, pipeline: { mixMic, webrtc } },
//     env: { browser, userAgent, platform, secureContext, crossOriginIsolated },
//     asked: { video?, audio?, display?, synthetic?, file? },   what was asked for
//     tracks: [{ kind, label, settings, capabilities, constraints, events }],
//     recorder: TakeRecorder stats | null, wallS, webrtc?: loopback info,
//     analysis: analyseTake()'s analysis, settings: the bench's settings,
//     media: { file, seekable, tap, pcm16k } (which files were kept),
//     transcripts: { live, final (each a transcript without its segments, or null), chosen }, imported? }
//
// A transcript (page/captions.js makes them):
//   { format: "caption-bench-transcript/1", takeId, kind: "live" | "final", createdAt,
//     engine: { model, dtype, device, threads, crossOriginIsolated, fallback, wordsFrom, from },
//     settings: the Captions tab's, as the run used them,
//     clock: { rate, firstFedFrame, startFrame, endFrame, gaps, lostFrames,
//              offsetS, offsetFrom, estimatedS, waveScore, driftS }   how its times were placed
//            (a final one: { offsetS, offsetFrom: "decoded" }, the audio track's first timestamp)
//     segments: [{ id, start, end, transcript, confidence, speaker, words?, latency?, ms?, clipped?, frames }],
//     stats: { segments, words, speechS, latencyS, rtf, interims }, incomplete? }
//            (a final one: { segments, words, speechS, rtf, tookS, dropped, againstLive })
//   start and end are seconds on the saved file's timeline.

const DB = "caption-bench";
const REPORTS = "takes";
const MEDIA = "media";
const TRANSCRIPTS = "transcripts";
export const TAKES_FORMAT = "caption-bench-takes/1";

let opening = null;
function db() {
  opening ??= new Promise((resolve, reject) => {
    // Version 2 added the transcripts.
    const request = indexedDB.open(DB, 2);
    request.onupgradeneeded = () => {
      const names = request.result.objectStoreNames;
      if (!names.contains(REPORTS)) request.result.createObjectStore(REPORTS, { keyPath: "id" });
      if (!names.contains(MEDIA)) request.result.createObjectStore(MEDIA);
      if (!names.contains(TRANSCRIPTS)) request.result.createObjectStore(TRANSCRIPTS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opening;
}

async function transact(stores, mode, work) {
  const tx = (await db()).transaction(stores, mode);
  return new Promise((resolve, reject) => {
    let result;
    const request = work(tx);
    if (request) request.onsuccess = () => (result = request.result);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Saving was aborted (the browser may be out of storage space)"));
  });
}

const KINDS = ["file", "seekable", "tap", "pcm16k"];
export const TRANSCRIPT_KINDS = ["live", "final"];

// What a report keeps of a transcript: everything but its segments.
export const transcriptSummary = (t) => {
  if (!t) return null;
  const { segments, ...rest } = t;
  return rest;
};

// Saves a report with its files ({ file, seekable, tap, pcm16k }, Blobs or
// null) and its transcripts ({ live, final }, or null where there is none).
export function saveTake(report, media = {}, transcripts = {}) {
  const kept = Object.fromEntries(KINDS.map((k) => [k, Boolean(media[k])]));
  const record = {
    ...report,
    media: kept,
    transcripts: { live: transcriptSummary(transcripts.live), final: transcriptSummary(transcripts.final), chosen: report.transcripts?.chosen ?? (transcripts.final ? "final" : transcripts.live ? "live" : null) },
  };
  return transact([REPORTS, MEDIA, TRANSCRIPTS], "readwrite", (tx) => {
    for (const k of KINDS) if (media[k]) tx.objectStore(MEDIA).put(media[k], `${report.id}/${k}`);
    for (const k of TRANSCRIPT_KINDS) if (transcripts[k]) tx.objectStore(TRANSCRIPTS).put(transcripts[k], `${report.id}/${k}`);
    tx.objectStore(REPORTS).put(record);
  }).then(() => record);
}

export const listTakes = () =>
  transact([REPORTS], "readonly", (tx) => tx.objectStore(REPORTS).getAll()).then((takes) => takes.sort((a, b) => a.createdAt - b.createdAt));

// { file, seekable, tap, pcm16k }: the take's Blobs, null where none was kept.
export async function takeMedia(id) {
  const out = {};
  await transact([MEDIA], "readonly", (tx) => {
    const store = tx.objectStore(MEDIA);
    for (const k of KINDS) {
      const request = store.get(`${id}/${k}`);
      request.onsuccess = () => (out[k] = request.result ?? null);
    }
  });
  return out;
}

// { live, final }: the take's transcripts, null where there is none.
export async function takeTranscripts(id) {
  const out = {};
  await transact([TRANSCRIPTS], "readonly", (tx) => {
    const store = tx.objectStore(TRANSCRIPTS);
    for (const k of TRANSCRIPT_KINDS) {
      const request = store.get(`${id}/${k}`);
      request.onsuccess = () => (out[k] = request.result ?? null);
    }
  });
  return out;
}

// Adds or replaces one of a take's transcripts ("live" or "final"), and makes
// it the one the take's subtitles come from. Resolves to the take's report as
// it is now, or to null when the take isn't saved.
export async function saveTranscript(id, kind, transcript) {
  const report = await transact([REPORTS], "readonly", (tx) => tx.objectStore(REPORTS).get(id));
  if (!report) return null;
  const record = { ...report, transcripts: { live: null, final: null, ...report.transcripts, [kind]: transcriptSummary(transcript), chosen: kind } };
  await transact([REPORTS, TRANSCRIPTS], "readwrite", (tx) => {
    tx.objectStore(TRANSCRIPTS).put(transcript, `${id}/${kind}`);
    tx.objectStore(REPORTS).put(record);
  });
  return record;
}

// Chooses which transcript a take's subtitles come from. Resolves to the report as it is now.
export async function chooseTranscript(id, kind) {
  const report = await transact([REPORTS], "readonly", (tx) => tx.objectStore(REPORTS).get(id));
  if (!report?.transcripts?.[kind]) return report ?? null;
  const record = { ...report, transcripts: { ...report.transcripts, chosen: kind } };
  await transact([REPORTS], "readwrite", (tx) => tx.objectStore(REPORTS).put(record));
  return record;
}

export function deleteTake(id) {
  return transact([REPORTS, MEDIA, TRANSCRIPTS], "readwrite", (tx) => {
    for (const k of KINDS) tx.objectStore(MEDIA).delete(`${id}/${k}`);
    for (const k of TRANSCRIPT_KINDS) tx.objectStore(TRANSCRIPTS).delete(`${id}/${k}`);
    tx.objectStore(REPORTS).delete(id);
  });
}

export function clearTakes() {
  return transact([REPORTS, MEDIA, TRANSCRIPTS], "readwrite", (tx) => {
    tx.objectStore(MEDIA).clear();
    tx.objectStore(TRANSCRIPTS).clear();
    tx.objectStore(REPORTS).clear();
  });
}

// Every report, oldest first, and every transcript by its take's id.
export async function exportTakes() {
  const takes = await listTakes();
  const transcripts = {};
  for (const take of takes) {
    const t = await takeTranscripts(take.id);
    if (t.live || t.final) transcripts[take.id] = t;
  }
  return JSON.stringify({ format: TAKES_FORMAT, exported: new Date().toISOString(), takes, transcripts }, null, 1);
}

// Adds the reports in an export (or a bare array of them), with their
// transcripts. A take with an id already here keeps its files; others come
// without files, marked imported. Returns how many were added.
export async function importTakes(text) {
  const data = JSON.parse(text);
  const takes = Array.isArray(data) ? data : data?.takes;
  if (!Array.isArray(takes)) throw new Error("Not a takes export: expected { takes: [...] }");
  const here = new Map((await listTakes()).map((t) => [t.id, t]));
  let added = 0;
  for (const take of takes) {
    if (!take?.id || !take.source?.kind || !take.analysis) continue;
    const own = here.get(take.id);
    const transcripts = data?.transcripts?.[take.id] ?? {};
    await transact([REPORTS, TRANSCRIPTS], "readwrite", (tx) => {
      tx.objectStore(REPORTS).put(own ? { ...take, media: own.media } : { ...take, imported: true, media: {} });
      for (const k of TRANSCRIPT_KINDS) if (transcripts[k]?.segments) tx.objectStore(TRANSCRIPTS).put(transcripts[k], `${take.id}/${k}`);
    });
    added++;
  }
  return added;
}

// How much this site stores, and may store: { usage, quota } in bytes, or null.
export async function storageUse() {
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}
