// The bench's building blocks (from the
// automatic-speech-recognition-and-diarization benches): icons, the status pill,
// alerts, the file picker and drop target, the parameter panel, the events
// log, chips, and copy and download.

export const $ = (id) => document.getElementById(id);

export const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="page/icons.svg#${name}"></use></svg>`;

// 75.3 -> "1:15.3"
export const clock = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
// 4830 -> "4.8 s"
export const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;
// 75300 -> "1:15"
const minutes = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// localStorage can be missing or blocked (private windows, strict settings).
export const storage = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};

// --- Status pill --------------------------------------------------------------

// kind is idle, starting, previewing, recording, paused, analysing, done or
// error. The detail shows the running timer unless set() is given one.
export function createStatus(el) {
  const label = el.querySelector(".pill-label");
  const detail = el.querySelector(".pill-detail");
  let since = 0;
  let ticker = 0;
  let fixed = null;
  const tick = () => {
    if (fixed === null) detail.textContent = since ? minutes(performance.now() - since) : "";
  };
  return {
    get kind() {
      return el.dataset.kind;
    },
    set(kind, text, extra = null) {
      el.dataset.kind = kind;
      label.textContent = text;
      fixed = extra;
      if (extra !== null) detail.textContent = extra;
      else tick();
    },
    startTimer() {
      since = performance.now();
      clearInterval(ticker);
      ticker = setInterval(tick, 250);
      tick();
    },
    // Stops the timer and returns how long it ran, in ms.
    stopTimer() {
      clearInterval(ticker);
      const ms = since ? performance.now() - since : 0;
      since = 0;
      return ms;
    },
  };
}

// --- Alerts ---------------------------------------------------------------------

// What each error means, and what to do about it. getUserMedia(),
// getDisplayMedia() and MediaRecorder reject with these DOMException names.
const ERRORS = {
  NotAllowedError: [
    "Access was refused",
    "The camera, microphone or screen was blocked, or the picker was cancelled. To allow it, use the icon at the left of the address bar, then press Start again.",
  ],
  NotFoundError: ["Nothing to capture", "No camera or microphone matches. Check that one is connected, or turn off the one that's missing under <b>Each start</b>."],
  NotReadableError: [
    "The device couldn't be started",
    "Another app (or another tab) may be using it, or the system blocked it. Close the other app, or check the operating system's privacy settings.",
  ],
  OverconstrainedError: [
    "No device can do that",
    "With <code>strict</code> on, the browser must match every value exactly. Turn <code>strict</code> off to accept the closest it can do, or change the setting named below.",
  ],
  SecurityError: ["The browser blocked capture here", "Capture needs a secure context: <code>https://</code>, or <code>http://localhost</code> / <code>127.0.0.1</code>."],
  InvalidAccessError: ["Capture must start from a click", "The browser only shows its screen picker straight after a click. Press Start again."],
  InvalidStateError: [
    "Not now",
    "<code>getDisplayMedia()</code> only works straight after a click: press Start again. Otherwise something is already running; stop it first.",
  ],
  NotSupportedError: ["Not supported here", "This browser can't do that. The Browser view lists what it supports."],
  AbortError: ["Capture was cut short", "The browser stopped the capture before it started. Try again."],
  NothingRequestedError: ["Nothing was asked for", "Turn on at least one of <code>video</code> and <code>audio</code> under <b>Each start</b>."],
  OneAtATimeError: [
    "One device at a time here",
    "This browser stopped the first device as the second one opened, so it can't capture both at once. Safari on iOS does this with two different cameras. Pick the same one for both sides, or use <b>Camera &amp; mic</b>.",
  ],
  EncodingError: ["Recording failed", "The browser's encoder stopped. Try another format under <b>Each record</b>."],
};

// Shows one alert at a time in host. kind is error or warn.
export function showAlert(host, { kind = "error", title, hint = "", detail = "" }) {
  const alert = document.createElement("div");
  alert.className = `alert is-${kind}`;
  alert.setAttribute("role", kind === "error" ? "alert" : "status");
  alert.innerHTML =
    `${icon("alert")}<div class="alert-body"><b>${esc(title)}</b>${hint ? `<p>${hint}</p>` : ""}` +
    `${detail ? `<code>${esc(detail)}</code>` : ""}</div>` +
    `<button type="button" class="icon-btn" aria-label="Dismiss">${icon("x")}</button>`;
  alert.querySelector("button").addEventListener("click", () => alert.remove());
  host.replaceChildren(alert);
}

// Explains an error by its name (a DOMException's, or an Error's). An
// OverconstrainedError names the constraint it couldn't meet.
export function showError(host, err) {
  const name = err?.name ?? "Error";
  const [title, hint] = ERRORS[name] ?? ["Something went wrong", "The message below has the details. The browser console may have more."];
  const message = [err?.constraint && `constraint: ${err.constraint}`, err?.message].filter(Boolean).join(" · ");
  showAlert(host, { title, hint, detail: message ? `${name}: ${message}` : name });
}

// --- File source --------------------------------------------------------------------

// A list of samples plus the user's own file, picked with Browse or dropped on
// the page. source() is that File or a sample's URL.
export function createFilePicker({ select, input, onPick }) {
  let file = null;
  const own = document.createElement("option");
  own.value = "";
  const use = (f) => {
    file = f;
    own.textContent = `Your file: ${f.name}`;
    if (!own.isConnected) select.prepend(own);
    select.value = "";
    onPick();
  };
  input.addEventListener("change", () => input.files[0] && use(input.files[0]));
  select.addEventListener("change", onPick);
  return {
    use,
    source: () => select.value || file,
    name: () => (select.value ? select.value.split("/").pop() : file.name),
  };
}

// Shows a drop target while a file is dragged over the page.
export function setupDrop(overlay, onFile, onReject) {
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes("Files");
  addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    overlay.hidden = false;
  });
  addEventListener("dragover", (e) => hasFiles(e) && e.preventDefault());
  addEventListener("dragleave", (e) => {
    if (hasFiles(e) && --depth <= 0) [depth, overlay.hidden] = [0, true];
  });
  addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    [depth, overlay.hidden] = [0, true];
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!file.type || /^(audio|video)\//.test(file.type)) onFile(file);
    else onReject(file);
  });
}

// --- Parameter panel ------------------------------------------------------------------

// Builds the tabbed parameter panel: one tab per group. Values of ordinary
// groups are remembered across visits and reported through onChange. `reload`
// groups start from group.applied (what the page loaded with) and change only
// through Apply & reload, which calls group.onApply(values).
//
// A group's params may have { section: "name" } entries among them: headings.
// A param is { key, type, def, initial?, desc?, only?, tag?, ... }, where
// type is switch, text, select, number or range. def is the API default
// (shown, and restored by Reset); initial is the bench's first-visit value.
// only lists the sources it applies to (it's hidden for the others), and tag
// is a short note shown by its name, such as "not supported here".
export function createParams({ tabList, panelHost, groups, storageKey, onChange = () => {} }) {
  const saved = storage.get(storageKey) ?? {};
  const fields = new Map();

  for (const group of groups) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.id = `tab-${group.id}`;
    tab.dataset.group = group.id;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `panel-${group.id}`);
    tab.innerHTML = `${esc(group.title)}<span class="tab-dot" aria-hidden="true"></span>`;
    tabList.append(tab);

    const panel = document.createElement("section");
    panel.id = `panel-${group.id}`;
    panel.className = "params-panel";
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    panel.hidden = true;
    panel.innerHTML = `
      <div class="group-head">
        <code class="badge${group.reload ? " is-reload" : ""}">${group.reload ? icon("reload") : ""}${esc(group.badge)}</code>
        <button type="button" class="link" data-reset>Reset to defaults</button>
      </div>
      <p class="group-when">${group.when}</p>
      ${group.status ?? ""}
      <div class="params">${group.params.map(paramHTML).join("")}</div>
      ${group.paths ? `<details class="paths"><summary>${icon("chevron")}Paths</summary><div class="params">${group.paths.map(paramHTML).join("")}</div></details>` : ""}
      ${group.reload ? `<div class="applybar"><span class="pending"></span><button type="button" class="btn sm" data-discard>Discard</button><button type="button" class="btn sm primary" data-apply>${icon("reload")}Apply &amp; reload</button></div>` : ""}`;
    panelHost.append(panel);

    const groupFields = [];
    for (const p of [...group.params, ...(group.paths ?? [])].filter((p) => p.key)) {
      const el = panel.querySelector(`[data-key="${p.key}"]`);
      const field = { p, group, el, ...accessors(p, el) };
      if (group.reload) field.applied = group.applied?.[p.key] ?? p.def;
      field.set(group.reload ? field.applied : p.key in saved ? saved[p.key] : (p.initial ?? p.def));
      fields.set(p.key, field);
      groupFields.push(field);
    }

    const commit = (field) => {
      if (group.reload) return showPending();
      saved[field.p.key] = field.get();
      storage.set(storageKey, saved);
      onChange(field.p.key, field.get());
    };
    const showPending = () => {
      let count = 0;
      for (const f of groupFields) {
        const changed = !same(f.get(), f.applied);
        f.el.querySelector(".changed").hidden = !changed;
        count += changed;
      }
      panel.querySelector(".pending").innerHTML = count
        ? `<b>${count} change${count === 1 ? "" : "s"}</b> waiting for a reload.`
        : "These are the values the page loaded with.";
      panel.querySelector("[data-apply]").disabled = panel.querySelector("[data-discard]").disabled = !count;
      tab.classList.toggle("has-pending", count > 0);
    };

    panel.addEventListener("input", (e) => {
      const el = e.target.closest("[data-key]");
      if (!el) return;
      const range = e.target.closest(".range");
      if (range) {
        const [slider, number] = range.querySelectorAll("input");
        if (e.target === slider) number.value = slider.value;
        else if (number.value !== "") slider.value = number.value;
      }
      commit(fields.get(el.dataset.key));
    });
    panel.addEventListener("click", (e) => {
      if (e.target.closest("[data-reset]")) {
        for (const f of groupFields) {
          f.set(f.p.def);
          if (!group.reload) commit(f);
        }
        if (group.reload) showPending();
      } else if (e.target.closest("[data-discard]")) {
        for (const f of groupFields) f.set(f.applied);
        showPending();
      } else if (e.target.closest("[data-apply]")) {
        group.onApply(Object.fromEntries(groupFields.map((f) => [f.p.key, f.get()])));
      }
    });
    if (group.reload) showPending();
  }

  // Tabs: click, or arrow keys between the visible ones.
  const visibleTabs = () => [...tabList.children].filter((t) => t.offsetParent !== null);
  const select = (id, focus = false) => {
    for (const t of tabList.children) {
      const on = t.dataset.group === id;
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
      document.getElementById(`panel-${t.dataset.group}`).hidden = !on;
      if (on && focus) t.focus();
    }
    storage.set(`${storageKey}:tab`, id);
  };
  tabList.addEventListener("click", (e) => {
    const t = e.target.closest("[role=tab]");
    if (t) select(t.dataset.group);
  });
  tabList.addEventListener("keydown", (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    const tabs = visibleTabs();
    const i = tabs.indexOf(document.activeElement);
    select(tabs[(i + step + tabs.length) % tabs.length].dataset.group, true);
  });
  const remembered = storage.get(`${storageKey}:tab`);
  const tabs = visibleTabs();
  select((tabs.find((t) => t.dataset.group === remembered) ?? tabs[0] ?? tabList.children[0]).dataset.group);

  return {
    get: (key) => fields.get(key).get(),
    values: () => Object.fromEntries([...fields].map(([key, f]) => [key, f.get()])),
  };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const attr = (name, value) => (value == null ? "" : ` ${name}="${esc(value)}"`);

function paramHTML(p) {
  // { section: "…" } among a group's params is a heading over those that follow.
  if (p.section) return `<h3 class="param-section">${esc(p.section)}</h3>`;
  const id = `p-${p.key}`;
  // A text box, a slider, or a list whose choices are long, goes under its name, across the row.
  const block = ["text", "range"].includes(p.type) || (p.type === "select" && p.options.some((o) => String(o[1]).length > 26));
  const key = `<label class="key" for="${id}">${p.label ?? p.key}</label>`;
  const only = p.only ? ` only ${p.only.map((s) => `only-${s}`).join(" ")}` : "";
  const def =
    p.defLabel ??
    (p.type === "switch" ? (p.def ? "on" : "off") : p.def === "" || p.def == null ? "not set" : `${p.def}${p.unit ? ` ${p.unit}` : ""}`);
  return `
    <div class="param${block ? " is-block" : ""}${only}" data-key="${p.key}">
      <div class="param-head">
        ${key}<span class="changed" hidden>changed</span>${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ""}
      </div>
      <div class="param-ctl">${controlHTML(p, id)}</div>
      <p class="param-desc">${p.desc ?? ""} <span class="def">Default:&nbsp;${esc(def)}</span></p>
    </div>`;
}

function controlHTML(p, id) {
  const number = (more) =>
    `<span class="numfield"><input type="number"${more}${attr("min", p.min)}${attr("max", p.max)}${attr("step", p.step ?? 1)}` +
    `${attr("placeholder", p.placeholder)}>${p.unit ? `<span class="unit">${p.unit}</span>` : ""}</span>`;
  switch (p.type) {
    case "switch":
      return `<span class="switch"><input type="checkbox" role="switch" id="${id}"><span></span></span>`;
    case "select":
      return `<select class="input" id="${id}">${p.options.map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join("")}</select>`;
    case "text": {
      const list = p.list ? `${id}-list` : null;
      return (
        `<input class="input mono" type="text" id="${id}" spellcheck="false" autocomplete="off"${attr("list", list)}${attr("placeholder", p.placeholder)}>` +
        (list ? `<datalist id="${list}">${p.list.map((v) => `<option value="${esc(v)}"></option>`).join("")}</datalist>` : "")
      );
    }
    case "number":
      return number(` id="${id}"`);
    case "range":
      return `<div class="range"><input type="range" id="${id}"${attr("min", p.min)}${attr("max", p.max)}${attr("step", p.step ?? 1)}>${number(` aria-label="${p.key} value"`)}</div>`;
  }
  return "";
}

function accessors(p, el) {
  const input = el.querySelector("input, select");
  switch (p.type) {
    case "switch":
      return { get: () => input.checked, set: (v) => (input.checked = Boolean(v)) };
    case "text":
    case "select":
      return { get: () => input.value.trim(), set: (v) => (input.value = v ?? "") };
    case "number":
      return { get: () => (input.value === "" ? null : Number(input.value)), set: (v) => (input.value = v ?? "") };
    case "range": {
      const [slider, number] = el.querySelectorAll("input");
      return {
        get: () => (number.value === "" || Number.isNaN(Number(number.value)) ? p.def : Number(number.value)),
        set: (v) => (slider.value = number.value = v),
      };
    }
  }
}

// --- Events log ---------------------------------------------------------------------------

// One row per call or event, timed from the latest mark(). kind is call,
// life, result or error; the filter buttons show one kind at a time.
export function createLog({ list, count, filters, clear, max = 400 }) {
  let t0 = 0;
  let total = 0;
  filters.addEventListener("click", (e) => {
    const button = e.target.closest("[data-filter]");
    if (!button) return;
    for (const b of filters.querySelectorAll("[data-filter]")) b.setAttribute("aria-pressed", b === button);
    list.dataset.filter = button.dataset.filter;
  });
  clear.addEventListener("click", () => {
    list.replaceChildren();
    count.textContent = total = 0;
  });
  return {
    mark() {
      t0 = performance.now();
    },
    add(kind, name, detail = "") {
      const item = document.createElement("li");
      item.className = `is-${kind}`;
      item.dataset.kind = kind === "call" ? "life" : kind;
      const time = document.createElement("time");
      time.textContent = t0 ? `${((performance.now() - t0) / 1000).toFixed(2)}s` : "";
      const b = document.createElement("b");
      b.textContent = name;
      const text = document.createElement("span");
      text.textContent = detail;
      item.append(time, b, text);
      // Follow new rows only when already at the bottom, so reading isn't interrupted.
      const atEnd = list.scrollTop + list.clientHeight >= list.scrollHeight - 8;
      list.append(item);
      while (list.children.length > max) list.firstChild.remove();
      count.textContent = ++total;
      if (atEnd) list.scrollTop = list.scrollHeight;
    },
  };
}

// Drag the handle (or focus it and use the arrow keys) to resize target: the
// docked log (axis "y") grows as its top edge moves up, the side panel (axis
// "x") as its left edge moves left. The size goes in a CSS custom property,
// and the stylesheet clamps it and decides where it applies.
export function setupResize(handle, target, { axis, property, key }) {
  const measure = () => (axis === "x" ? target.offsetWidth : target.offsetHeight);
  const size = (px) => {
    target.style.setProperty(property, `${Math.round(px)}px`);
    target.style.setProperty(property, `${measure()}px`); // as clamped, so dragging back responds at once
    storage.set(key, measure());
  };
  const saved = storage.get(key);
  if (saved) target.style.setProperty(property, `${saved}px`);
  const at = (e) => (axis === "x" ? e.clientX : e.clientY);
  handle.addEventListener("pointerdown", (e) => {
    const [start, from] = [at(e), measure()];
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add(`resizing-${axis}`);
    const move = (ev) => size(from + start - at(ev));
    handle.addEventListener("pointermove", move);
    handle.onpointerup = handle.onpointercancel = () => {
      handle.removeEventListener("pointermove", move);
      document.body.classList.remove(`resizing-${axis}`);
    };
  });
  handle.addEventListener("keydown", (e) => {
    const step = (axis === "x" ? { ArrowLeft: 24, ArrowRight: -24 } : { ArrowUp: 24, ArrowDown: -24 })[e.key];
    if (!step) return;
    e.preventDefault();
    size(measure() + step);
  });
}

// --- Chips ---------------------------------------------------------------------------------

// A status chip in the app bar. state is unloaded, loading, ready, warn or
// error, which colours its dot.
export function setChip(chip, state, text, title = "") {
  chip.dataset.state = state;
  chip.querySelector(".chip-text").textContent = text;
  chip.title = title;
}
// Closes open <details class="menu"> on a click elsewhere, or Escape.
export function setupMenus() {
  const close = (keep) => {
    for (const menu of document.querySelectorAll("details.menu[open]")) if (menu !== keep) menu.open = false;
  };
  document.addEventListener("click", (e) => close(e.target.closest("details.menu")));
  document.addEventListener("keydown", (e) => e.key === "Escape" && close());
}

// --- Copy and download -------------------------------------------------------------------------

// Shows text on a button's .label for a moment.
export function flashLabel(button, text) {
  const label = button.querySelector(".label");
  label.dataset.text ??= label.textContent;
  label.textContent = text;
  clearTimeout(label.timer);
  label.timer = setTimeout(() => (label.textContent = label.dataset.text), 1500);
}

export async function copyText(button, text) {
  try {
    await navigator.clipboard.writeText(text);
    flashLabel(button, "Copied");
  } catch {
    flashLabel(button, "Couldn't copy");
  }
}

// Saves a Blob, or text as a file of the given type.
export function download(name, data, type = "text/plain") {
  const blob = data instanceof Blob ? data : new Blob([data], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// "test/fixtures/fox.wav" -> "fox"
export const baseName = (name) => name.split("/").pop().replace(/\.[^.]+$/, "") || "take";

// 1536000 -> "1.5 MB"
export const bytes = (n) => (n == null ? "—" : n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} kB` : `${n} B`);
