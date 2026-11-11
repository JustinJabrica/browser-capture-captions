// Downloads Chrome for Testing, the build of Chrome that Google publishes for
// automated testing, into Puppeteer's cache: no system install, no updater,
// and it doesn't touch an installed Google Chrome. It's the same Chromium
// engine and the same media stack as Chrome stable of that version, which is
// what the end-to-end tests exercise; it isn't the product people run (no
// Google sign-in, no auto-update, and features tied to Google services, such
// as on-device speech recognition, may be missing).
//
//   node scripts/install-chrome-for-testing.mjs [channel]   (stable by default: beta, dev, canary, or a version)
//   npm run test:chrome-for-testing
//
// The cache is PUPPETEER_CACHE_DIR, or ~/.cache/puppeteer as Puppeteer uses.

import { homedir } from "node:os";
import { join } from "node:path";
import { Browser, detectBrowserPlatform, install, resolveBuildId } from "@puppeteer/browsers";

const CACHE_DIR = process.env.PUPPETEER_CACHE_DIR ?? join(homedir(), ".cache", "puppeteer");

const channel = process.argv[2] ?? "stable";
const platform = detectBrowserPlatform();
if (!platform) throw new Error(`Chrome for Testing has no build for ${process.platform} ${process.arch}`);
const buildId = await resolveBuildId(Browser.CHROME, platform, channel);
console.log(`Chrome for Testing ${buildId} (${channel}, ${platform}) into ${CACHE_DIR}`);
const installed = await install({ browser: Browser.CHROME, buildId, cacheDir: CACHE_DIR });
console.log(installed.executablePath);
