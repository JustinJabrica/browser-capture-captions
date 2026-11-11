// The Takes view: every saved take in a sortable table, filtered by source.
// Tick one to open its card (files and all); tick up to four to see their
// measurements side by side, with their waveforms.

import { bytes, esc } from "./bench.js";
import { DRIFT_OK, EDGE_OK, MATCH_OK, SYNC_OK, metricGroups } from "./take-view.js";

const MAX_PICKED = 4;
const SOURCES = { camera: "Camera & mic", cameras: "Two cameras", mics: "Two mics", screen: "Screen", file: "Media file", synthetic: "Test signal", "whole-file": "Whole file" };

const when = (ms) => {
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
};
const msText = (s) => (s == null ? "—" : `${s > 0 ? "+" : ""}${Math.round(s * 1000)} ms`);
const score = (ok) => (ok == null ? "" : ok ? "good" : "bad");

// "video/webm;codecs=vp8,opus" -> "webm vp8,opus"
const typeLabel = (t) => {
  const type = t.recorder?.mimeType || t.analysis?.file?.type || "";
  const [base, codecs] = type.split(";codecs=");
  return `${base.split("/")[1] ?? base}${codecs ? ` ${codecs.replace(/"/g, "")}` : ""}`;
};
const videoLabel = (t) => {
  const v = t.analysis?.file?.probe?.tracks.find((x) => x.type === "video");
  return v ? `${v.width}×${v.height}${t.analysis.video?.fps ? ` @ ${Math.round(t.analysis.video.fps)}` : ""}` : "";
};
// The microphone's processing as the browser reported it: EC, NS and AGC for
// each one that was on.
const processing = (t) => {
  const s = t.tracks?.find((x) => x.kind === "audio")?.settings;
  if (!s) return "";
  return [s.echoCancellation && "EC", s.noiseSuppression && "NS", s.autoGainControl && "AGC"].filter(Boolean).join(" ") || "raw";
};
const audioLabel = (t) => {
  const tap = t.analysis?.tap;
  return tap ? `${tap.sampleRate / 1000} kHz · ${tap.channels} ch${processing(t) ? ` · ${processing(t)}` : ""}` : "";
};

// Columns: key, label, value for sorting, cell HTML, numeric.
const COLUMNS = [
  ["source", "Source", (t) => t.name, (t) => `<td>${esc(SOURCES[t.source.kind] ?? t.source.kind)}<span class="sub">${esc(t.source.label ?? "")}</span></td>`],
  ["browser", "Browser", (t) => t.env?.browser ?? "", (t) => `<td class="mono">${esc(t.env?.browser ?? "")}</td>`],
  ["type", "Recorded as", typeLabel, (t) => `<td class="mono">${esc(typeLabel(t))}</td>`],
  ["video", "Video", videoLabel, (t) => `<td class="mono${videoLabel(t) ? "" : " dim"}">${esc(videoLabel(t) || "—")}</td>`],
  ["audio", "Audio", audioLabel, (t) => `<td class="mono${audioLabel(t) ? "" : " dim"}">${esc(audioLabel(t) || "—")}</td>`],
  ["length", "Length", (t) => t.wallS ?? t.analysis?.decoded?.duration ?? 0, (t) => `<td class="num">${(t.wallS ?? t.analysis?.decoded?.duration ?? 0).toFixed(1)} s</td>`, true],
  [
    "offset",
    "Starts",
    (t) => Math.abs(t.analysis?.match?.lagS ?? Infinity),
    (t) => {
      const d = t.analysis?.match?.lagS;
      return `<td class="num score ${score(d == null ? null : Math.abs(d) <= EDGE_OK)}">${msText(d)}</td>`;
    },
    true,
  ],
  [
    "drift",
    "Drift",
    (t) => Math.abs(t.analysis?.match?.driftS ?? Infinity),
    (t) => {
      const d = t.analysis?.match?.driftS;
      return `<td class="num score ${score(d == null ? null : Math.abs(d) <= DRIFT_OK)}"${d == null && t.analysis?.match ? ' title="Too short to tell: under 60 s"' : ""}>${msText(d)}</td>`;
    },
    true,
  ],
  [
    "match",
    "Match",
    (t) => t.analysis?.match?.waveScore ?? -1,
    (t) => {
      const m = t.analysis?.match?.waveScore;
      return `<td class="num score ${score(m == null ? null : m >= MATCH_OK)}">${m == null ? "—" : m.toFixed(3)}</td>`;
    },
    true,
  ],
  [
    "dropped",
    "Dropped",
    // The test signal's missing frame numbers where there are some, otherwise gaps in the packets.
    (t) => t.analysis?.sync?.frames?.missing ?? t.analysis?.video?.dropped ?? Infinity,
    (t) => {
      const d = t.analysis?.sync?.frames?.missing ?? t.analysis?.video?.dropped;
      return `<td class="num score ${score(d == null ? null : d === 0)}">${d ?? "—"}</td>`;
    },
    true,
  ],
  [
    "av",
    "A/V offset",
    (t) => t.analysis?.sync?.offsetS?.median ?? Infinity,
    (t) => {
      const o = t.analysis?.sync?.offsetS?.median;
      return `<td class="num score ${score(o == null ? null : o >= SYNC_OK.lead && o <= SYNC_OK.lag)}">${msText(o)}</td>`;
    },
    true,
  ],
  ["size", "Size", (t) => t.analysis?.file?.size ?? 0, (t) => `<td class="num">${bytes(t.analysis?.file?.size)}</td>`, true],
  ["when", "When", (t) => t.createdAt, (t) => `<td class="num dim">${when(t.createdAt)}</td>`, true],
];

// onOpen(take, host) fills in a single picked take's card; onPickedChange(ids).
export function createCompare({ host, onOpen, onPickedChange = () => {} }) {
  let takes = [];
  let picked = [];
  let filter = "all";
  let sort = { key: "when", dir: -1 };
  let noteText = "";

  host.addEventListener("click", (e) => {
    // A tap beside a tick box, in its cell, ticks it: on a touch screen the cell is the target.
    const box = !e.target.matches("input") && e.target.closest("td.pick")?.querySelector("input[data-pick]");
    if (box) box.checked = !box.checked;
    const t = box || e.target.closest("button[data-sort], button[data-kind], input[data-pick], tr[data-id]");
    if (!t) return;
    if (t.matches("input[data-pick]")) toggle(t.dataset.pick, t.checked);
    else if (t.dataset.sort) {
      const key = t.dataset.sort;
      sort = sort.key === key ? { key, dir: -sort.dir } : { key, dir: ["when", "length", "size", "match"].includes(key) ? -1 : 1 };
    } else if (t.dataset.kind) filter = t.dataset.kind;
    else if (t.matches("tr[data-id]")) {
      // A click on a row opens that take on its own.
      picked = [t.dataset.id];
      onPickedChange(picked);
    }
    render();
  });

  function toggle(id, on) {
    picked = picked.filter((x) => x !== id);
    if (on) picked = [...picked, id].slice(-MAX_PICKED);
    onPickedChange(picked);
  }

  const byId = (id) => takes.find((t) => t.id === id);

  function visible() {
    const list = takes.filter((t) => filter === "all" || t.source.kind === filter);
    const col = COLUMNS.find((c) => c[0] === sort.key);
    return list.sort((a, b) => {
      const x = col[2](a);
      const y = col[2](b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }

  function render() {
    const kinds = [...new Set(takes.map((t) => t.source.kind))];
    if (filter !== "all" && !kinds.includes(filter)) filter = "all";
    const head = COLUMNS.map(([key, label, , , num]) => {
      const on = sort.key === key;
      const dir = on ? (sort.dir > 0 ? "ascending" : "descending") : "none";
      return `<th class="${num ? "num" : ""}" aria-sort="${dir}"><button type="button" data-sort="${key}">${label}${on ? `<span class="arrow" aria-hidden="true">${sort.dir > 0 ? "▲" : "▼"}</span>` : ""}</button></th>`;
    }).join("");
    const body = visible()
      .map((t) => {
        const n = picked.indexOf(t.id);
        return `<tr data-id="${esc(t.id)}" class="${n >= 0 ? "picked" : ""}"><td class="pick">${n >= 0 && picked.length > 1 ? `<b class="run-badge">${n + 1}</b>` : ""}<input type="checkbox" data-pick="${esc(t.id)}" ${n >= 0 ? "checked" : ""} aria-label="Compare ${esc(t.name)}"></td>${COLUMNS.map((c) => c[3](t)).join("")}</tr>`;
      })
      .join("");
    host.innerHTML = `
      <div class="compare-bar">
        <div class="filters" role="group" aria-label="Source">
          <button type="button" data-kind="all" aria-pressed="${filter === "all"}">All sources</button>
          ${kinds.map((k) => `<button type="button" data-kind="${esc(k)}" aria-pressed="${filter === k}">${esc(SOURCES[k] ?? k)}</button>`).join("")}
        </div>
        <span class="meta" id="storage-use">${esc(noteText)}</span>
      </div>
      ${
        takes.length
          ? `<div class="runs-wrap"><table class="runs" id="takes-table"><thead><tr><th><span class="sr-only">Pick</span></th>${head}</tr></thead><tbody>${body}</tbody></table></div>`
          : `<p class="empty">No takes yet. Every recording is saved here when you press <b>Stop</b>, with its files and everything measured about it.</p>`
      }
      <div class="compare-detail" id="compare-detail"></div>`;
    detail(host.querySelector("#compare-detail"));
  }

  function detail(el) {
    const list = picked.map(byId).filter(Boolean);
    if (!list.length) {
      el.innerHTML = takes.length ? `<p class="hint">Click a take to open it, or tick up to ${MAX_PICKED} to compare them.</p>` : "";
      return;
    }
    if (list.length === 1) return onOpen(list[0], el);
    // Side by side: every measurement of every picked take.
    const groups = list.map((t) => metricGroups(t));
    const rows = [];
    const titles = [...new Set(groups.flatMap((g) => g.map(([title]) => title)))];
    for (const title of titles) {
      const labels = [...new Set(groups.flatMap((g) => (g.find(([x]) => x === title)?.[1] ?? []).map(([label]) => label)))];
      rows.push(`<tr class="group"><th colspan="${list.length + 1}">${esc(title)}</th></tr>`);
      for (const label of labels) {
        const cells = groups.map((g) => {
          const row = g.find(([x]) => x === title)?.[1].find(([l]) => l === label);
          return row ? `<td class="${row[2] ? `score ${row[2]}` : ""}">${row[1]}</td>` : `<td class="dim">—</td>`;
        });
        const topic = groups.flatMap((g) => g.find(([x]) => x === title)?.[1] ?? []).find(([l]) => l === label)?.[3];
        rows.push(`<tr><th scope="row" data-explain="${esc(topic ?? "")}">${esc(label)}</th>${cells.join("")}</tr>`);
      }
    }
    el.innerHTML = `<table class="runs side" aria-label="Measurements side by side"><thead><tr><th></th>${list
      .map((t, i) => `<th><b class="run-badge">${i + 1}</b>${esc(t.name)}<span class="sub">${esc(t.env?.browser ?? "")} · ${when(t.createdAt)}</span></th>`)
      .join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
  }

  return {
    show(list) {
      takes = list;
      picked = picked.filter((id) => byId(id));
      render();
    },
    pick(ids) {
      picked = ids.filter((id) => byId(id)).slice(-MAX_PICKED);
      render();
    },
    get picked() {
      return [...picked];
    },
    // The line beside the filters (how much the takes use), kept across re-renders.
    note(text) {
      noteText = text;
      const el = host.querySelector("#storage-use");
      if (el) el.textContent = text;
    },
  };
}
