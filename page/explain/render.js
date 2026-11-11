// An explainer article as HTML, for the bench's window and the guide page.
// link(id, text) makes a link to another topic: a button in the window, an
// anchor in the guide.

import { article } from "./lookup.js";

const esc = (s = "") => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function articleHTML(a, { link, headingLevel = 2 } = {}) {
  const h = `h${headingLevel}`;
  const sub = `h${headingLevel + 1}`;
  const section = (title, body) => (body ? `<section class="xp-sec"><${sub}>${title}</${sub}><p>${body}</p></section>` : "");
  const related = (a.related ?? []).map((id) => [id, article(id)]).filter(([, r]) => r);
  return `
    <article class="xp-art">
      <header class="xp-head">
        <span class="xp-kind">${esc(a.kind ?? "")}</span>
        <${h} class="xp-title">${esc(a.name)}</${h}>
        <p class="xp-lede">${a.short}</p>
      </header>
      ${section("What it is", a.what)}
      ${section("How it works", a.how)}
      ${section("Best for", a.best)}
      ${section("In each browser", a.support)}
      ${
        a.sources?.length
          ? `<section class="xp-sec xp-sources"><${sub}>Sources</${sub}><ol>${a.sources
              .map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>${[s.by, s.year, s.where].filter(Boolean).length ? `<span>${esc([s.by, s.year].filter(Boolean).join(", "))}${s.where ? `. ${esc(s.where)}` : ""}</span>` : ""}</li>`)
              .join("")}</ol></section>`
          : ""
      }
      ${related.length ? `<section class="xp-sec"><${sub}>Related</${sub}><div class="xp-related">${related.map(([id, r]) => link(id, r.name)).join("")}</div></section>` : ""}
    </article>`;
}
