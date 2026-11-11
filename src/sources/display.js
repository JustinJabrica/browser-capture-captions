// A screen, window or browser tab, through getDisplayMedia(). The browser
// always shows its own picker; these options only suggest what it offers
// first. It must be called straight from a click, before anything else is
// awaited, or the browser refuses (InvalidAccessError or NotAllowedError).
//
// Audio is only ever a tab's sound, or the whole system's when sharing a
// screen on some platforms (Windows among them), and only in Chromium
// browsers. Firefox and Safari share pictures only.

const tri = (v, on, off) => (v === "on" ? on : v === "off" ? off : undefined);

// Plain settings -> getDisplayMedia() options:
//   { displaySurface ("any" | "monitor" | "window" | "browser"), audio (switch),
//     width, height, frameRate (numbers or null), cursor ("any" | "always" | "motion" | "never"),
//     systemAudio, selfBrowserSurface, surfaceSwitching, monitorTypeSurfaces ("default" | "on" | "off"),
//     preferCurrentTab, suppressLocalAudioPlayback (switches) }
export function displayOptions(o) {
  const pick = (entries) => Object.fromEntries(entries.filter(([, v]) => v !== undefined && v !== null && v !== ""));
  const video = pick([
    ["displaySurface", o.displaySurface && o.displaySurface !== "any" ? o.displaySurface : undefined],
    ["width", o.width],
    ["height", o.height],
    ["frameRate", o.frameRate],
    ["cursor", o.cursor && o.cursor !== "any" ? o.cursor : undefined],
  ]);
  const audio = o.audio ? pick([["suppressLocalAudioPlayback", o.suppressLocalAudioPlayback || undefined]]) : false;
  return pick([
    ["video", Object.keys(video).length ? video : true],
    ["audio", audio && !Object.keys(audio).length ? true : audio],
    ["systemAudio", tri(o.systemAudio, "include", "exclude")],
    ["selfBrowserSurface", tri(o.selfBrowserSurface, "include", "exclude")],
    ["surfaceSwitching", tri(o.surfaceSwitching, "include", "exclude")],
    ["monitorTypeSurfaces", tri(o.monitorTypeSurfaces, "include", "exclude")],
    ["preferCurrentTab", o.preferCurrentTab || undefined],
  ]);
}

export async function openDisplay(o) {
  const asked = displayOptions(o);
  const stream = await navigator.mediaDevices.getDisplayMedia(asked);
  return { stream, asked, release: () => stream.getTracks().forEach((t) => t.stop()) };
}
