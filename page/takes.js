// Saved takes, in IndexedDB: every recording's report (settings, what the
// browser gave, the recorder's stats, the probe and the metrics) in one
// store, and its files (the recording, a seekable copy when one was made,
// the tap's WAV and the 16 kHz WAV) in another, so the reports list quickly
// and the files load only when a take is opened. Reports move between
// browsers as JSON (Export and Import); files are downloaded separately.
//
// A report:
//   { id, createdAt, name, source: { kind, label, method?, pipeline: { mixMic, webrtc } },
//     env: { browser, userAgent, platform, secureContext, crossOriginIsolated },
//     asked: { video?, audio?, display?, synthetic?, file? },   what was asked for
//     tracks: [{ kind, label, settings, capabilities, constraints, events }],
//     recorder: TakeRecorder stats | null, wallS, webrtc?: loopback info,
//     analysis: analyseTake()'s analysis, settings: the bench's settings,
//     media: { file, seekable, tap, pcm16k } (which files were kept), imported? }

const DB = "caption-bench";
const REPORTS = "takes";
const MEDIA = "media";
export const TAKES_FORMAT = "caption-bench-takes/1";

let opening = null;
function db() {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(REPORTS, { keyPath: "id" });
      request.result.createObjectStore(MEDIA);
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

// Saves a report and its files ({ file, seekable, tap, pcm16k }, Blobs or null).
export function saveTake(report, media = {}) {
  const kept = Object.fromEntries(KINDS.map((k) => [k, Boolean(media[k])]));
  const record = { ...report, media: kept };
  return transact([REPORTS, MEDIA], "readwrite", (tx) => {
    for (const k of KINDS) if (media[k]) tx.objectStore(MEDIA).put(media[k], `${report.id}/${k}`);
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

export function deleteTake(id) {
  return transact([REPORTS, MEDIA], "readwrite", (tx) => {
    for (const k of KINDS) tx.objectStore(MEDIA).delete(`${id}/${k}`);
    tx.objectStore(REPORTS).delete(id);
  });
}

export function clearTakes() {
  return transact([REPORTS, MEDIA], "readwrite", (tx) => {
    tx.objectStore(MEDIA).clear();
    tx.objectStore(REPORTS).clear();
  });
}

export async function exportTakes() {
  return JSON.stringify({ format: TAKES_FORMAT, exported: new Date().toISOString(), takes: await listTakes() }, null, 1);
}

// Adds the reports in an export (or a bare array of them). A take with an id
// already here keeps its files; others come without files, marked imported.
// Returns how many were added.
export async function importTakes(text) {
  const data = JSON.parse(text);
  const takes = Array.isArray(data) ? data : data?.takes;
  if (!Array.isArray(takes)) throw new Error("Not a takes export: expected { takes: [...] }");
  const here = new Map((await listTakes()).map((t) => [t.id, t]));
  let added = 0;
  for (const take of takes) {
    if (!take?.id || !take.source?.kind || !take.analysis) continue;
    const own = here.get(take.id);
    await transact([REPORTS], "readwrite", (tx) => tx.objectStore(REPORTS).put(own ? { ...take, media: own.media } : { ...take, imported: true, media: {} }));
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
