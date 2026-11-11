// Explanations for everything on the bench. Hovering something with a
// dotted underline shows a short answer in a bubble; right-clicking it shows
// a menu (Learn about it, Copy its name, Open the guide), and Learn opens
// the long explanation in a window. On a touch screen, touching and holding
// anything explained opens the menu, and tapping explained text that isn't
// a control (a label, a measurement's name) shows the bubble; a tap on a
// control still just works it. On the keyboard, ? shows the bubble for the
// focused control, and the context-menu key (or Shift+F10) the menu. A Help
// chip in the app bar turns the bubbles (and underlines) off; the menu works
// either way. Shift+right-click keeps the browser's own menu.
//
// What explains what is one table of selectors (RULES), resolved when an
// event arrives, so the panels, the takes and the log can re-render freely;
// the underline is CSS built from the same table. Words of art inside the
// page's own help text (not the log or a report) become hoverable too.

import { article, plain } from "./explain/lookup.js";
import { articleHTML } from "./explain/render.js";
import { TOPICS } from "./explain/topics.js";
import { storage } from "./bench.js";

const SHOW_AFTER_MS = 450;
// How long a touch is held to open the menu, and how far it may move first (a scroll cancels it).
const HOLD_MS = 500;
const HOLD_SLOP_PX = 10;
const HELP_KEY = "cc:help";

// [selector of the thing explained, its topic id (from the matched element), what gets underlined].
const byId = (map) => Object.entries(map).map(([sel, id]) => [sel, () => id, sel]);
const TAGS = { "not supported here": "tag-unsupported", "not as asked": "tag-not-as-asked", "imported, no files": "tag-imported" };
const RULES = [
  ["[data-explain]", (el) => el.dataset.explain, "[data-explain]"],
  [".param[data-key] > .param-head .key", (el) => el.closest(".param").dataset.key, ".param > .param-head .key"],
  [".param-head .tag, .runs .tag, .take-head .tag", (el) => TAGS[el.textContent.trim()], ".param-head .tag, .runs .tag, .take-head .tag"],
  ["#takes-table thead th", (el) => `col-${el.querySelector("[data-sort]")?.dataset.sort}`, "#takes-table thead th button"],
  ['[role="tab"][id^="tab-"]', (el) => `group-${el.id.slice(4)}`, '[role="tab"][id^="tab-"]'],
  ["#source label", (el) => `source-${el.querySelector("input")?.value}`, "#source label span"],
  ["#view label", (el) => `view-${el.querySelector("input")?.value}`, "#view label span"],
  ["#log-filters [data-filter]", (el) => `log-${el.dataset.filter}`, "#log-filters [data-filter]"],
  ["#log li > b", (el) => (TOPICS[`event-${el.textContent.trim()}`] ? `event-${el.textContent.trim()}` : `log-${el.closest("li").dataset.kind}`), null],
  [".take [data-download]", (el) => `download-${el.dataset.download}`, ".take [data-download]"],
  ...byId({
    "#browser": "chip-browser",
    "#secure": "chip-secure",
    "#perm-camera": "chip-permission",
    "#perm-mic": "chip-permission",
    "#context": "chip-context",
    "#speech": "chip-speech",
    "#help-chip": "help",
    "#status": "status",
    "#camera-device": "camera-device",
    "#mic-device": "mic-device",
    "#mics-1": "mics-1",
    "#cams-1": "cams-1",
    "#cams-2": "cams-2",
    "#mics-2": "mics-2",
    "#sample": "samples",
    "label:has(#file)": "file-input",
    "label:has(#camera-app)": "camera-app",
    "#start": "start",
    "#record": "record",
    "#pause": "pause",
    "#stop": "stop",
    "#close": "close",
    "#whole-file": "whole-file",
    ".take [data-delete]": "delete-take",
    "label:has(#takes-import)": "takes-import",
    "#takes-export": "takes-export",
    "#takes-clear": "takes-clear",
    "#storage-use": "storage-use",
    "#caps-refresh": "caps-refresh",
    "#caps-download": "caps-download",
    "#meters": "meters",
    "#log-clear": "log-clear",
    "#events-h": "events",
    ".brand": "bench-overview",
    '.nav a[href="./"]': "bench-index",
    '.nav a[href="guide.html"]': "guide",
  }),
];
// The chips' and buttons' own text is what's underlined, not their whole box.
const MARK = RULES.map(([, , mark]) => mark)
  .filter(Boolean)
  .map((m) => (/^#(secure|perm-camera|perm-mic|context|speech|help-chip)$/.test(m) ? `${m} .chip-text` : m === "#status" ? "#status .pill-label" : m === "#meters" ? ".meter-name" : m));

// Words of art in the page's own help text, by the topic that explains them.
const TERMS = [
  [/\bPCM\b/, "pcm"], [/\bWAV\b/, "wav"], [/\bdBFS\b/, "dbfs"], [/\bRMS\b/, "rms"], [/\bOpus\b/, "opus"], [/\bAAC\b/, "aac"],
  [/\bWebM\b/, "webm"], [/\bMP4\b/, "mp4"], [/\bMatroska\b/, "matroska"], [/\bVP8\b/, "vp8"], [/\bVP9\b/, "vp9"], [/\bAV1\b/, "av1"],
  [/\bH\.264\b/, "h264"], [/\bWebCodecs\b/, "webcodecs"], [/\bWebRTC\b/, "webrtc"], [/\bAudioWorklet\b/, "audioworklet"],
  [/\bsample rate\b/i, "sample-rate"], [/\bbitrates?\b/i, "bitrate"], [/\bkey frames?\b/i, "key-frame"], [/\bcodecs?\b/i, "codec"],
  [/\bcontainer\b/i, "container"], [/\bsecure context\b/i, "secure-context"], [/\bremux\w*/i, "remux"], [/\bA\/V sync\b/, "av-sync"],
  [/\bOverconstrainedError\b/, "OverconstrainedError"], [/\bChromium\b/, "chromium"],
];
// Where those words are looked for: the page's own explanations, never the log, a report or code.
const TERM_HOSTS = ".param-desc, .group-when, .monitor-empty, .compare .hint, .empty, .xp-dialog .xp-art p";

export function setupExplainers({ bench }) {
  const tip = Object.assign(document.createElement("div"), { id: "xp-tip", className: "xp-tip", hidden: true });
  tip.setAttribute("role", "tooltip");
  const menu = Object.assign(document.createElement("div"), { className: "xp-menu", hidden: true });
  menu.setAttribute("role", "menu");
  const dialog = Object.assign(document.createElement("dialog"), { className: "xp-dialog" });
  document.body.append(tip, menu, dialog);
  const style = document.createElement("style");
  // On a touch screen, holding an explained thing opens the menu, not the system's text selection or link callout.
  const TARGETS = RULES.map(([sel]) => sel).join(", ");
  style.textContent =
    `body.xp-on :is(${MARK.join(", ")}) { text-decoration: underline dotted var(--ink-3); text-underline-offset: 3px; text-decoration-thickness: 1px; }` +
    `@media (pointer: coarse) { :is(${TARGETS}) { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; } }`;
  document.head.append(style);

  // --- Help switch, in the app bar
  let on = storage.get(HELP_KEY) !== "off";
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip help-chip";
  chip.id = "help-chip";
  const showSwitch = () => {
    chip.innerHTML = `<span class="chip-text">Help: ${on ? "on" : "off"}</span>`;
    chip.setAttribute("aria-pressed", String(on));
    document.body.classList.toggle("xp-on", on);
  };
  chip.addEventListener("click", () => {
    on = !on;
    storage.set(HELP_KEY, on ? "on" : "off");
    hideTip();
    showSwitch();
  });
  document.querySelector(".appbar .env")?.prepend(chip);
  showSwitch();

  // --- What's under the pointer
  function resolve(node) {
    if (!(node instanceof Element) || node.closest(".xp-tip, .xp-menu")) return null;
    for (const [sel, id] of RULES) {
      const target = node.closest(sel);
      if (!target) continue;
      const topic = id(target);
      if (topic && article(topic, { bench })) return { target, id: topic };
    }
    return null;
  }

  // --- The bubble
  let timer = null;
  let shown = null;
  let held = null; // [element, its title], moved into the bubble while it shows
  function hideTip() {
    clearTimeout(timer);
    tip.hidden = true;
    shown = null;
    if (held) {
      held[0].setAttribute("title", held[1]);
      held = null;
    }
  }
  function showTip(hit, delay = SHOW_AFTER_MS, { touch = false } = {}) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const a = article(hit.id, { bench });
      // The browser's own tooltip would show beside the bubble: its text moves in while the
      // bubble shows. A chip's or button's own title is live state ("Now: ..."); a row's is
      // its notes, which the long explanation has.
      const titled = hit.target.closest("[title]") ?? hit.target.querySelector("[title]");
      const title = titled?.getAttribute("title");
      if (titled && title) {
        held = [titled, title];
        titled.removeAttribute("title");
      }
      const now = titled === hit.target ? title : null;
      tip.innerHTML = `<b class="xp-tip-name">${a.name}</b><span>${a.short}</span>${now ? `<span class="xp-tip-now">Now: ${now.replace(/</g, "&lt;")}</span>` : ""}<span class="xp-tip-hint">${touch ? "Touch and hold" : "Right-click"} to learn more</span>`;
      tip.hidden = false;
      const r = hit.target.getBoundingClientRect();
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      const left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
      const top = r.bottom + 8 + h < innerHeight ? r.bottom + 8 : Math.max(8, r.top - h - 8);
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
      shown = hit.target;
    }, delay);
  }
  document.addEventListener("pointerover", (e) => {
    if (!on || e.pointerType === "touch" || !menu.hidden || dialog.open) return;
    const hit = resolve(e.target);
    if (!hit) return;
    if (hit.target !== shown) showTip(hit);
  });
  document.addEventListener("pointerout", (e) => {
    // A finger leaves as it lifts: a tapped bubble stays until the next touch.
    if (e.pointerType === "touch") return;
    const hit = resolve(e.target);
    if (hit && !hit.target.contains(e.relatedTarget)) hideTip();
  });
  addEventListener("scroll", hideTip, true);

  // --- The menu
  let menuHit = null;
  function closeMenu() {
    menu.hidden = true;
    menuHit = null;
  }
  function openMenu(hit, x, y) {
    hideTip();
    menuHit = hit;
    const a = article(hit.id, { bench });
    const name = plain(a.name).replace(/ \(.*\)$/, "");
    menu.innerHTML = `
      <button type="button" role="menuitem" data-act="learn">Learn about ${name}</button>
      <button type="button" role="menuitem" data-act="copy">Copy its name</button>
      <button type="button" role="menuitem" data-act="guide">Open the guide</button>`;
    menu.hidden = false;
    menu.style.left = `${Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8))}px`;
    menu.querySelector("button").focus();
  }
  document.addEventListener("contextmenu", (e) => {
    // Android opens a context menu for a held finger too: the hold has already opened ours.
    if (swallow || press) return e.preventDefault();
    if (e.shiftKey || e.target.closest("input, textarea, select, .xp-menu")) return;
    const hit = resolve(e.target);
    if (!hit) return closeMenu();
    e.preventDefault();
    // From the keyboard (the menu key, Shift+F10) the event has no pointer position.
    const r = hit.target.getBoundingClientRect();
    openMenu(hit, e.clientX || r.left, e.clientY || r.bottom + 4);
  });
  menu.addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act || !menuHit) return;
    const { id } = menuHit;
    closeMenu();
    if (act === "learn") openDialog(id);
    if (act === "guide") open(guideUrl(id), "_blank", "noopener");
    if (act === "copy") await navigator.clipboard?.writeText(plain(article(id, { bench }).name)).catch(() => {});
  });
  menu.addEventListener("keydown", (e) => {
    const items = [...menu.querySelectorAll("button")];
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
    }
    if (e.key === "Escape" || e.key === "Tab") closeMenu();
  });
  document.addEventListener("pointerdown", (e) => {
    if (!menu.hidden && !menu.contains(e.target)) closeMenu();
  });

  // --- Touch: hold anything explained for the menu; tap explained text (not a control) for the bubble
  const CONTROLS = "button, a, select, input, textarea, label, summary, [role='tab']";
  // A setting's name is a label, but on a touch screen a tap on it explains the setting rather than
  // working it (a switch's name would otherwise flip the switch).
  const isControl = (el) => Boolean(el.closest(CONTROLS)) && !el.closest(".param-head .key");
  let press = null; // { hit, el, x, y, timer } while a finger is down on something explained
  let swallow = false; // the touch explained something, so the click it ends with mustn't work a control
  const letGo = () => {
    clearTimeout(press?.timer);
    press = null;
  };
  document.addEventListener(
    "pointerdown",
    (e) => {
      swallow = false;
      if (e.pointerType !== "touch") return;
      if (!tip.contains(e.target)) hideTip();
      const hit = resolve(e.target);
      if (!hit) return letGo();
      clearTimeout(press?.timer);
      press = {
        hit,
        el: e.target,
        x: e.clientX,
        y: e.clientY,
        timer: setTimeout(() => {
          swallow = true;
          openMenu(hit, press.x, press.y + 16);
          press = null;
        }, HOLD_MS),
      };
    },
    true,
  );
  document.addEventListener("pointermove", (e) => press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > HOLD_SLOP_PX && letGo(), true);
  document.addEventListener("pointercancel", letGo, true);
  document.addEventListener(
    "pointerup",
    (e) => {
      if (!press || e.pointerType !== "touch") return;
      const { hit, el } = press;
      letGo();
      if (!on || isControl(el)) return;
      showTip(hit, 0, { touch: true });
      swallow = true;
    },
    true,
  );
  // A hold, or a tap that explained, ends without working the control under it.
  document.addEventListener(
    "click",
    (e) => {
      if (!swallow) return;
      swallow = false;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );

  // --- The window
  const guideUrl = (id) => `guide.html#${encodeURIComponent(id)}`;
  let trail = [];
  function openDialog(id, push = true) {
    if (push) trail.push(id);
    const a = article(id, { bench });
    dialog.innerHTML = `
      <div class="xp-dialog-bar">
        <button type="button" class="btn sm" data-back ${trail.length > 1 ? "" : "hidden"}>Back</button>
        <a class="btn sm" href="${guideUrl(id)}" target="_blank" rel="noopener">Open in the guide</a>
        <button type="button" class="btn sm" data-close autofocus>Close</button>
      </div>
      ${articleHTML(a, { link: (rid, name) => `<button type="button" class="xp-link" data-go="${rid}">${name}</button>`, headingLevel: 2 })}`;
    dialog.setAttribute("aria-label", plain(a.name));
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    markTerms(dialog);
  }
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog || e.target.closest("[data-close]")) return dialog.close();
    if (e.target.closest("[data-back]")) {
      trail.pop();
      return openDialog(trail.at(-1), false);
    }
    const go = e.target.closest("[data-go]")?.dataset.go;
    if (go) openDialog(go);
  });
  dialog.addEventListener("close", () => (trail = []));

  // --- Keyboard: ? on a focused control
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideTip();
      closeMenu();
    }
    if (e.key !== "?" || e.target.closest("input[type=text], input[type=search], input:not([type]), textarea")) return;
    const focused = document.activeElement;
    const hit = resolve(focused) ?? resolve(focused?.closest(".param")?.querySelector(".key")) ?? null;
    if (!hit) return;
    e.preventDefault();
    showTip(hit, 0);
  });

  // --- Words of art inside the page's help text
  const scanned = new WeakMap(); // host -> the text it had when last scanned
  function markTerms(root = document) {
    for (const host of root.querySelectorAll(TERM_HOSTS)) {
      if (scanned.get(host) === host.textContent) continue;
      const seen = new Set();
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement.closest("code, a, button, abbr, input, select, textarea, .xp-term") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (let node of nodes) {
        for (const [re, id] of TERMS) {
          if (seen.has(id) || !article(id, { bench })) continue;
          const m = re.exec(node.data);
          if (!m) continue;
          seen.add(id);
          const word = node.splitText(m.index);
          node = word.splitText(m[0].length);
          const abbr = document.createElement("abbr");
          abbr.className = "xp-term";
          abbr.dataset.explain = id;
          abbr.textContent = word.data;
          word.replaceWith(abbr);
        }
      }
      scanned.set(host, host.textContent);
    }
  }
  markTerms();
  // Panels and notes are rendered after load, and again after a download or a run.
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      markTerms();
    });
  }).observe(document.body, { childList: true, subtree: true });

  const api = { openDialog, resolve: (el) => resolve(el)?.id ?? null };
  window.benchExplain = api; // for the browser tests
  return api;
}
