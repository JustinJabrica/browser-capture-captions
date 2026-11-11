// Two microphones at once, through getUserMedia() and Web Audio: each one
// mixed to mono and put in its own channel of one stereo track, the first
// on the left and the second on the right, so one recorder, one tap and one
// file hold both. With a microphone in front of each speaker, each channel
// holds mostly one voice: the reference speaker diarization is tested
// against. The same microphone twice is the control, whose channels should
// match.

import { lostDevice, settled, userMediaConstraints } from "./user-media.js";

// settings: the bench's microphone settings, as for the camera & mic source.
// devices: a device id for each microphone ("" for the default one).
export async function openMics(settings, devices) {
  const asked = devices.map((id) => userMediaConstraints({ ...settings, video: false, audio: true, audioDevice: id }).audio);
  const mics = [];
  try {
    for (const audio of asked) mics.push(await navigator.mediaDevices.getUserMedia({ audio, video: false }));
    // A browser that captures one device of a kind at a time ends (or mutes) the first as the second opens.
    await settled();
    const lost = lostDevice(mics.map((m) => m.getAudioTracks()[0]), "microphone", { muted: true });
    if (lost) throw lost;
  } catch (err) {
    for (const mic of mics) mic.getTracks().forEach((t) => t.stop());
    throw err;
  }
  const context = new AudioContext();
  // Not awaited: without a user gesture, resume() can stay pending forever.
  context.resume().catch(() => {});
  const merger = context.createChannelMerger(mics.length);
  // Discrete channels, so the browser never mixes the left microphone into the right.
  const destination = new MediaStreamAudioDestinationNode(context, { channelCount: mics.length, channelCountMode: "explicit", channelInterpretation: "discrete" });
  const nodes = mics.flatMap((mic, i) => {
    const source = context.createMediaStreamSource(mic);
    // A stereo microphone is mixed down first, so it fills exactly one channel.
    const mono = new GainNode(context, { channelCount: 1, channelCountMode: "explicit", channelInterpretation: "speakers" });
    source.connect(mono).connect(merger, 0, i);
    return [source, mono];
  });
  merger.connect(destination);
  return {
    stream: destination.stream,
    asked: { audio: asked[0], mics: asked },
    // What the track table lists, and what each was asked for.
    sourceTracks: mics.map((m) => m.getAudioTracks()[0]),
    trackAsked: asked,
    release() {
      for (const n of [...nodes, merger]) n.disconnect();
      for (const t of [...mics.flatMap((m) => m.getTracks()), ...destination.stream.getTracks()]) t.stop();
      context.close().catch(() => {});
    },
  };
}
