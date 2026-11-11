// End-to-end tests in a real browser, driven by Puppeteer: Firefox over
// WebDriver BiDi, Chromium browsers over CDP. Start the server first:
//
//   node server.mjs
//   node test/browser.test.mjs [firefox|edge|chrome|brave|chrome-for-testing]   (default firefox)
//
// Fake devices stand in for the camera and microphone, and prompts are
// granted without asking. Chromium's fake microphone plays fox.wav on a loop
// and its fake camera plays the test pattern (scripts/make-fixtures.mjs), so
// takes can be checked against what went in; Firefox's fake devices play a
// tone and a coloured picture.
//
// The caption tests need a speech model on the server, so that no test waits
// on a download: npm run download-model whisper-tiny.en. Without it they are
// skipped, and the run says so.
//
// Env: BROWSER_PATH (browser binary), BASE_URL, HEADFUL=1 to watch it run,
// DUMPIO=1 for the browser's logs.

import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PATTERN_Y4M, writePattern } from "../scripts/make-fixtures.mjs";

const NAME = process.argv[2] ?? "firefox";
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8100/";
const isFirefox = NAME === "firefox";

const programFiles = ["C:/Program Files", "C:/Program Files (x86)", `${process.env.LOCALAPPDATA}`];
const INSTALLS = {
  firefox: {
    win32: ["Firefox Developer Edition/firefox.exe", "Mozilla Firefox/firefox.exe"],
    darwin: ["Firefox Developer Edition.app/Contents/MacOS/firefox", "Firefox.app/Contents/MacOS/firefox"],
    linux: ["/usr/bin/firefox-developer-edition", "/usr/bin/firefox"],
  },
  edge: {
    win32: ["Microsoft/Edge/Application/msedge.exe"],
    darwin: ["Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
    linux: ["/usr/bin/microsoft-edge"],
  },
  chrome: {
    win32: ["Google/Chrome/Application/chrome.exe"],
    darwin: ["Google Chrome.app/Contents/MacOS/Google Chrome"],
    linux: ["/usr/bin/google-chrome"],
  },
  brave: {
    win32: ["BraveSoftware/Brave-Browser/Application/brave.exe"],
    darwin: ["Brave Browser.app/Contents/MacOS/Brave Browser"],
    linux: ["/usr/bin/brave-browser"],
  },
};

async function findBrowser() {
  if (process.env.BROWSER_PATH) return process.env.BROWSER_PATH;
  // Chrome for Testing lives in Puppeteer's cache, not a system install
  // (scripts/install-chrome-for-testing.mjs puts it there); the newest one there runs.
  if (NAME === "chrome-for-testing") {
    const { getInstalledBrowsers } = await import("@puppeteer/browsers");
    const cacheDir = process.env.PUPPETEER_CACHE_DIR ?? join(homedir(), ".cache", "puppeteer");
    const builds = (await getInstalledBrowsers({ cacheDir })).filter((b) => b.browser === "chrome");
    const newest = builds.sort((a, b) => b.buildId.localeCompare(a.buildId, "en", { numeric: true }))[0];
    if (!newest) throw new Error(`no Chrome for Testing in ${cacheDir}: node scripts/install-chrome-for-testing.mjs`);
    return newest.executablePath;
  }
  const paths = INSTALLS[NAME]?.[process.platform];
  if (!paths) throw new Error(`Unknown browser "${NAME}"; set BROWSER_PATH`);
  const roots = { win32: programFiles, darwin: ["/Applications"], linux: [""] }[process.platform];
  for (const path of paths) {
    for (const root of roots) {
      const full = root ? `${root}/${path}` : path;
      if (existsSync(full)) return full;
    }
  }
  throw new Error(`${NAME} not found; set BROWSER_PATH`);
}

const fixture = (name) => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));
if (!isFirefox && !existsSync(PATTERN_Y4M)) writePattern();

const browser = await puppeteer.launch({
  browser: isFirefox ? "firefox" : "chrome",
  executablePath: await findBrowser(),
  headless: !process.env.HEADFUL,
  dumpio: Boolean(process.env.DUMPIO),
  extraPrefsFirefox: {
    // Fake camera and microphone, granted without a prompt.
    "media.navigator.streams.fake": true,
    "media.navigator.permission.disabled": true,
    // Let test pages play audio without a click.
    "media.autoplay.default": 0,
    "media.autoplay.block-webaudio": false,
  },
  args: isFirefox
    ? []
    : [
        // Fake devices that play fox.wav and the test pattern, granted without a prompt.
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-audio-capture=${fixture("fox.wav")}`,
        `--use-file-for-fake-video-capture=${PATTERN_Y4M}`,
        // Screen capture without the picker: this tab.
        "--auto-accept-this-tab-capture",
        "--autoplay-policy=no-user-gesture-required",
      ],
});

const consoleErrors = [];
async function openPage(path = "") {
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`${path || "/"}: ${msg.text()} ${msg.location()?.url ?? ""}`.trim());
  });
  page.on("pageerror", (err) => consoleErrors.push(`${path || "/"}: ${err.message}`));
  await page.goto(new URL(path, BASE).href);
  return page;
}

const results = [];
async function test(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)${detail ? `\n      ${detail}` : ""}`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`FAIL  ${name}\n      ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const near = (x, y, tolerance) => x != null && Math.abs(x - y) <= tolerance;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const page = await openPage("");
await page.evaluate(async () => {
  localStorage.clear();
  const { clearTakes } = await import("./page/takes.js");
  await clearTakes();
});
await page.reload();
await page.waitForFunction(() => window.captureBench?.state() === "idle");

// Captions are on by default. The capture tests run without them, as the
// capture bench they came from did; the caption tests turn them on.
const CAPTION_MODEL = "whisper-tiny.en";
const hasModel = await page.evaluate(async (id) => {
  const { localModels } = await import("./page/captions.js");
  const { modelDir, resolve } = await import("./src/speech/registry.js");
  return (await localModels()).includes(modelDir(resolve(id)));
}, CAPTION_MODEL);

// Sets bench parameters the way a person would, through their controls.
async function setParams(values) {
  await page.evaluate((values) => {
    for (const [key, value] of Object.entries(values)) {
      const el = document.getElementById(`p-${key}`);
      if (!el) throw new Error(`No parameter ${key}`);
      if (el.type === "checkbox") el.checked = Boolean(value);
      else el.value = value ?? "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, values);
}

// Records for about ms with the given source, then stops and waits for the
// take's analysis. Returns the take's report. A source that stops by itself
// (a file reaching its end) is waited for instead when ms is null.
async function recordTake(source, ms, { timeout = 60000 } = {}) {
  const before = await page.evaluate(() => window.captureBench.latest?.id ?? null);
  await page.evaluate((s) => window.captureBench.useSource(s), source);
  await page.click("#record");
  // Over WebDriver BiDi the click can return before the page has handled it, so first
  // wait for the bench to leave idle (or show why it couldn't).
  await page.waitForFunction(() => window.captureBench.state() !== "idle" || document.querySelector("#alerts").textContent.trim() !== "", { timeout: 5000 });
  await page.waitForFunction(() => window.captureBench.state() === "recording" || document.querySelector("#alerts").textContent.trim() !== "", { timeout: 20000 });
  const opened = await page.evaluate(() => window.captureBench.state());
  if (opened !== "recording") {
    const alert = await page.$eval("#alerts", (a) => a.textContent.trim()).catch(() => "");
    throw new Error(`the source didn't open: ${alert}`);
  }
  if (ms != null) {
    await sleep(ms);
    await page.click("#stop");
  }
  await page.waitForFunction((id) => window.captureBench.latest && window.captureBench.latest.id !== id && window.captureBench.state() !== "analysing", { timeout }, before);
  return page.evaluate(() => window.captureBench.latest);
}

async function closeSource() {
  if (await page.$eval("#close", (b) => !b.disabled)) await page.click("#close");
  await page.waitForFunction(() => window.captureBench.state() === "idle");
}

// The checks every recorded take should pass.
function checkTake(t, seconds) {
  const a = t.analysis;
  assert(a.file.size > 0, "the file is empty");
  assert(a.file.probe, `the file couldn't be read: ${a.file.probeError}`);
  // Ogg has no header for a duration (players read the last page's granule position), so only it may lack both.
  assert(a.file.declaresDuration || a.file.remuxed || a.file.probe.container === "Ogg", `${a.file.probe.container}: no declared duration and no seekable copy`);
  // A take that stopped early says why, when the recorder knows.
  assert(near(t.wallS, seconds, 1), `recorded ${t.wallS} s, expected about ${seconds}${t.recorder?.error ? ` (the recorder stopped: ${t.recorder.error})` : ""}`);
  assert(near(a.decoded?.duration, t.wallS, 0.5), `decoded ${a.decoded?.duration} s against ${t.wallS} s recorded`);
  assert(near(a.tap?.frames / a.tap?.sampleRate, t.wallS, 0.5), `the tap holds ${a.tap?.frames} frames at ${a.tap?.sampleRate} Hz`);
  assert(near(a.extracted?.frames, a.decoded.duration * 16000, 160), `16 kHz copy: ${a.extracted?.frames} samples for ${a.decoded.duration} s`);
  assert(a.tap.levels[0].rmsDb > -60, `the tap is silent (${a.tap.levels[0].rmsDb} dBFS)`);
  // Headless browsers start their encoders slowly, so a little is often missing at either end.
  assert(a.match && Math.abs(a.match.lagS) < 0.25 && Math.abs(a.match.endS) < 0.25, `starts ${a.match?.lagS} s, ends ${a.match?.endS} s against the tap`);
  assert(a.match.waveScore > 0.9, `waveform match ${a.match.waveScore}`);
  return `${t.recorder.mimeType} · ${(a.file.size / 1e3).toFixed(0)} kB · starts ${Math.round(a.match.lagS * 1000)} ms, ends ${Math.round(a.match.endS * 1000)} ms · match ${a.match.waveScore.toFixed(3)}${a.file.remuxed ? " · remuxed" : ""} · start event ${t.recorder.startMs} ms`;
}

// Copies a take's sound and its picture out on their own (as the card's
// "audio only" and "video only" do) and checks each is a copy, not a
// re-encoding: one track, with the same codec, packets and key frames,
// starting when it did in the recording. And that each plays: the sound
// decodes to the recording's length, and the picture loads in a <video>.
async function checkSolo(take) {
  const r = await page.evaluate(async (id) => {
    const [{ takeMedia }, { extractTrack, probe }, { decodeAudio }] = await Promise.all([import("./page/takes.js"), import("./src/container.js"), import("./src/audio.js")]);
    const { file } = await takeMedia(id);
    const out = { whole: (await probe(file)).probe, decoded: (await decodeAudio(file, 48000))?.duration ?? null };
    for (const kind of ["audio", "video"]) {
      const solo = await extractTrack(file, kind);
      out[kind] = solo && { ext: solo.ext, type: solo.blob.type, probe: (await probe(solo.blob)).probe };
      if (kind === "audio" && solo) out.audio.decoded = (await decodeAudio(solo.blob, 48000))?.duration ?? null;
      if (kind === "video" && solo) {
        const video = Object.assign(document.createElement("video"), { muted: true, preload: "auto", src: URL.createObjectURL(solo.blob) });
        out.video.loads = await new Promise((resolve) => {
          video.oncanplay = () => resolve(true);
          video.onerror = () => resolve(video.error?.message || "error");
          setTimeout(() => resolve("timed out"), 10000);
        });
        URL.revokeObjectURL(video.src);
      }
    }
    return out;
  }, take.id);
  const details = [];
  // A copy counts its time from where the recording starts: its earliest track's first packet, which is
  // usually 0. (The WebCodecs recorder's first video frame can arrive a frame late, and then nothing is at 0.)
  const recordingStart = Math.max(0, Math.min(...r.whole.tracks.map((t) => t.firstTimestamp).filter(Number.isFinite)));
  for (const kind of ["audio", "video"]) {
    const solo = r[kind];
    assert(solo, `no ${kind}-only file`);
    const [track, ...others] = solo.probe.tracks;
    const original = r.whole.tracks.find((t) => t.type === kind);
    assert(track?.type === kind && !others.length, `${kind} only holds ${solo.probe.tracks.map((t) => t.type).join(", ")}`);
    assert(track.codec === original.codec, `${kind}: ${track.codec}, from ${original.codec}`);
    assert(track.packets === original.packets, `${kind}: ${track.packets} packets, from ${original.packets}`);
    assert(track.keyFrames === original.keyFrames, `${kind}: ${track.keyFrames} key frames, from ${original.keyFrames}`);
    // 2 ms, with room for the rounding of two three-decimal numbers.
    assert(
      near(track.firstTimestamp, original.firstTimestamp - recordingStart, 0.0025),
      `${kind} starts at ${track.firstTimestamp} s, from ${original.firstTimestamp} s in a recording that starts at ${recordingStart} s`,
    );
    details.push(`${kind}: ${track.codec} in .${solo.ext} (${solo.type}), ${track.packets} packets`);
  }
  assert(r.audio.decoded != null && near(r.audio.decoded, r.decoded, 0.1), `the sound on its own decodes to ${r.audio.decoded} s, the recording to ${r.decoded} s`);
  assert(r.video.loads === true, `the picture on its own doesn't load: ${r.video.loads}`);
  return { detail: details.join(" · "), ext: { audio: r.audio.ext, video: r.video.ext } };
}

await test("captions are on at first, and off leaves the speech model unloaded", async () => {
  const first = await page.evaluate(() => ({ on: window.captureBench.params.get("captions"), chip: document.querySelector("#speech").textContent.trim() }));
  assert(first.on === true, "captions aren't on by default");
  await setParams({ captions: false });
  return `chip: ${first.chip}`;
});

await test("the bench loads, in a secure context, with this browser's formats", async () => {
  const info = await page.evaluate(() => ({
    secure: document.querySelector("#secure").dataset.state,
    types: [...document.querySelectorAll("#p-mimeType option")].map((o) => o.value).filter(Boolean),
    tabs: [...document.querySelectorAll("#param-tabs [role=tab]")].map((t) => t.textContent.trim()),
  }));
  assert(info.secure === "ready", "not a secure context");
  assert(info.types.length > 0, "MediaRecorder records nothing");
  assert(info.tabs.join() === "Each start,Each record,WebCodecs,Captions,Analysis", info.tabs.join());
  return `${info.types.length} recordable types: ${info.types.slice(0, 3).join(", ")}…`;
});

await test("camera and microphone: a take with video and audio", async () => {
  await setParams({ echoCancellation: "off", noiseSuppression: "off", autoGainControl: "off" });
  const t = await recordTake("camera", 5000);
  await closeSource();
  const detail = checkTake(t, 5);
  const video = t.analysis.file.probe.tracks.find((x) => x.type === "video");
  assert(video, "no video track in the file");
  assert(t.analysis.video.frames >= 10, `only ${t.analysis.video.frames} video frames`);
  const mic = t.tracks.find((x) => x.kind === "audio");
  assert(mic.settings.echoCancellation === false || mic.settings.echoCancellation === undefined, `echoCancellation is ${mic.settings.echoCancellation}`);
  return `${detail} · ${video.width}×${video.height} ${video.codec}, ${t.analysis.video.frames} frames, ${t.analysis.video.dropped} dropped`;
});

await test("camera and microphone: the sound and the picture copied out on their own, packet for packet", async () => {
  const take = await page.evaluate(() => window.captureBench.latest);
  const buttons = await page.$$eval("#latest [data-download]", (list) => list.map((b) => b.dataset.download));
  assert(buttons.includes("audio") && buttons.includes("video"), `the card offers ${buttons.join(", ")}`);
  const { detail, ext } = await checkSolo(take);
  // The buttons themselves, with downloads caught rather than saved.
  await page.evaluate(() => {
    window.testDownloads = [];
    window.testClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      window.testDownloads.push(this.download);
    };
  });
  try {
    for (const kind of ["audio", "video"]) {
      await page.click(`#latest [data-download="${kind}"]`);
      await page.waitForFunction((n) => window.testDownloads.length >= n, { timeout: 15000 }, kind === "audio" ? 1 : 2);
    }
    const r = await page.evaluate(() => ({
      names: window.testDownloads,
      alerts: document.querySelector("#alerts").textContent.trim(),
      logged: [...document.querySelectorAll("#log li > b")].filter((b) => b.textContent.trim() === "extract").length,
    }));
    assert(r.names[0] === `${take.name}-audio.${ext.audio}` && r.names[1] === `${take.name}-video.${ext.video}`, `downloaded ${r.names.join(", ")}`);
    assert(!r.alerts, `alert: ${r.alerts}`);
    assert(r.logged === 2, `${r.logged} extract events logged`);
    return `${detail} · downloaded ${r.names.map((n) => n.slice(take.name.length + 1)).join(", ")}`;
  } finally {
    await page.evaluate(() => (HTMLAnchorElement.prototype.click = window.testClick));
  }
});

if (!isFirefox) {
  await test("camera and microphone: the 16 kHz copy is fox.wav (Chromium's fake microphone)", async () => {
    const take = await page.evaluate(() => window.captureBench.latest);
    const score = await page.evaluate(async (id) => {
      const [{ takeMedia }, { parseWav }, { align }] = await Promise.all([import("./page/takes.js"), import("./src/wav.js"), import("./src/metrics.js")]);
      const media = await takeMedia(id);
      const pcm = parseWav(await media.pcm16k.arrayBuffer()).channels[0];
      const fox = parseWav(await (await fetch("test/fixtures/fox.wav")).arrayBuffer()).channels[0];
      // The fake microphone loops the file, so the take holds all of it somewhere in its first 5 s.
      return align(fox, 16000, pcm, 16000, { maxLagS: 5 });
    }, take.id);
    assert(score.score > 0.8, `the take's loudness matches fox.wav at only ${score.score.toFixed(3)}`);
    return `loudness match ${score.score.toFixed(3)} at ${score.lagS.toFixed(3)} s`;
  });
}

await test("two microphones: one in each channel, compared with each other", async () => {
  // Chromium's fake devices include two microphones besides the default; Firefox has one, so it's opened twice.
  const picked = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("#mics-1 option")].map((o) => o.value).filter((v) => v && v !== "default");
    const pair = ids.length >= 2 ? ids.slice(0, 2) : [ids[0] ?? "", ids[0] ?? ""];
    ["mics-1", "mics-2"].forEach((id, i) => (document.getElementById(id).value = pair[i]));
    return pair;
  });
  const same = picked[0] === picked[1];
  const t = await recordTake("mics", 5000);
  await closeSource();
  const detail = checkTake(t, 5);
  const c = t.analysis.channels;
  assert(t.tracks.filter((x) => x.kind === "audio").length === 2, `${t.tracks.length} source tracks`);
  assert(t.analysis.tap.channels === 2 && c, `the tap has ${t.analysis.tap.channels} channels`);
  assert(c.file === 2, `the file has ${c.file} channels`);
  assert(c.loudest.length === 2 && Math.abs(c.loudest[0] + c.loudest[1] + c.loudestTied - 1) < 0.01, `loudest shares ${c.loudest}, tied ${c.loudestTied}`);
  if (same) assert(c.identical || c.waveScore > 0.9, `the same microphone twice matches at only ${c.waveScore}`);
  return `${detail} · ${same ? "one microphone twice" : "two microphones"}: ${c.identical ? "identical channels" : `channel 2 ${Math.round(c.lagS * 1000)} ms against 1, match ${c.waveScore}`} · loudest ${c.loudest.join(" / ")}, tied ${c.loudestTied}`;
});

await test("sound: loudness, noise floor, bandwidth and stretches of sound", async () => {
  const t = await page.evaluate(() => window.captureBench.latest);
  const { tap, file } = t.analysis.sound;
  assert(Number.isFinite(tap.lufs) && Number.isFinite(file.lufs), `loudness ${tap.lufs} · ${file.lufs} LUFS`);
  // The recorder shouldn't change how loud the take is.
  assert(Math.abs(t.analysis.sound.changeLu) < 1, `the file is ${t.analysis.sound.changeLu} LU from the tap`);
  assert(tap.bandwidthHz > 1000 && file.bandwidthHz > 1000, `bandwidth ${tap.bandwidthHz} · ${file.bandwidthHz} Hz`);
  assert(t.analysis.activity.count >= 1, "no stretches of sound");
  const rows = await page.$$eval("#latest .metrics h4", (h) => h.map((x) => x.textContent));
  assert(rows.includes("Sound") && rows.includes("Channels"), rows.join(", "));
  return `${tap.lufs} · ${file.lufs} LUFS · floor ${tap.floorDb} dBFS · ${tap.bandwidthHz} · ${file.bandwidthHz} Hz · ${t.analysis.activity.count} stretches of sound`;
});

await test("two cameras: side by side in one picture, each camera's frames timed", async () => {
  // Chromium's and Firefox's fake devices have one camera each, so it's opened twice.
  const picked = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("#cams-1 option")].map((o) => o.value).filter(Boolean);
    const pair = ids.length >= 2 ? ids.slice(0, 2) : [ids[0] ?? "", ids[0] ?? ""];
    ["cams-1", "cams-2"].forEach((id, i) => (document.getElementById(id).value = pair[i]));
    return pair;
  });
  const same = picked[0] === picked[1];
  const t = await recordTake("cameras", 5000);
  await closeSource();
  const detail = checkTake(t, 5);
  const c = t.analysis.cameras;
  const video = t.analysis.file.probe.tracks.find((x) => x.type === "video");
  assert(t.tracks.filter((x) => x.kind === "video").length === 2, `${t.tracks.length} source tracks`);
  assert(c?.list.length === 2, `cameras: ${JSON.stringify(c)}`);
  const [one, two] = c.list;
  // The picture is the two side by side, each keeping its shape.
  assert(near(video.width / video.height, one.width / one.height + two.width / two.height, 0.05), `${video.width}×${video.height} from ${one.width}×${one.height} and ${two.width}×${two.height}`);
  assert(one.frames >= 20 && two.frames >= 20, `${one.frames} and ${two.frames} frames`);
  // Camera 1 sets the picture's pace.
  assert(t.analysis.video.frames >= one.frames * 0.5, `${t.analysis.video.frames} frames recorded from camera 1's ${one.frames}`);
  if (same && c.clock === "capture") assert(Math.abs(c.offsetS) < 0.001, `the same camera twice, ${c.offsetS} s apart`);
  if (!isFirefox) assert(c.clock === "capture" && one.delayS > 0, `timed from ${c.clock}, delay ${one.delayS}`);
  const rows = await page.$$eval("#latest .metrics h4", (h) => h.map((x) => x.textContent));
  assert(rows.includes("Cameras"), rows.join(", "));
  return `${detail} · ${video.width}×${video.height} · ${same ? "one camera twice" : "two cameras"}, timed from ${c.clock}: ${one.frames} · ${two.frames} frames at ${one.fps} · ${two.fps} fps, ${one.missed} · ${two.missed} missed, delay ${one.delayS == null ? "—" : `${Math.round(one.delayS * 1000)} ms`}, camera 2 ${Math.round(c.offsetS * 1000)} ms against 1`;
});

await test("one device at a time: a browser that stops the first camera or microphone as the next opens is reported", async () => {
  // Safari on iOS ends camera 1's track as camera 2 opens (WebKit bug 264288). This stands in for
  // it: each getUserMedia() call stops the earlier calls' tracks of the kinds it opens, a moment
  // later, as a real device's end may reach the page after the call has resolved.
  await page.evaluate(() => {
    const devices = navigator.mediaDevices;
    const real = devices.getUserMedia;
    const opened = [];
    window.__realGetUserMedia = real;
    devices.getUserMedia = async (constraints) => {
      const stream = await real.call(devices, constraints);
      const earlier = opened.filter((t) => stream.getTracks().some((n) => n.kind === t.kind));
      setTimeout(() => earlier.forEach((t) => t.stop()), 100);
      opened.push(...stream.getTracks());
      return stream;
    };
  });
  try {
    const seen = [];
    for (const source of ["cameras", "mics"]) {
      await page.evaluate((s) => window.captureBench.useSource(s), source);
      await page.click("#record");
      await page.waitForFunction(() => document.querySelector("#alerts").textContent.trim() !== "" || window.captureBench.state() === "recording", { timeout: 20000 });
      if ((await page.evaluate(() => window.captureBench.state())) === "recording") throw new Error(`${source}: opened and recorded, with no alert`);
      await page.waitForFunction(() => window.captureBench.state() === "idle");
      const alert = await page.$eval("#alerts", (a) => a.textContent.trim());
      assert(alert.includes("One device at a time here") && alert.includes("OneAtATimeError"), `${source}: ${alert}`);
      seen.push(alert.slice(alert.indexOf("OneAtATimeError")));
    }
    return seen.join(" · ");
  } finally {
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = window.__realGetUserMedia;
      delete window.__realGetUserMedia;
      document.querySelector("#alerts").replaceChildren();
    });
    // A source that opened anyway is stopped, so the next tests start from idle.
    if ((await page.evaluate(() => window.captureBench.state())) === "recording") {
      await page.click("#stop");
      await page.waitForFunction(() => !["recording", "analysing"].includes(window.captureBench.state()), { timeout: 60000 });
    }
    await closeSource();
  }
});

await test("test signal: frame numbers, dropped frames and A/V sync", async () => {
  // 7 s, so at least three flashes land after a slow encoder start.
  const t = await recordTake("synthetic", 7000);
  await closeSource();
  const detail = checkTake(t, 7);
  const s = t.analysis.sync;
  assert(s?.frames, `frames not read: ${s?.error}`);
  assert(s.frames.unreadable <= 2, `${s.frames.unreadable} unreadable frames`);
  assert(s.flashes >= 3 && s.beeps >= 3, `${s.flashes} flashes, ${s.beeps} beeps`);
  assert(s.offsetS.median != null && Math.abs(s.offsetS.median) < 0.25, `A/V offset ${s.offsetS.median} s`);
  return `${detail} · ${s.frames.frames} frames read (${s.frames.missing} missing, ${s.frames.repeated} repeated) · A/V ${Math.round(s.offsetS.median * 1000)} ms over ${s.offsetS.pairs} pairs`;
});

const MP4 = "video/mp4;codecs=avc1.42E01E,mp4a.40.2";
if (await page.$eval("#p-mimeType", (s, type) => [...s.options].some((o) => o.value === type), MP4)) {
  await test("test signal as MP4 (H.264 and AAC): the sound copied out as .m4a, the picture as .mp4", async () => {
    await setParams({ mimeType: MP4 });
    try {
      const t = await recordTake("synthetic", 3000);
      await closeSource();
      assert(t.recorder.mimeType.startsWith("video/mp4"), t.recorder.mimeType);
      return (await checkSolo(t)).detail;
    } finally {
      await setParams({ mimeType: "" });
    }
  });
}

// The WebCodecs recorder: the same take checks as MediaRecorder's, and its own.
const webcodecs = await page.$eval("#p-recorder", (s) => [...s.options].some((o) => o.value === "webcodecs"));
const encoders = webcodecs ? await page.evaluate(async () => (await import("./src/webcodecs-recorder.js")).encoderSupport()) : null;
function checkWebCodecs(t) {
  const r = t.recorder;
  assert(r.kind === "webcodecs" && !r.error, `recorder ${r.kind}: ${r.error}`);
  assert(t.analysis.file.declaresDuration, "Mediabunny's file should declare its duration");
  const v = r.webcodecs.video;
  const a = r.webcodecs.audio;
  const sound = a && `${a.path}, ${a.channels} ch at ${a.sampleRate} Hz`;
  if (!v) return `audio only · ${a.config.codec} · ${sound}`;
  assert(v.encoded > 0 && v.keyFramesOut >= v.keyFramesAsked, `video: ${v.encoded} packets, key frames ${v.keyFramesOut} of ${v.keyFramesAsked} asked`);
  return `${v.path} · ${v.config.codec}${a ? ` + ${a.config.codec} (${sound})` : ""} · ${v.framesIn} in, ${v.dropped} dropped · key frames ${v.keyFramesAsked} asked, ${v.keyFramesOut} written · latency ${v.latencyMs?.median} ms median, ${v.latencyMs?.max} max`;
}

// Records about 2.5 s, pauses 1.5 s, records 2.5 s more: the take must leave
// the pause out, as the tap does, and still end with it.
async function pausedTake() {
  const before = await page.evaluate(() => window.captureBench.latest?.id ?? null);
  await page.evaluate(() => window.captureBench.useSource("camera"));
  await page.click("#record");
  await page.waitForFunction(() => window.captureBench.state() === "recording", { timeout: 20000 });
  await sleep(2500);
  await page.click("#pause");
  await page.waitForFunction(() => window.captureBench.state() === "paused");
  // How long the pause was, as the test saw it: a busy page (headless Firefox encoding on its main thread) answers a click late.
  const pausedAt = Date.now();
  await sleep(1500);
  await page.click("#pause");
  await page.waitForFunction(() => window.captureBench.state() === "recording");
  const pausedFor = Date.now() - pausedAt;
  await sleep(2500);
  await page.click("#stop");
  await page.waitForFunction((id) => window.captureBench.latest && window.captureBench.latest.id !== id && window.captureBench.state() !== "analysing", { timeout: 60000 }, before);
  const t = await page.evaluate(() => window.captureBench.latest);
  await closeSource();
  const m = t.analysis.match;
  // At least the 1.5 s the test waited; and no more than the test's own count of the pause, give or take how
  // long the page took to answer each click.
  assert(t.recorder.pausedMs >= 1400 && t.recorder.pausedMs <= pausedFor + 500, `paused ${t.recorder.pausedMs} ms, where the test waited 1500 ms and counted ${pausedFor} ms`);
  assert(near(t.analysis.tap.duration, t.wallS, 0.25), `tap ${t.analysis.tap.duration} s against ${t.wallS} s recorded`);
  assert(near(t.analysis.decoded?.duration, t.wallS, 0.25), `the file's sound is ${t.analysis.decoded?.duration} s against ${t.wallS} s recorded`);
  assert(Math.abs(m.endS) < 0.25, `ends ${m.endS} s against the tap`);
  return { t, detail: `${t.wallS} s recorded, ${t.recorder.pausedMs} ms paused · tap ${t.analysis.tap.duration} s · file's sound ${t.analysis.decoded.duration.toFixed(2)} s · ends ${Math.round(m.endS * 1000)} ms` };
}
if (webcodecs) {
  await test("WebCodecs recorder: the test signal, frame numbers and A/V sync", async () => {
    await setParams({ recorder: "webcodecs" });
    try {
      const t = await recordTake("synthetic", 7000);
      await closeSource();
      const detail = checkTake(t, 7);
      const s = t.analysis.sync;
      assert(s?.frames, `frames not read: ${s?.error}`);
      assert(s.flashes >= 3 && s.beeps >= 3, `${s.flashes} flashes, ${s.beeps} beeps`);
      assert(s.offsetS.median != null && Math.abs(s.offsetS.median) < 0.25, `A/V offset ${s.offsetS.median} s`);
      return `${detail} · ${checkWebCodecs(t)} · ${s.frames.frames} frames read (${s.frames.missing} missing) · A/V ${Math.round(s.offsetS.median * 1000)} ms over ${s.offsetS.pairs} pairs`;
    } finally {
      await setParams({ recorder: "mediarecorder" });
    }
  });

  // MP4 with H.264 and AAC where the encoders take them (Chromium), WebM with VP8 and Opus otherwise (Firefox has no AAC).
  const mp4 = Boolean(encoders?.audio.aac && encoders.video.avc.software);
  await test(`WebCodecs recorder: camera and microphone as ${mp4 ? "MP4 (H.264 and AAC)" : "WebM (VP8 and Opus)"}, copied out on their own`, async () => {
    await setParams({ recorder: "webcodecs", ...(mp4 ? { wcContainer: "mp4", wcVideoCodec: "avc", wcAudioCodec: "aac" } : {}) });
    try {
      const t = await recordTake("camera", 5000);
      await closeSource();
      const detail = checkTake(t, 5);
      assert(t.recorder.mimeType.startsWith(mp4 ? "video/mp4" : "video/webm"), t.recorder.mimeType);
      // The codec string the stream itself declares (for H.264, from its parameter set), beside the one asked for.
      const declared = t.analysis.file.probe.tracks.find((x) => x.type === "video")?.codecString;
      return `${detail} · ${checkWebCodecs(t)} · the file declares ${declared} · ${(await checkSolo(t)).detail}`;
    } finally {
      await setParams({ recorder: "mediarecorder", wcContainer: "webm", wcVideoCodec: "vp8", wcAudioCodec: "opus" });
    }
  });

  // The fallback path in every browser: forced where there's a processor.
  await test("WebCodecs recorder: a paused take still lines up with the tap (fallback path)", async () => {
    await setParams({ recorder: "webcodecs", wcFramePath: "fallback" });
    try {
      const { t, detail } = await pausedTake();
      return `${detail} · ${checkWebCodecs(t)}`;
    } finally {
      await setParams({ recorder: "mediarecorder", wcFramePath: "auto" });
    }
  });

  await test("WebCodecs recorder: two microphones, sound only, as WebM", async () => {
    await page.evaluate(() => {
      const ids = [...document.querySelectorAll("#mics-1 option")].map((o) => o.value).filter((v) => v && v !== "default");
      const pair = ids.length >= 2 ? ids.slice(0, 2) : [ids[0] ?? "", ids[0] ?? ""];
      ["mics-1", "mics-2"].forEach((id, i) => (document.getElementById(id).value = pair[i]));
    });
    await setParams({ recorder: "webcodecs" });
    try {
      const t = await recordTake("mics", 5000);
      await closeSource();
      const detail = checkTake(t, 5);
      assert(!t.recorder.webcodecs.video && t.recorder.webcodecs.audio, "a sound-only take should have one encoder, for audio");
      assert(t.files.ext === "weba" && t.recorder.mimeType.startsWith("audio/webm"), `${t.recorder.mimeType} saved as .${t.files.ext}`);
      assert(t.analysis.channels?.file === 2, `the file has ${t.analysis.channels?.file} channels`);
      return `${detail} · ${checkWebCodecs(t)} · .${t.files.ext}, ${t.analysis.channels.file} channels`;
    } finally {
      await setParams({ recorder: "mediarecorder" });
    }
  });

  if (encoders?.trackProcessor) {
    await test("WebCodecs recorder, fallback path: frames from a <video> element, sound from the tap", async () => {
      await setParams({ recorder: "webcodecs", wcFramePath: "fallback" });
      try {
        const t = await recordTake("synthetic", 7000);
        await closeSource();
        const detail = checkTake(t, 7);
        assert(t.recorder.webcodecs.video.path.startsWith("<video>") && t.recorder.webcodecs.audio.path === "AudioWorklet tap", JSON.stringify([t.recorder.webcodecs.video.path, t.recorder.webcodecs.audio.path]));
        const s = t.analysis.sync;
        assert(s?.frames && s.offsetS.median != null && Math.abs(s.offsetS.median) < 0.25, `A/V offset ${s?.offsetS?.median} s`);
        return `${detail} · ${checkWebCodecs(t)} · ${s.frames.frames} frames read (${s.frames.missing} missing) · A/V ${Math.round(s.offsetS.median * 1000)} ms`;
      } finally {
        await setParams({ recorder: "mediarecorder", wcFramePath: "auto" });
      }
    });
  }
}

await test("camera and microphone: a paused take still lines up with the tap", async () => (await pausedTake()).detail);

await test("media file: fox.wav played and recorded to its end", async () => {
  const t = await recordTake("file", null);
  await closeSource().catch(() => {});
  const a = t.analysis;
  assert(t.source.method, "no capture method recorded");
  assert(near(a.decoded?.duration, 4.83, 0.6), `decoded ${a.decoded?.duration} s of a 4.83 s file`);
  assert(a.match && a.match.waveScore > 0.9, `waveform match ${a.match?.waveScore}`);
  return `${t.source.method} · ${t.recorder.mimeType} · ${a.decoded.duration} s · match ${a.match.waveScore.toFixed(3)}`;
});

await test("media file: analysing the whole file reads it as it is", async () => {
  const before = await page.evaluate(() => window.captureBench.latest?.id ?? null);
  await page.evaluate(() => window.captureBench.useSource("file"));
  await page.click("#whole-file");
  await page.waitForFunction((id) => window.captureBench.latest?.id !== id && window.captureBench.state() === "idle", { timeout: 30000 }, before);
  const t = await page.evaluate(() => window.captureBench.latest);
  assert(t.source.kind === "whole-file", t.source.kind);
  assert(t.analysis.file.probe.container === "WAVE", t.analysis.file.probe.container);
  assert(t.analysis.extracted.frames === 77280, `${t.analysis.extracted.frames} samples at 16 kHz`);
  return `${t.analysis.extracted.frames} samples, as in the file`;
});

await test("WebRTC loopback: the take hears what a call delivers", async () => {
  await setParams({ webrtc: true });
  try {
    const t = await recordTake("camera", 4000);
    await closeSource();
    assert(t.source.pipeline.webrtc, "the take doesn't say it went through WebRTC");
    assert(t.webrtc?.audio?.codec, `no audio codec in ${JSON.stringify(t.webrtc)}`);
    assert(t.analysis.tap && t.analysis.decoded, "no audio");
    return `${t.webrtc.audio.codec} · ${t.webrtc.video?.codec ?? "no video"} · lost ${t.webrtc.audio.packetsLost}`;
  } finally {
    await setParams({ webrtc: false });
  }
});

if (!isFirefox) {
  await test("screen: this tab, captured without the picker (Chromium)", async () => {
    // Which surface the browser picks by itself differs (this tab, or the whole screen).
    await setParams({ preferCurrentTab: true, displayAudio: false });
    const t = await recordTake("screen", 3000);
    await closeSource();
    const v = t.tracks.find((x) => x.kind === "video");
    assert(["browser", "monitor", "window"].includes(v?.settings.displaySurface), `displaySurface ${v?.settings.displaySurface}`);
    assert(t.analysis.video?.frames > 0, "no video frames");
    return `${v.settings.displaySurface} · ${v.settings.width}×${v.settings.height} · ${t.analysis.video.frames} frames`;
  });
}

// Drift needs a minute or more of take, so it only runs when asked for.
if (process.env.LONG) {
  await test("test signal: drift over a 65 s take", async () => {
    const t = await recordTake("synthetic", 65000, { timeout: 180000 });
    await closeSource();
    const m = t.analysis.match;
    assert(m?.driftS != null, "no drift measured");
    assert(Math.abs(m.driftS) < 0.045, `drift ${m.driftS} s`);
    return `drift ${Math.round(m.driftS * 1000)} ms over ${t.wallS} s · starts ${Math.round(m.lagS * 1000)} ms, ends ${Math.round(m.endS * 1000)} ms`;
  });
}

await test("sound: every take's file as loud as its tap, with its channels kept", async () => {
  const takes = (await page.evaluate(() => window.captureBench.listTakes())).filter((t) => t.analysis.sound?.changeLu != null);
  const rows = takes.map((t) => {
    const channels = `${t.analysis.tap.channels}→${t.analysis.decoded.channels}`;
    // Fewer channels in the file is only a loss when the tap's channels differ.
    const c = t.analysis.channels;
    const kept = t.analysis.decoded.channels >= t.analysis.tap.channels || c?.same;
    return { name: `${t.source.kind}${t.source.pipeline?.webrtc ? "+webrtc" : ""}`, change: t.analysis.sound.changeLu, channels: `${channels} ch${c ? `, ${c.identical ? "identical" : `match ${c.waveScore}`}` : ""}`, kept };
  });
  assert(rows.length >= 5, `${rows.length} takes with both`);
  const off = rows.filter((r) => !(Math.abs(r.change) <= 1) || !r.kept);
  assert(!off.length, off.map((r) => `${r.name}: ${r.change.toFixed(2)} LU, ${r.channels}`).join("; "));
  return rows.map((r) => `${r.name} ${r.change >= 0 ? "+" : ""}${r.change.toFixed(2)} LU (${r.channels})`).join(" · ");
});

await test("takes: saved, listed, exported and imported back", async () => {
  const r = await page.evaluate(async () => {
    const { clearTakes, exportTakes, importTakes, listTakes, takeMedia } = await import("./page/takes.js");
    const before = await listTakes();
    const media = await takeMedia(before.findLast((t) => t.media.pcm16k).id);
    const text = await exportTakes();
    await clearTakes();
    const added = await importTakes(text);
    const after = await listTakes();
    return { before: before.length, added, after: after.length, imported: after.every((t) => t.imported), hadFile: Boolean(media.file && media.pcm16k) };
  });
  assert(r.before >= 4, `${r.before} takes saved`);
  assert(r.hadFile, "a take's files weren't saved");
  assert(r.added === r.before && r.after === r.before && r.imported, JSON.stringify(r));
  await page.evaluate(() => window.captureBench.showView("takes"));
  const rows = await page.$$eval("#takes-table tbody tr", (rows) => rows.length);
  assert(rows === r.before, `${rows} rows in the Takes table`);
  return `${r.before} takes round-tripped through Export and Import`;
});

// --- Captions ---------------------------------------------------------------------------------

await test("captions off: takes were recorded with no speech model loaded", async () => {
  const s = await page.evaluate(async () => {
    const { engine } = await import("./src/speech/core.js");
    return { engine: engine.state, chip: document.querySelector("#speech").textContent.trim(), shown: !document.querySelector("#captions").hidden };
  });
  assert(s.engine === "unloaded", `the speech engine is ${s.engine}`);
  assert(s.chip === "Captions off", `the chip says "${s.chip}"`);
  assert(!s.shown, "the caption overlay is showing");
  return `engine ${s.engine}, chip "${s.chip}"`;
});

if (!hasModel) {
  console.log(`SKIP  live captions: ${CAPTION_MODEL} isn't on the server (npm run download-model ${CAPTION_MODEL})`);
} else {
  // Opens a source with captions on and collects what the overlay shows, every 100 ms, until done(seen, run) or the timeout.
  async function watchCaptions(source, done, { timeout = 60000, file } = {}) {
    await setParams({ captions: true, ccModel: CAPTION_MODEL });
    await page.evaluate((s) => window.captureBench.useSource(s), source);
    if (file) await page.select("#sample", file);
    await page.click("#start");
    const seen = [];
    const started = Date.now();
    let state;
    while (Date.now() - started < timeout) {
      state = await page.evaluate(() => {
        const c = window.captureBench.captions;
        const run = c.last;
        return { text: c.text, shown: !document.querySelector("#captions").hidden, finals: run?.finals ?? [], interims: run?.interimStarts?.length ?? 0, bench: window.captureBench.state(), chip: document.querySelector("#speech").dataset.state };
      });
      if (state.text && seen.at(-1) !== state.text) seen.push(state.text);
      if (done(seen, state)) break;
      await sleep(100);
    }
    return { seen, state, seconds: (Date.now() - started) / 1000 };
  }
  const words = (text) => text.toLowerCase().replace(/[^a-z' ]/g, "").replace(/\s+/g, " ").trim();

  if (!isFirefox) {
    await test("live captions: the fake microphone's sentence appears over the preview (Chromium)", async () => {
      try {
        const { seen, state, seconds } = await watchCaptions("camera", (seen, s) => s.finals.length >= 2);
        const engine = await page.evaluate(async () => (await import("./src/speech/core.js")).engine.info);
        assert(state.finals.length >= 2, `${state.finals.length} final captions in ${seconds.toFixed(0)} s; the overlay showed: ${seen.join(" | ") || "nothing"}`);
        for (const f of state.finals) assert(words(f.transcript).includes("quick brown fox"), `heard "${f.transcript}"`);
        assert(seen.some((t) => words(t).includes("the quick brown fox jumps over the lazy dog")), `the overlay showed: ${seen.join(" | ")}`);
        assert(state.chip === "ready", `the Captions chip is ${state.chip}`);
        assert(engine.from === "same-origin", `the model came from ${engine.from}`);
        assert(engine.crossOriginIsolated && engine.threads > 1, `${engine.threads} thread(s), cross-origin isolated: ${engine.crossOriginIsolated}`);
        // fox.wav loops every 4.83 s: the second sentence starts one loop after the first.
        const [a, b] = state.finals;
        assert(a.end > a.start && b.start >= a.end, `times out of order: ${a.start}-${a.end}, ${b.start}-${b.end}`);
        assert(near((b.start - a.start) % 4.83, 0, 0.3) || near((b.start - a.start) % 4.83, 4.83, 0.3), `sentences ${(b.start - a.start).toFixed(2)} s apart, in a file that repeats every 4.83 s`);
        const late = state.finals.map((f) => f.latency);
        return `"${a.transcript}" at ${a.start}-${a.end} s and again at ${b.start} s · ${late.map((l) => `${l.toFixed(2)} s`).join(", ")} after each ended · ${state.interims} interim texts · ${engine.model} on ${engine.device}, ${engine.threads} threads, loaded in ${(engine.loadMs / 1000).toFixed(1)} s`;
      } finally {
        await closeSource();
        await setParams({ captions: false });
      }
    });

    await test("live captions: closing the source clears them", async () => {
      const s = await page.evaluate(() => ({ shown: !document.querySelector("#captions").hidden, text: window.captureBench.captions.text, run: window.captureBench.captions.run }));
      assert(!s.shown && !s.text && !s.run, JSON.stringify(s));
    });
  }

  await test("live captions: a media file's speech is captioned as it plays", async () => {
    try {
      // The file plays to its end and the source closes; the first sentence's caption arrives while the second plays.
      const { seen, state, seconds } = await watchCaptions("file", (seen, s) => s.bench === "idle" && seen.length > 0, { file: "test/fixtures/two-sentences.wav", timeout: 40000 });
      assert(seen.length, `no caption in ${seconds.toFixed(0)} s`);
      const all = seen.map(words).join(" | ");
      assert(/speech recognition/.test(all), `the overlay showed: ${seen.join(" | ")}`);
      return `${seen.length} texts shown, ${state.finals.length} final, ${state.interims} interim: "${state.finals[0]?.transcript ?? seen.at(-1)}"`;
    } finally {
      await closeSource();
      await page.select("#sample", "test/fixtures/fox.wav");
      await page.evaluate(() => window.captureBench.useSource("camera"));
      await setParams({ captions: false });
    }
  });

  // --- Transcripts ----------------------------------------------------------------------------

  // The cards are in the Live view.
  await page.evaluate(() => window.captureBench.showView("live"));

  // A take's saved transcript, with where the take's own 16 kHz copy has speech
  // (the energy detector on the file's decoded sound: [[start, end]] in seconds),
  // which is the truth the captions' times are checked against.
  const transcriptOf = (id) =>
    page.evaluate(async (id) => {
      const [{ takeMedia, takeTranscripts }, { parseWav }, { createEnergyDetector, frameScores, speechRegions }] = await Promise.all([import("./page/takes.js"), import("./src/wav.js"), import("./src/speech/vad.js")]);
      const { live } = await takeTranscripts(id);
      const { pcm16k } = await takeMedia(id);
      const detector = createEnergyDetector();
      const speech = speechRegions(await frameScores(parseWav(await pcm16k.arrayBuffer()).channels[0], detector), detector.threshold, { bridge: 0.5 });
      return { live, speech };
    }, id);

  // Records a media file to its end, with captions on.
  async function fileTake(sample, params = {}) {
    await setParams({ captions: true, ccModel: CAPTION_MODEL, ...params });
    const before = await page.evaluate(() => window.captureBench.latest?.id ?? null);
    await page.evaluate(() => window.captureBench.useSource("file"));
    await page.select("#sample", sample);
    await page.click("#record");
    await page.waitForFunction((id) => window.captureBench.latest && window.captureBench.latest.id !== id && window.captureBench.state() === "idle", { timeout: 90000 }, before);
    return page.evaluate(() => window.captureBench.latest);
  }
  const resetCaptions = async (params = {}) => {
    await closeSource();
    await page.select("#sample", "test/fixtures/fox.wav");
    await page.evaluate(() => window.captureBench.useSource("camera"));
    await setParams({ captions: false, ...params });
  };
  // The segmenter keeps up to 300 ms before speech starts and 200 ms after it ends, in 20 ms frames.
  const startsWith = (segment, region) => segment.start >= region[0] - 0.45 && segment.start <= region[0] + 0.15;
  const endsWith = (segment, region) => segment.end >= region[1] - 0.15 && segment.end <= region[1] + 0.45;

  await test("transcript: a recorded file's two sentences, at the times they are spoken in the recording", async () => {
    try {
      const t = await fileTake("test/fixtures/two-sentences.wav");
      const summary = t.transcripts?.live;
      assert(summary, "the take has no transcript");
      assert(!summary.segments, "the report holds the transcript's text (it belongs in the transcripts store)");
      const { live, speech } = await transcriptOf(t.id);
      const duration = t.analysis.file.probe.duration;
      assert(live.segments.length === 2, `${live.segments.length} captions: ${live.segments.map((x) => x.transcript).join(" | ")}`);
      assert(words(live.segments[0].transcript) === "speech recognition now works in firefox", live.segments[0].transcript);
      assert(words(live.segments[1].transcript) === "everything runs locally on this computer", live.segments[1].transcript);
      assert(speech.length === 2, `the recording's own sound has ${speech.length} stretches of speech`);
      for (const [i, segment] of live.segments.entries()) {
        assert(segment.start >= 0 && segment.end <= duration + 0.001 && segment.end > segment.start, `caption ${i + 1} at ${segment.start}-${segment.end} s in a ${duration} s file`);
        assert(startsWith(segment, speech[i]) && endsWith(segment, speech[i]), `caption ${i + 1} at ${segment.start}-${segment.end} s, speech at ${speech[i].join("-")} s`);
        assert(!segment.clipped, `caption ${i + 1} is marked cut`);
      }
      assert(live.clock.offsetFrom === "measured", `the offset was ${live.clock.offsetFrom} (match ${live.clock.waveScore})`);
      assert(!live.incomplete && summary.stats.segments === 2 && summary.stats.words === 12, JSON.stringify(summary.stats));
      assert(summary.stats.latencyS?.median > 0, "no caption delay measured");
      const logged = await page.evaluate(() => [...document.querySelectorAll("#log li > b")].filter((b) => b.textContent.trim() === "transcript").length);
      assert(logged >= 1, "no transcript event in the log");
      return `${live.segments.map((x) => `${x.start}-${x.end} s`).join(", ")} against speech at ${speech.map((r) => r.join("-")).join(", ")} s · offset ${Math.round(live.clock.offsetS * 1000)} ms (${live.clock.offsetFrom}) · captions ${summary.stats.latencyS.median} s after each utterance, model ${summary.stats.rtf}× the speech`;
    } finally {
      await resetCaptions();
    }
  });

  await test("transcript: on the take's card, as subtitles on the recording, rows that seek, and four downloads", async () => {
    const take = await page.evaluate(() => window.captureBench.latest);
    const { live } = await transcriptOf(take.id);
    const card = await page.evaluate(async () => {
      const video = document.querySelector("#latest .take-video");
      const track = video.textTracks[0];
      for (let i = 0; i < 50 && !track.cues?.length; i++) await new Promise((r) => setTimeout(r, 100));
      const rows = [...document.querySelectorAll("#latest .take-transcript li")];
      rows[1].click();
      await new Promise((r) => setTimeout(r, 300));
      const at = video.currentTime;
      video.pause();
      return {
        rows: rows.map((r) => r.querySelector("span").textContent),
        track: { kind: track.kind, mode: track.mode, cues: [...(track.cues ?? [])].map((c) => [c.startTime, c.endTime, c.text]) },
        soughtTo: at,
        buttons: [...document.querySelectorAll("#latest [data-download]")].map((b) => b.dataset.download),
        metrics: [...document.querySelectorAll("#latest .metrics h4")].map((h) => h.textContent),
      };
    });
    assert(card.rows.length === 2 && card.rows[1] === live.segments[1].transcript, `rows: ${card.rows.join(" | ")}`);
    assert(card.track.kind === "captions" && card.track.mode === "showing", `the track is ${card.track.kind}, ${card.track.mode}`);
    assert(card.track.cues.length >= 2, `${card.track.cues.length} cues`);
    assert(near(card.track.cues[0][0], live.segments[0].start, 0.002) && near(card.track.cues.at(-1)[1], live.segments[1].end, 0.002), `cues at ${card.track.cues.map((c) => `${c[0]}-${c[1]}`).join(", ")}`);
    assert(card.track.cues.map((c) => c[2].replace(/\n/g, " ")).join(" ") === live.segments.map((x) => x.transcript).join(" "), `the cues say: ${card.track.cues.map((c) => c[2]).join(" | ")}`);
    assert(card.soughtTo >= live.segments[1].start - 0.01 && card.soughtTo < live.segments[1].end, `a click on row 2 went to ${card.soughtTo} s; it starts at ${live.segments[1].start} s`);
    assert(card.metrics.includes("Captions"), `the card measures: ${card.metrics.join(", ")}`);
    // The downloads, caught rather than saved, and read back.
    await page.evaluate(() => {
      window.testDownloads = [];
      window.testClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        window.testDownloads.push(fetch(this.href).then((r) => r.text()).then((text) => ({ name: this.download, text })));
      };
    });
    try {
      for (const kind of ["vtt", "srt", "txt", "transcript"]) {
        assert(card.buttons.includes(kind), `the card offers ${card.buttons.join(", ")}`);
        await page.click(`#latest [data-download="${kind}"]`);
      }
      const got = await page.evaluate(() => Promise.all(window.testDownloads));
      const [vtt, srt, txt, json] = got;
      assert(got.map((g) => g.name).join() === [`${take.name}.vtt`, `${take.name}.srt`, `${take.name}.txt`, `${take.name}-transcript.json`].join(), got.map((g) => g.name).join(", "));
      assert(vtt.text.startsWith("WEBVTT\n\n1\n00:00:0") && vtt.text.includes(" --> ") && vtt.text.includes("Firefox."), vtt.text.slice(0, 120));
      assert(/^1\n00:00:0\d,\d{3} --> 00:00:0\d,\d{3}\n/.test(srt.text), srt.text.slice(0, 80));
      assert(txt.text.split("\n").filter(Boolean).length === 2 && txt.text.includes("] Speech recognition now works in Firefox."), txt.text);
      const record = JSON.parse(json.text);
      assert(record.format === "caption-bench-transcript/1" && record.segments.length === 2 && record.source.startsWith(take.name) && record.clock.startFrame > 0, json.text.slice(0, 200));
      // Exported with the takes, and read back by Import.
      const moved = await page.evaluate(async (id) => {
        const { exportTakes, importTakes, takeTranscripts } = await import("./page/takes.js");
        const text = await exportTakes();
        const exported = JSON.parse(text).transcripts?.[id]?.live?.segments?.length ?? 0;
        await importTakes(text);
        return { exported, after: (await takeTranscripts(id)).live?.segments?.length ?? 0 };
      }, take.id);
      assert(moved.exported === 2 && moved.after === 2, `Export carried ${moved.exported} captions; after Import there are ${moved.after}`);
      return `${card.track.cues.length} cues shown on the recording · .vtt, .srt, .txt and transcript.json downloaded · carried by Export and Import`;
    } finally {
      await page.evaluate(() => (HTMLAnchorElement.prototype.click = window.testClick));
    }
  });

  if (webcodecs) {
    await test("transcript: with the WebCodecs recorder's sound from the tap, the estimated offset agrees with the measured one", async () => {
      try {
        const t = await fileTake("test/fixtures/two-sentences.wav", { recorder: "webcodecs", wcFramePath: "fallback" });
        const { live, speech } = await transcriptOf(t.id);
        assert(t.recorder.webcodecs.audio.path === "AudioWorklet tap", `the sound came from ${t.recorder.webcodecs.audio.path}`);
        assert(live.segments.length === 2 && speech.length === 2, `${live.segments.length} captions, ${speech.length} stretches of speech`);
        for (const [i, segment] of live.segments.entries()) assert(startsWith(segment, speech[i]) && endsWith(segment, speech[i]), `caption ${i + 1} at ${segment.start}-${segment.end} s, speech at ${speech[i].join("-")} s`);
        const c = live.clock;
        assert(c.offsetFrom === "measured", `the offset was ${c.offsetFrom} (match ${c.waveScore})`);
        assert(near(c.estimatedS, c.offsetS, 0.03), `estimated ${c.estimatedS} s, measured ${c.offsetS} s`);
        return `measured ${Math.round(c.offsetS * 1000)} ms, estimated from the recorder's timestamps ${Math.round(c.estimatedS * 1000)} ms`;
      } finally {
        await resetCaptions({ recorder: "mediarecorder", wcFramePath: "auto" });
      }
    });
  }

  if (!isFirefox) {
    await test("transcript: a paused take keeps what was said while it recorded, in order, on the recording's times (Chromium)", async () => {
      // The fake microphone says its 2.7 s sentence every 4.83 s, so 8.5 s of recording holds a whole one
      // whenever it starts: 8.5 s recorded, 3 s paused, 4 s recorded.
      await setParams({ captions: true, ccModel: CAPTION_MODEL });
      try {
        const before = await page.evaluate(() => window.captureBench.latest?.id ?? null);
        await page.evaluate(() => window.captureBench.useSource("camera"));
        await page.click("#start");
        await page.waitForFunction(() => window.captureBench.state() === "previewing", { timeout: 20000 });
        await sleep(1500);
        await page.click("#record");
        await page.waitForFunction(() => window.captureBench.state() === "recording", { timeout: 20000 });
        await sleep(8500);
        await page.click("#pause");
        await page.waitForFunction(() => window.captureBench.state() === "paused");
        await sleep(3000);
        await page.click("#pause");
        await page.waitForFunction(() => window.captureBench.state() === "recording");
        await sleep(4000);
        await page.click("#stop");
        await page.waitForFunction((id) => window.captureBench.latest && window.captureBench.latest.id !== id && window.captureBench.state() !== "analysing", { timeout: 90000 }, before);
        const t = await page.evaluate(() => window.captureBench.latest);
        const { live, speech } = await transcriptOf(t.id);
        const duration = t.analysis.file.probe.duration;
        const c = live.clock;
        assert(c.gaps.length === 1, `${c.gaps.length} pauses on the take's clock`);
        assert(live.segments.length >= 2, `${live.segments.length} captions: ${live.segments.map((x) => x.transcript).join(" | ")}`);
        assert(!live.incomplete, "the last captions are missing");
        const inSpeech = (segment) => speech.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(segment.end, b) - Math.max(segment.start, a)), 0) / (segment.end - segment.start);
        for (const [i, segment] of live.segments.entries()) {
          assert(segment.start >= 0 && segment.end <= duration + 0.001 && segment.end > segment.start, `caption ${i + 1} at ${segment.start}-${segment.end} s in a ${duration} s file`);
          if (i) assert(segment.start >= live.segments[i - 1].end - 0.001, `caption ${i + 1} starts at ${segment.start} s, before the last ended (${live.segments[i - 1].end} s)`);
          // Said while recording: its middle isn't in the pause, on the context's clock.
          const middle = (segment.frames[0] + segment.frames[1]) / 2;
          assert(middle >= c.startFrame && middle < c.endFrame && !(middle >= c.gaps[0][0] && middle < c.gaps[0][1]), `caption ${i + 1} was said outside the take`);
          // And where the recording has speech: all but its lead-in and tail.
          assert(inSpeech(segment) > 0.6, `caption ${i + 1} at ${segment.start}-${segment.end} s: only ${Math.round(inSpeech(segment) * 100)}% of it is speech in the recording (speech at ${speech.map((r) => r.join("-")).join(", ")} s)`);
          assert(/quick|brown|fox|jumps|lazy|dog/.test(words(segment.transcript)), `caption ${i + 1} says "${segment.transcript}"`);
        }
        // Whole sentences sit on their speech; cut ones say so.
        const whole = live.segments.filter((x) => !x.clipped);
        assert(whole.length >= 1, "every caption was cut");
        for (const segment of whole) {
          const region = speech.find(([a, b]) => segment.start < b && segment.end > a);
          assert(region && startsWith(segment, region) && endsWith(segment, region), `"${segment.transcript}" at ${segment.start}-${segment.end} s, speech at ${region?.join("-")} s`);
          assert(words(segment.transcript) === "the quick brown fox jumps over the lazy dog", `an uncut caption says "${segment.transcript}"`);
        }
        const paused = (c.gaps[0][1] - c.gaps[0][0]) / c.rate;
        assert(near(paused * 1000, t.recorder.pausedMs, 150), `the tap paused ${paused.toFixed(3)} s, the recorder ${t.recorder.pausedMs} ms`);
        return `${live.segments.length} captions (${live.segments.filter((x) => x.clipped).length} cut at the take's edges) in a ${duration.toFixed(1)} s recording with ${paused.toFixed(2)} s paused · ${live.segments.map((x) => `${x.start}-${x.end}${x.clipped ? "✂" : ""}`).join(", ")} s · offset ${Math.round(c.offsetS * 1000)} ms (${c.offsetFrom}, match ${c.waveScore})`;
      } finally {
        await closeSource();
        await setParams({ captions: false });
      }
    });
  }

  const hasWords = await page.evaluate(async () => (await (await import("./page/captions.js")).localModels()).includes("onnx-community/whisper-tiny.en_timestamped"));
  if (!hasWords) {
    console.log("SKIP  transcript: word times (npm run download-model whisper-tiny.en-timestamped)");
  } else {
    await test("transcript: word times from Whisper sit inside their captions, and subtitles break on them", async () => {
      try {
        const t = await fileTake("test/fixtures/two-sentences.wav", { ccWords: "whisper" });
        const { live, speech } = await transcriptOf(t.id);
        assert(live.engine.wordsFrom === "whisper", `word times came from ${live.engine.wordsFrom}`);
        assert(live.segments.length === 2, `${live.segments.length} captions`);
        for (const [i, segment] of live.segments.entries()) {
          const w = segment.words;
          assert(w?.length === 6, `caption ${i + 1} has ${w?.length} timed words: ${w?.map((x) => x.word).join(" ")}`);
          assert(w.map((x) => x.word).join(" ") === segment.transcript, `words "${w.map((x) => x.word).join(" ")}" for "${segment.transcript}"`);
          for (const [n, x] of w.entries()) {
            assert(x.start >= segment.start - 0.02 && x.end <= segment.end + 0.02 && x.end >= x.start, `"${x.word}" at ${x.start}-${x.end} s in a caption at ${segment.start}-${segment.end} s`);
            if (n) assert(x.start >= w[n - 1].start, `"${x.word}" starts before the word before it`);
          }
          // The first word starts after the caption's lead-in, near where the speech does. (How near is the
          // model's doing: tiny.en's word times run late by up to half a second; base.en's are within 0.25 s.)
          assert(w[0].start >= speech[i][0] - 0.1 && w[0].start <= speech[i][0] + 0.7, `"${w[0].word}" at ${w[0].start} s, speech from ${speech[i][0]} s`);
        }
        const lags = live.segments.map((x, i) => Math.round((x.words[0].start - speech[i][0]) * 1000));
        const cues = await page.evaluate(async (id) => {
          const [{ takeTranscripts }, { toCues }] = await Promise.all([import("./page/takes.js"), import("./src/captions/subtitles.js")]);
          return toCues((await takeTranscripts(id)).live.segments, { maxChars: 20 }).map((c) => [c.start, c.end, c.text]);
        }, t.id);
        const starts = live.segments.flatMap((x) => x.words.map((w) => w.start));
        assert(cues.length >= 4 && cues.every((c) => starts.includes(c[0])), `cues at ${cues.map((c) => c[0]).join(", ")} s; words start at ${starts.join(", ")} s`);
        return `first words ${lags.join(" and ")} ms after the speech starts · ${live.segments.map((x) => x.words.map((w) => `${w.word}@${w.start}`).join(" ")).join(" · ")}`;
      } finally {
        await resetCaptions({ ccWords: "off" });
      }
    });
  }
}

await test("Browser view: the capability report", async () => {
  await page.evaluate(() => window.captureBench.showView("browser"));
  await page.waitForSelector("#caps .caps");
  const r = await page.$$eval("#caps tbody tr", (rows) => rows.length);
  assert(r >= 15, `${r} APIs listed`);
  // Where MediaStreamTrackProcessor is, and whether a track can go to a worker: the README's table comes from this.
  const p = await page.evaluate(async () => (await import("./src/capabilities.js")).capabilities().then((c) => c.trackProcessor));
  assert(p && typeof p.page === "boolean", `track processor: ${JSON.stringify(p)}`);
  const e = encoders ? Object.entries(encoders.video).map(([k, v]) => `${k} ${v.software ? "sw" : ""}${v.hardware ? "+hw" : ""}`.trim()).join(", ") : "no WebCodecs";
  return `${r} APIs listed · MediaStreamTrackProcessor on the page ${p.page}, in a worker ${p.worker}, a track to a worker: ${p.transfer} · encoders: ${e}; audio ${encoders ? Object.entries(encoders.audio).filter(([, on]) => on).map(([k]) => k).join(", ") : "—"}`;
});

await test("explainers: a bubble, the window and the guide", async () => {
  await page.evaluate(() => window.captureBench.showView("live"));
  const id = await page.evaluate(() => window.benchExplain.resolve(document.querySelector('.param[data-key="echoCancellation"] .key')));
  assert(id === "echoCancellation", `resolved ${id}`);
  await page.hover('.param[data-key="timeslice"] .key').catch(() => {});
  const guide = await openPage("guide.html#echoCancellation");
  try {
    await guide.waitForSelector(".guide-main .xp-title");
    const g = await guide.evaluate(() => ({
      title: document.querySelector(".guide-main .xp-title").textContent,
      topics: document.querySelectorAll(".guide-toc a[data-id]").length,
      sources: document.querySelectorAll(".guide-main .xp-sources li").length,
    }));
    assert(g.topics > 100, `${g.topics} topics in the guide`);
    assert(/echo/i.test(g.title), g.title);
    return `guide: ${g.topics} topics; echoCancellation cites ${g.sources} sources`;
  } finally {
    await guide.close();
  }
});

// Simulated touch is Chromium's (CDP); Firefox's driver doesn't emulate a touch screen.
if (!isFirefox) {
  await test("on a phone: a one-row header, nothing wider than the screen, 44 px touch targets, explanations by touch", async () => {
    const phone = await openPage("");
    try {
      await phone.emulate({
        viewport: { width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
      });
      await phone.reload();
      await phone.waitForFunction(() => window.captureBench?.state() === "idle");
      const layout = await phone.evaluate(() => {
        const small = [];
        for (const el of document.querySelectorAll("button, select, input, a, label.btn, [role=tab], .seg label, summary, td.pick")) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          // Inputs whose tap area is their label, field or cell are measured by that.
          if (el.matches("input") && el.closest(".seg, label.btn, .numfield, td.pick")) continue;
          if (r.height < 44 || r.width < 44) small.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} ${Math.round(r.width)}×${Math.round(r.height)}`);
        }
        // One row: every item in the header (but the heading for screen readers) centred on the same line.
        const items = [...document.querySelector(".appbar").children].filter((c) => c.offsetWidth && getComputedStyle(c).position !== "absolute");
        const tops = new Set(items.map((c) => Math.round((c.getBoundingClientRect().top + c.getBoundingClientRect().bottom) / 8)));
        return { coarse: matchMedia("(pointer: coarse)").matches, page: document.documentElement.scrollWidth, screen: document.documentElement.clientWidth, headerRows: tops.size, small };
      });
      assert(layout.coarse, "the page doesn't see a touch screen");
      assert(layout.page <= layout.screen, `the page is ${layout.page} px wide on a ${layout.screen} px screen`);
      assert(layout.headerRows === 1, `the header takes ${layout.headerRows} rows`);
      assert(!layout.small.length, `smaller than 44 × 44: ${layout.small.join(", ")}`);
      // Every settings tab in turn (a hidden one isn't measured above): no wider than the screen, nothing past its edge, every control 44 px.
      // (A switch's input is an invisible 44 px touch target over it, so it may reach into the panel's gutter.)
      const tabIds = await phone.$$eval("#param-tabs [role=tab]", (tabs) => tabs.map((t) => t.id));
      const tabProblems = [];
      for (const id of tabIds) {
        await phone.$eval(`#${id}`, (t) => t.click());
        const r = await phone.evaluate((id) => {
          const panel = document.getElementById(document.getElementById(id).getAttribute("aria-controls"));
          const small = [...panel.querySelectorAll("button, select, input")]
            .filter((el) => {
              const b = el.getBoundingClientRect();
              return b.width && b.height && !(el.matches("input") && el.closest(".seg, label.btn, .numfield, td.pick")) && (b.height < 44 || b.width < 44);
            })
            .map((el) => el.id || el.tagName.toLowerCase());
          const screen = document.documentElement.clientWidth;
          const past = [...panel.querySelectorAll("*")].filter((el) => el.getBoundingClientRect().right > screen + 0.5).map((el) => el.id || el.tagName.toLowerCase());
          return { page: document.documentElement.scrollWidth, past, small };
        }, id);
        if (r.page > layout.screen || r.past.length) tabProblems.push(`${id} is wider than the screen (page ${r.page} px; past its edge: ${r.past.join(", ")})`);
        if (r.small.length) tabProblems.push(`${id}: smaller than 44 × 44: ${r.small.join(", ")}`);
      }
      assert(!tabProblems.length, tabProblems.join("; "));
      await phone.$eval(`#${tabIds[0]}`, (t) => t.click());

      const centre = (sel) => phone.$eval(sel, (el) => {
        el.scrollIntoView({ block: "center" });
        const r = el.getBoundingClientRect();
        return [r.x + r.width / 2, r.y + r.height / 2];
      });
      const shown = () =>
        phone.evaluate(() => ({ tip: document.querySelector(".xp-tip:not([hidden])")?.textContent ?? null, menu: document.querySelector(".xp-menu:not([hidden])")?.textContent ?? null, state: window.captureBench.state(), strict: document.getElementById("p-strict").checked }));
      // A tap on a switch's name explains it, without flipping the switch.
      const before = await shown();
      const [x, y] = await centre('.param[data-key="strict"] .key');
      await phone.touchscreen.tap(x, y);
      await sleep(300);
      const tapped = await shown();
      assert(/strict/.test(tapped.tip ?? "") && /Touch and hold/.test(tapped.tip), `tapping a setting's name shows ${tapped.tip}`);
      assert(tapped.strict === before.strict, "tapping a switch's name flipped the switch");
      // Holding Record opens the menu, without starting a take.
      const [rx, ry] = await centre("#record");
      await phone.touchscreen.touchStart(rx, ry);
      await sleep(800);
      await phone.touchscreen.touchEnd();
      await sleep(300);
      const held = await shown();
      assert(/Learn about Record/.test(held.menu ?? ""), `holding Record shows ${held.menu}`);
      assert(held.state === "idle", `holding Record left the bench ${held.state}`);
      return `${layout.screen} px wide, header in one row, every control 44 × 44 or more, in all ${tabIds.length} settings tabs; a tap explains a setting, a hold opens Record's menu`;
    } finally {
      await phone.close();
    }
  });
}

await test("no uncaught errors in any page", async () => {
  const relevant = consoleErrors.filter((e) => !/favicon/i.test(e));
  assert(!relevant.length, relevant.join("\n      "));
});

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
