// A classic script, loaded before the page's modules. If the page's code
// hasn't started a few seconds after the page loads (it sets
// <html data-ready> when it has), this says why, rather than leave a page
// whose buttons do nothing. The usual reasons: the page was opened as a file
// (browsers only run its modules when they come from a server), a file
// failed to load, or an error stopped the code.

(() => {
  const errors = [];
  addEventListener(
    "error",
    (e) => {
      const t = e.target;
      if (t && t !== window && (t.src || t.href)) errors.push(`Couldn't load ${t.src || t.href}`);
      else if (e.message) errors.push(`${e.message}${e.filename ? ` (${e.filename.split("/").slice(-2).join("/")}, line ${e.lineno})` : ""}`);
    },
    true,
  );
  addEventListener("unhandledrejection", (e) => errors.push(String(e.reason?.message ?? e.reason)));
  addEventListener("load", () => setTimeout(check, 4000));

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const ADDRESS = "http://127.0.0.1:8100/";

  function check() {
    if (document.documentElement.dataset.ready) return;
    const file = location.protocol === "file:";
    const title = file ? "Open the bench from its server" : "The page's code didn't start";
    const hint = file
      ? `This page was opened as a file, and browsers only run its code when it comes from a server. Run <code>npm start</code> in the project folder, then open <a href="${ADDRESS}">${ADDRESS}</a>.`
      : errors.length
        ? "Reload with Ctrl+Shift+R (Cmd+Shift+R on a Mac). If a file failed to load, an ad or tracker blocker may have blocked it: turn it off for this page. The first problem the browser reported is below, and the console (F12) has the rest."
        : `No error was reported. Reload with Ctrl+Shift+R, and check that this is the bench's own server: <code>npm start</code> prints its address (${ADDRESS}).`;
    const alert = document.createElement("div");
    alert.className = "alert";
    alert.setAttribute("role", "alert");
    alert.innerHTML =
      `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.4v.1"/></svg>` +
      `<div class="alert-body"><b>${title}</b><p>${hint}</p>${!file && errors.length ? `<code>${esc(errors[0])}</code>` : ""}</div><span></span>`;
    const host = document.getElementById("alerts");
    if (host) host.replaceChildren(alert);
    else {
      alert.style.margin = "12px";
      document.body.prepend(alert);
    }
  }
})();
