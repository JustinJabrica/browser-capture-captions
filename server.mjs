// Local static server for the capture bench.
//
//   node server.mjs [port]          (default http://127.0.0.1:8100/)
//   HTTPS=1 HOST=0.0.0.0 node server.mjs
//
// Capture only works in a secure context, which on another device means
// https://. With HTTPS=1 the server uses the certificate npm run cert made
// in .cert/, so a phone, a tablet or another computer on the same network
// can open the bench (it has to trust the certificate's authority first: see
// "Other devices on your network" in the README). HOST=0.0.0.0 listens on
// every network interface instead of this computer only, so nothing whose
// name starts with a dot (.git, .cert and the like) is ever served.
//
// Port 8100, not browser-media-capture's 8090 or
// automatic-speech-recognition-and-diarization's 8080: the three benches
// have files at the same paths (page/app.js and so on), and one origin would
// mean one cache, one localStorage and one set of permissions for all.
//
// Sends cross-origin isolation headers, so the page can run transcription
// with multi-threaded WebAssembly; capture works with or without them.
//
// GET models/index.json lists the speech models downloaded into models/
// (npm run download-model): { models: [folder] }. It is worked out from the
// disk at each request and always answers 200, so the page can ask which
// models are here instead of probing for their files (a 404 logs a console
// error). A static host serves the same path as a file
// (scripts/build-site.mjs writes it). Every file has an ETag (its size and modification time),
// so a browser revalidating its copy gets the file again whenever it changed
// at all.

import { createServer as createHttp } from "node:http";
import { createServer as createHttps } from "node:https";
import { createReadStream, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { modelsIndex } from "./scripts/lib/model-store.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.argv[2] ?? process.env.PORT ?? 8100);
const host = process.env.HOST ?? "127.0.0.1";
const https = Boolean(process.env.HTTPS);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/ogg",
  ".weba": "audio/webm",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mp4": "video/mp4",
  ".m4a": "audio/mp4",
  ".mov": "video/quicktime",
  ".flac": "audio/flac",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

async function handle(req, res) {
  const send = (status, body = "") => {
    res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(body);
  };

  let url, path;
  try {
    url = new URL(req.url, "http://localhost");
    path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
  } catch {
    return send(400, "Bad request");
  }
  if (path !== root && !path.startsWith(root + sep)) return send(403, "Forbidden");
  if (url.pathname === "/models/index.json") {
    const body = JSON.stringify(await modelsIndex().catch(() => ({ models: [] })));
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cross-Origin-Resource-Policy": "same-origin", "Cache-Control": "no-store" });
    return res.end(req.method === "HEAD" ? undefined : body);
  }
  // Nothing whose name starts with a dot is served (.git, and .cert with its keys above all):
  // with HOST=0.0.0.0 any device on the network can ask. The one exception is the local
  // certificate authority's certificate (scripts/make-cert.mjs), which is public, at /ca.pem,
  // for other devices to install and trust.
  const ca = url.pathname === "/ca.pem";
  if (ca) path = join(root, ".cert", "ca.pem");
  else if (path.slice(root.length).split(sep).some((part) => part.startsWith("."))) return send(403, "Forbidden");

  let info = await stat(path).catch(() => null);
  if (info?.isDirectory()) {
    if (!url.pathname.endsWith("/")) {
      res.writeHead(301, { Location: `${url.pathname}/${url.search}` });
      return res.end();
    }
    path = join(path, "index.html");
    info = await stat(path).catch(() => null);
  }
  if (!info?.isFile()) return send(404, "Not found");

  const etag = `"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`;
  const headers = {
    // As a CA certificate, Safari offers to install it as a profile.
    "Content-Type": ca ? "application/x-x509-ca-cert" : (TYPES[extname(path).toLowerCase()] ?? "application/octet-stream"),
    ETag: etag,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "no-cache",
    "Last-Modified": info.mtime.toUTCString(),
    "Accept-Ranges": "bytes",
  };

  // The ETag decides when there is one. Last-Modified has whole seconds only, so it
  // counts as unchanged only when it's exactly the same second.
  const match = req.headers["if-none-match"];
  const since = Date.parse(req.headers["if-modified-since"] ?? "");
  const unchanged = match ? match.split(",").some((t) => t.trim() === etag) : since && Math.floor(info.mtimeMs / 1000) === Math.floor(since / 1000);
  if (unchanged) {
    res.writeHead(304, headers);
    return res.end();
  }

  let start = 0;
  let end = info.size - 1;
  let status = 200;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (range && (range[1] || range[2])) {
    start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
    end = range[1] && range[2] ? Math.min(Number(range[2]), end) : end;
    if (start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${info.size}` });
      return res.end();
    }
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
  }
  headers["Content-Length"] = end - start + 1;

  res.writeHead(status, headers);
  if (req.method === "HEAD") return res.end();
  createReadStream(path, { start, end }).pipe(res);
}

let server;
if (https) {
  let key, cert;
  try {
    key = readFileSync(join(root, ".cert", "key.pem"));
    cert = readFileSync(join(root, ".cert", "cert.pem"));
  } catch {
    console.error("HTTPS=1 needs a certificate: run npm run cert first.");
    process.exit(1);
  }
  server = createHttps({ key, cert }, handle);
} else {
  server = createHttp(handle);
}

server.listen(port, host, () => {
  const scheme = https ? "https" : "http";
  console.log(`Serving ${root}`);
  console.log(`Capture bench: ${scheme}://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}/`);
  if (host === "0.0.0.0") {
    for (const list of Object.values(networkInterfaces())) {
      for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) console.log(`  on the network: ${scheme}://${a.address}:${port}/`);
    }
    if (!https) console.log("  (other devices need https:// to capture: HTTPS=1, after npm run cert)");
    else console.log("  other devices trust it once they install /ca.pem: see \"Other devices on your network\" in the README");
  }
});
