// Optional steps between the source and the recorder:
//   - mixing the microphone into the source's audio (a screen share with the
//     presenter's voice), with Web Audio
//   - sending the stream through WebRTC to a second connection on the same
//     page, so the recording hears what a call would deliver: its codecs,
//     packet loss and concealment, and its quality adapting to the link
//     (the microphone's own processing happens earlier, in getUserMedia)
// Each returns { stream, asked, release(), info?() } like a source.

import { userMediaConstraints } from "./sources/user-media.js";

// Mixes the microphone (with the bench's audio settings) into stream's audio.
// The video tracks pass through untouched.
export async function mixInMic(stream, settings) {
  const asked = { audio: userMediaConstraints({ ...settings, video: false, audio: true }).audio, video: false };
  const mic = await navigator.mediaDevices.getUserMedia(asked);
  const context = new AudioContext();
  context.resume().catch(() => {});
  const destination = context.createMediaStreamDestination();
  const inputs = [mic, ...(stream.getAudioTracks().length ? [new MediaStream(stream.getAudioTracks())] : [])];
  const nodes = inputs.map((s) => {
    const node = context.createMediaStreamSource(s);
    node.connect(destination);
    return node;
  });
  return {
    stream: new MediaStream([...stream.getVideoTracks(), ...destination.stream.getAudioTracks()]),
    asked,
    micTrack: mic.getAudioTracks()[0],
    release() {
      for (const n of nodes) n.disconnect();
      for (const t of [...mic.getTracks(), ...destination.stream.getTracks()]) t.stop();
      context.close().catch(() => {});
    },
  };
}

// Sends stream from one RTCPeerConnection to another on this page and
// resolves to the receiving side's stream, once it is connected (or rejects
// after 10 s). info() reads what was negotiated and how the media arrived.
export async function loopback(stream, { onEvent = () => {} } = {}) {
  const send = new RTCPeerConnection();
  const receive = new RTCPeerConnection();
  send.onicecandidate = ({ candidate }) => candidate && receive.addIceCandidate(candidate).catch(() => {});
  receive.onicecandidate = ({ candidate }) => candidate && send.addIceCandidate(candidate).catch(() => {});
  const remote = new MediaStream();
  receive.ontrack = ({ track }) => remote.addTrack(track);
  receive.onconnectionstatechange = () => onEvent("connectionstatechange", receive.connectionState);
  for (const track of stream.getTracks()) send.addTrack(track, stream);

  const close = () => {
    send.close();
    receive.close();
    for (const t of remote.getTracks()) t.stop();
  };
  try {
    const offer = await send.createOffer();
    await send.setLocalDescription(offer);
    await receive.setRemoteDescription(offer);
    const answer = await receive.createAnswer();
    await receive.setLocalDescription(answer);
    await send.setRemoteDescription(answer);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WebRTC didn't connect within 10 s")), 10000);
      const check = () => {
        if (receive.connectionState === "connected") {
          clearTimeout(timer);
          resolve();
        } else if (receive.connectionState === "failed") {
          clearTimeout(timer);
          reject(new Error("WebRTC failed to connect"));
        }
      };
      receive.addEventListener("connectionstatechange", check);
      check();
    });
  } catch (err) {
    close();
    throw err;
  }

  return {
    stream: remote,
    asked: { codecs: "negotiated" },
    release: close,
    // { audio, video }: each kind's codec, and how many packets were lost
    // and frames dropped on the way.
    async info() {
      const stats = await receive.getStats();
      const byId = new Map([...stats.values()].map((s) => [s.id, s]));
      const out = {};
      for (const s of stats.values()) {
        if (s.type !== "inbound-rtp") continue;
        const codec = byId.get(s.codecId);
        out[s.kind] = {
          codec: codec ? `${codec.mimeType}${codec.channels ? ` ${codec.channels} ch` : ""} @ ${codec.clockRate} Hz` : null,
          packetsReceived: s.packetsReceived,
          packetsLost: s.packetsLost,
          jitterMs: s.jitter != null ? Math.round(s.jitter * 1000) : null,
          ...(s.kind === "video"
            ? { framesDecoded: s.framesDecoded, framesDropped: s.framesDropped, frameWidth: s.frameWidth, frameHeight: s.frameHeight, framesPerSecond: s.framesPerSecond }
            : { concealedSamples: s.concealedSamples, totalSamplesReceived: s.totalSamplesReceived }),
        };
      }
      return out;
    },
  };
}
