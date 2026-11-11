// The guide page (guide.html): every explanation from the bench, by
// section, with a search box. The address's #topic picks the article, so the
// bench's "Open the guide" lands on the one right-clicked.

import { allArticles, article, plain } from "./explain/lookup.js";
import { articleHTML } from "./explain/render.js";

const sections = allArticles();
const list = document.getElementById("guide-list");
const main = document.getElementById("guide-main");
const search = document.getElementById("guide-search");
const count = document.getElementById("guide-count");
const total = sections.reduce((n, s) => n + s.articles.length, 0);
const link = (id, name) => `<a href="#${encodeURIComponent(id)}">${name}</a>`;

function showList(query = "") {
  const q = query.trim().toLowerCase();
  const matches = (a) => !q || `${plain(a.name)} ${plain(a.short)} ${a.id}`.toLowerCase().includes(q);
  let shown = 0;
  list.innerHTML = sections
    .map(({ title, articles }) => {
      const hits = articles.filter(matches);
      shown += hits.length;
      if (!hits.length) return "";
      return `<section class="guide-sec"><h2>${title}</h2><ul>${hits.map((a) => `<li><a href="#${encodeURIComponent(a.id)}" data-id="${a.id}">${plain(a.name)}</a></li>`).join("")}</ul></section>`;
    })
    .join("");
  count.textContent = q ? `${shown} of ${total} topics` : `${total} topics`;
  markCurrent();
}

function markCurrent() {
  const id = decodeURIComponent(location.hash.slice(1));
  for (const a of list.querySelectorAll("a[data-id]")) a.toggleAttribute("aria-current", a.dataset.id === id);
}

function showArticle() {
  const id = decodeURIComponent(location.hash.slice(1)) || "bench-overview";
  const a = article(id);
  main.innerHTML = a
    ? articleHTML(a, { link, headingLevel: 1 })
    : `<div class="xp-art"><h1 class="xp-title">Not found</h1><p class="xp-lede">There's no topic called <code>${id.replace(/</g, "&lt;")}</code>. Search for it on the left.</p></div>`;
  document.title = `${a ? plain(a.name) : "Not found"} · Guide`;
  markCurrent();
  main.focus({ preventScroll: true });
  scrollTo({ top: 0 });
}

search.addEventListener("input", () => showList(search.value));
addEventListener("hashchange", showArticle);
main.tabIndex = -1;
showList();
showArticle();
document.documentElement.dataset.ready = "true"; // page/load-check.js stays quiet
