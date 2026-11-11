// Where the media explanations' facts come from: W3C and WHATWG specifications,
// MDN (including its browser compatibility data), browser vendors' blogs,
// release notes and status pages, bug trackers and, where a vendor documents
// nothing else, the browser's own source code. Every URL was fetched and
// checked when it was added. MEDIA_SOURCES[id] = [{ title, by, year?, where, url }].

export const MEDIA_SOURCES = {
  "source-camera": [
    {
      "title": "MediaDevices: getUserMedia() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    },
    {
      "title": "Capabilities, constraints, and settings",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Constraints"
    },
    {
      "title": "MediaStreamTrack: getSettings() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getSettings"
    }
  ],
  "source-screen": [
    {
      "title": "MediaDevices: getDisplayMedia() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia"
    },
    {
      "title": "Using the Screen Capture API",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API/Using_Screen_Capture"
    },
    {
      "title": "Screen Capture",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-screen-share/"
    },
    {
      "title": "Privacy-preserving screen sharing controls",
      "by": "François Beaufort, Elad Alon (Google)",
      "where": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/web-platform/screen-sharing-controls"
    }
  ],
  "source-file": [
    {
      "title": "HTMLMediaElement: captureStream() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/captureStream"
    },
    {
      "title": "Media Capture from DOM Elements",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-fromelement/"
    },
    {
      "title": "Firefox 149 release notes for developers",
      "by": "MDN Web Docs (Mozilla)",
      "year": 2026,
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/149"
    },
    {
      "title": "AudioContext: createMediaElementSource() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaElementSource"
    },
    {
      "title": "Web Audio API 1.1",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://webaudio.github.io/web-audio-api/"
    },
    {
      "title": "Bug 275695: HTMLMediaElement: captureStream() method isn't implemented in Safari",
      "by": "WebKit",
      "where": "WebKit Bugzilla",
      "url": "https://bugs.webkit.org/show_bug.cgi?id=275695"
    }
  ],
  "source-synthetic": [
    {
      "title": "HTMLCanvasElement: captureStream() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream"
    },
    {
      "title": "CanvasCaptureMediaStreamTrack: requestFrame() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/CanvasCaptureMediaStreamTrack/requestFrame"
    },
    {
      "title": "CanvasCaptureMediaStreamTrack",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/CanvasCaptureMediaStreamTrack"
    },
    {
      "title": "AudioContext: createMediaStreamDestination() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaStreamDestination"
    },
    {
      "title": "OscillatorNode",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/OscillatorNode"
    }
  ],
  "camera-device": [
    {
      "title": "MediaDevices: enumerateDevices() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices"
    },
    {
      "title": "MediaDeviceInfo: label property",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDeviceInfo/label"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    },
    {
      "title": "MediaDeviceInfo",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDeviceInfo"
    }
  ],
  "mic-device": [
    {
      "title": "MediaDevices: enumerateDevices() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices"
    },
    {
      "title": "MediaDeviceInfo: label property",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDeviceInfo/label"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    },
    {
      "title": "MediaDeviceInfo",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDeviceInfo"
    }
  ],
  "camera-app": [
    {
      "title": "HTML attribute: capture",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture"
    },
    {
      "title": "HTML Media Capture",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/html-media-capture/"
    },
    {
      "title": "<input type=\"file\">",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file"
    }
  ],
  "mixMic": [
    {
      "title": "AudioContext: createMediaStreamSource() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaStreamSource"
    },
    {
      "title": "AudioContext: createMediaStreamDestination() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaStreamDestination"
    },
    {
      "title": "MediaStreamAudioDestinationNode",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamAudioDestinationNode"
    },
    {
      "title": "Web Audio API 1.1",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://webaudio.github.io/web-audio-api/"
    }
  ],
  "webrtc": [
    {
      "title": "RTCPeerConnection",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection"
    },
    {
      "title": "RTCPeerConnection: getStats() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/getStats"
    },
    {
      "title": "RTCInboundRtpStreamStats",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/RTCInboundRtpStreamStats"
    },
    {
      "title": "Identifiers for WebRTC's Statistics API",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/webrtc-stats/"
    },
    {
      "title": "MediaTrackConstraints: facingMode property",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/facingMode"
    },
    {
      "title": "MediaTrackConstraints: latency property",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/latency"
    }
  ],
  "video": [
    {
      "title": "MediaDevices: getUserMedia() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    }
  ],
  "audio": [
    {
      "title": "MediaDevices: getUserMedia() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    }
  ],
  "width": [
    {
      "title": "MediaTrackConstraints: width property",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/width"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    },
    {
      "title": "Capabilities, constraints, and settings",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Constraints"
    },
    {
      "title": "MediaStreamTrack: getSettings() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getSettings"
    }
  ],
  "height": [
    {
      "title": "MediaTrackConstraints: height property",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/height"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    },
    {
      "title": "MediaStreamTrack: getSettings() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getSettings"
    }
  ],
  "frameRate": [
    {
      "title": "MediaTrackConstraints: frameRate property",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/frameRate"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    }
  ],
  "aspectRatio": [
    {
      "title": "MediaTrackConstraints: aspectRatio property",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/aspectRatio"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    },
    {
      "title": "Screen Capture",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-screen-share/"
    },
    {
      "title": "MediaDevices: getSupportedConstraints() method (and its compatibility table)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getSupportedConstraints"
    }
  ],
  "facingMode": [
    {
      "title": "MediaTrackConstraints: facingMode property",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/facingMode"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    }
  ],
  "resizeMode": [
    {
      "title": "MediaTrackConstraints",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    },
    {
      "title": "Screen Capture",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-screen-share/"
    },
    {
      "title": "Firefox 144 release notes for developers",
      "by": "MDN Web Docs (Mozilla)",
      "year": 2025,
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/144"
    },
    {
      "title": "MediaDevices: getSupportedConstraints() method (and its compatibility table)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getSupportedConstraints"
    }
  ],
  "echoCancellation": [
    {
      "title": "MediaTrackConstraints: echoCancellation property",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/echoCancellation"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    },
    {
      "title": "media_stream_constraints_util_audio.cc: default audio processing",
      "by": "Chromium",
      "where": "Chromium source (main branch)",
      "url": "https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/mediastream/media_stream_constraints_util_audio.cc"
    },
    {
      "title": "all.js: default getUserMedia audio processing preferences",
      "by": "Mozilla",
      "where": "Firefox source (main branch, GitHub)",
      "url": "https://github.com/mozilla-firefox/firefox/blob/main/modules/libpref/init/all.js"
    },
    {
      "title": "MediaDevices: getSupportedConstraints() method (and its compatibility table)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getSupportedConstraints"
    }
  ],
  "noiseSuppression": [
    {
      "title": "MediaTrackConstraints: noiseSuppression property",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/noiseSuppression"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    },
    {
      "title": "media_stream_constraints_util_audio.cc: default audio processing",
      "by": "Chromium",
      "where": "Chromium source (main branch)",
      "url": "https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/mediastream/media_stream_constraints_util_audio.cc"
    },
    {
      "title": "all.js: default getUserMedia audio processing preferences",
      "by": "Mozilla",
      "where": "Firefox source (main branch, GitHub)",
      "url": "https://github.com/mozilla-firefox/firefox/blob/main/modules/libpref/init/all.js"
    },
    {
      "title": "MediaDevices: getSupportedConstraints() method (and its compatibility table)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getSupportedConstraints"
    }
  ],
  "autoGainControl": [
    {
      "title": "MediaTrackConstraints: autoGainControl property",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/autoGainControl"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    },
    {
      "title": "media_stream_constraints_util_audio.cc: default audio processing",
      "by": "Chromium",
      "where": "Chromium source (main branch)",
      "url": "https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/mediastream/media_stream_constraints_util_audio.cc"
    },
    {
      "title": "all.js: default getUserMedia audio processing preferences",
      "by": "Mozilla",
      "where": "Firefox source (main branch, GitHub)",
      "url": "https://github.com/mozilla-firefox/firefox/blob/main/modules/libpref/init/all.js"
    },
    {
      "title": "MediaDevices: getSupportedConstraints() method (and its compatibility table)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getSupportedConstraints"
    }
  ],
  "voiceIsolation": [
    {
      "title": "Media Capture and Streams Extensions",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-extensions/"
    },
    {
      "title": "Support in Chrome for the VoiceIsolation getUserMedia constraint",
      "by": "Chrome Platform Status",
      "where": "chromestatus.com",
      "url": "https://chromestatus.com/feature/5106413661847552"
    }
  ],
  "sampleRate": [
    {
      "title": "MediaTrackConstraints: sampleRate property",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/sampleRate"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    },
    {
      "title": "MediaDevices: getSupportedConstraints() method (and its compatibility table)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getSupportedConstraints"
    },
    {
      "title": "AudioContext: AudioContext() constructor",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext"
    },
    {
      "title": "Digital audio concepts",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_concepts"
    }
  ],
  "sampleSize": [
    {
      "title": "MediaTrackConstraints: sampleSize property",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/sampleSize"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    },
    {
      "title": "MediaDevices: getSupportedConstraints() method (and its compatibility table)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getSupportedConstraints"
    },
    {
      "title": "Web Audio API 1.1",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://webaudio.github.io/web-audio-api/"
    }
  ],
  "channelCount": [
    {
      "title": "MediaTrackConstraints: channelCount property",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/channelCount"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    },
    {
      "title": "MediaDevices: getSupportedConstraints() method (and its compatibility table)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getSupportedConstraints"
    }
  ],
  "latency": [
    {
      "title": "MediaTrackConstraints: latency property",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/latency"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    },
    {
      "title": "MediaDevices: getSupportedConstraints() method (and its compatibility table)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getSupportedConstraints"
    }
  ],
  "strict": [
    {
      "title": "MediaTrackConstraints",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints"
    },
    {
      "title": "Capabilities, constraints, and settings",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Constraints"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    },
    {
      "title": "Screen Capture",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-screen-share/"
    },
    {
      "title": "OverconstrainedError",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/OverconstrainedError"
    },
    {
      "title": "MediaStreamError.webidl: Firefox's capture errors",
      "by": "Mozilla",
      "where": "Firefox source (main branch, GitHub)",
      "url": "https://github.com/mozilla-firefox/firefox/blob/main/dom/webidl/MediaStreamError.webidl"
    }
  ],
  "displaySurface": [
    {
      "title": "MediaTrackConstraints: displaySurface property",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/displaySurface"
    },
    {
      "title": "Privacy-preserving screen sharing controls",
      "by": "François Beaufort, Elad Alon (Google)",
      "where": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/web-platform/screen-sharing-controls"
    },
    {
      "title": "Screen Capture",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-screen-share/"
    },
    {
      "title": "MediaDevices: getDisplayMedia() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia"
    }
  ],
  "displayAudio": [
    {
      "title": "MediaDevices: getDisplayMedia() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia"
    },
    {
      "title": "Using the Screen Capture API",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API/Using_Screen_Capture"
    },
    {
      "title": "Privacy-preserving screen sharing controls",
      "by": "François Beaufort, Elad Alon (Google)",
      "where": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/web-platform/screen-sharing-controls"
    }
  ],
  "systemAudio": [
    {
      "title": "MediaDevices: getDisplayMedia() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia"
    },
    {
      "title": "Privacy-preserving screen sharing controls",
      "by": "François Beaufort, Elad Alon (Google)",
      "where": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/web-platform/screen-sharing-controls"
    },
    {
      "title": "Screen Capture",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-screen-share/"
    }
  ],
  "preferCurrentTab": [
    {
      "title": "MediaDevices: getDisplayMedia() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia"
    },
    {
      "title": "Privacy-preserving screen sharing controls",
      "by": "François Beaufort, Elad Alon (Google)",
      "where": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/web-platform/screen-sharing-controls"
    }
  ],
  "selfBrowserSurface": [
    {
      "title": "MediaDevices: getDisplayMedia() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia"
    },
    {
      "title": "Privacy-preserving screen sharing controls",
      "by": "François Beaufort, Elad Alon (Google)",
      "where": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/web-platform/screen-sharing-controls"
    }
  ],
  "surfaceSwitching": [
    {
      "title": "MediaDevices: getDisplayMedia() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia"
    },
    {
      "title": "Privacy-preserving screen sharing controls",
      "by": "François Beaufort, Elad Alon (Google)",
      "where": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/web-platform/screen-sharing-controls"
    }
  ],
  "monitorTypeSurfaces": [
    {
      "title": "MediaDevices: getDisplayMedia() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia"
    },
    {
      "title": "Privacy-preserving screen sharing controls",
      "by": "François Beaufort, Elad Alon (Google)",
      "where": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/web-platform/screen-sharing-controls"
    }
  ],
  "suppressLocalAudioPlayback": [
    {
      "title": "MediaTrackConstraints: suppressLocalAudioPlayback property",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/suppressLocalAudioPlayback"
    },
    {
      "title": "Screen Capture",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-screen-share/"
    }
  ],
  "displayFrameRate": [
    {
      "title": "Screen Capture",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-screen-share/"
    },
    {
      "title": "Using the Screen Capture API",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API/Using_Screen_Capture"
    },
    {
      "title": "MediaTrackConstraints",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints"
    },
    {
      "title": "WebKit Features in Safari 17.4",
      "by": "WebKit",
      "year": 2024,
      "where": "WebKit blog",
      "url": "https://webkit.org/blog/15063/webkit-features-in-safari-17-4/"
    }
  ],
  "cursor": [
    {
      "title": "Screen Capture",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-screen-share/"
    },
    {
      "title": "MediaDevices: getSupportedConstraints() method (and its compatibility table)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getSupportedConstraints"
    }
  ],
  "logicalSurface": [
    {
      "title": "MediaTrackConstraints: logicalSurface property",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/logicalSurface"
    },
    {
      "title": "Using the Screen Capture API",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API/Using_Screen_Capture"
    },
    {
      "title": "Screen Capture",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-screen-share/"
    }
  ],
  "synthSize": [
    {
      "title": "HTMLCanvasElement: captureStream() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream"
    }
  ],
  "synthFps": [
    {
      "title": "HTMLCanvasElement: captureStream() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream"
    },
    {
      "title": "CanvasCaptureMediaStreamTrack: requestFrame() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/CanvasCaptureMediaStreamTrack/requestFrame"
    }
  ],
  "group-start": [
    {
      "title": "MediaDevices: getUserMedia() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia"
    },
    {
      "title": "MediaDevices: getDisplayMedia() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia"
    },
    {
      "title": "MediaDevices: getSupportedConstraints() method (and its compatibility table)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getSupportedConstraints"
    }
  ],
  "group-record": [
    {
      "title": "MediaRecorder: MediaRecorder() constructor",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/MediaRecorder"
    },
    {
      "title": "MediaRecorder: start() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/start"
    }
  ],
  "mimeType": [
    {
      "title": "MediaRecorder: MediaRecorder() constructor",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/MediaRecorder"
    },
    {
      "title": "MediaRecorder: isTypeSupported() static method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static"
    },
    {
      "title": "MediaStream Recording",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-record/"
    },
    {
      "title": "media_recorder_handler.cc: the types MediaRecorder accepts, and seekable versus live WebM",
      "by": "Chromium",
      "where": "Chromium source (main branch)",
      "url": "https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/mediarecorder/media_recorder_handler.cc"
    },
    {
      "title": "MP4 container support for MediaRecorder",
      "by": "Chrome Platform Status",
      "where": "chromestatus.com",
      "url": "https://chromestatus.com/feature/5163469011943424"
    },
    {
      "title": "H26x Codec support updates for MediaRecorder",
      "by": "Chrome Platform Status",
      "where": "chromestatus.com",
      "url": "https://chromestatus.com/feature/6375884229181440"
    },
    {
      "title": "MediaRecorder.cpp: the types Firefox records",
      "by": "Mozilla",
      "where": "Firefox source (main branch, GitHub)",
      "url": "https://github.com/mozilla-firefox/firefox/blob/main/dom/media/MediaRecorder.cpp"
    },
    {
      "title": "MediaRecorder API",
      "by": "WebKit",
      "year": 2020,
      "where": "WebKit blog",
      "url": "https://webkit.org/blog/11353/mediarecorder-api/"
    },
    {
      "title": "WebKit Features in Safari 18.4",
      "by": "WebKit",
      "year": 2025,
      "where": "WebKit blog",
      "url": "https://webkit.org/blog/16574/webkit-features-in-safari-18-4/"
    },
    {
      "title": "WebKit Features in Safari 26.0",
      "by": "WebKit",
      "year": 2025,
      "where": "WebKit blog",
      "url": "https://webkit.org/blog/17333/webkit-features-in-safari-26-0/"
    }
  ],
  "videoBitsPerSecond": [
    {
      "title": "MediaRecorder: MediaRecorder() constructor",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/MediaRecorder"
    },
    {
      "title": "MediaRecorder: videoBitsPerSecond property",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/videoBitsPerSecond"
    },
    {
      "title": "MediaStream Recording",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-record/"
    }
  ],
  "audioBitsPerSecond": [
    {
      "title": "MediaRecorder: MediaRecorder() constructor",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/MediaRecorder"
    },
    {
      "title": "MediaRecorder: audioBitsPerSecond property",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/audioBitsPerSecond"
    },
    {
      "title": "Web audio codec guide",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs"
    },
    {
      "title": "media_recorder_handler.cc: the types MediaRecorder accepts, and seekable versus live WebM",
      "by": "Chromium",
      "where": "Chromium source (main branch)",
      "url": "https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/mediarecorder/media_recorder_handler.cc"
    }
  ],
  "audioBitrateMode": [
    {
      "title": "MediaRecorder: audioBitrateMode property",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/audioBitrateMode"
    },
    {
      "title": "MediaStream Recording",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-record/"
    },
    {
      "title": "Add support for encoding CBR audio files with MediaRecorder",
      "by": "Chrome Platform Status",
      "where": "chromestatus.com",
      "url": "https://chromestatus.com/feature/5730124735447040"
    },
    {
      "title": "MediaRecorder.webidl: Firefox's MediaRecorderOptions",
      "by": "Mozilla",
      "where": "Firefox source (main branch, GitHub)",
      "url": "https://github.com/mozilla-firefox/firefox/blob/main/dom/webidl/MediaRecorder.webidl"
    },
    {
      "title": "MediaRecorder.idl: WebKit's MediaRecorderOptions",
      "by": "WebKit",
      "where": "WebKit source (main branch, GitHub)",
      "url": "https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/mediarecorder/MediaRecorder.idl"
    }
  ],
  "videoKeyFrameIntervalDuration": [
    {
      "title": "MediaStream Recording",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-record/"
    },
    {
      "title": "MediaRecorder: MediaRecorder() constructor",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/MediaRecorder"
    },
    {
      "title": "media_recorder_options.idl: MediaRecorderOptions",
      "by": "Chromium",
      "where": "Chromium source (main branch)",
      "url": "https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/mediarecorder/media_recorder_options.idl"
    },
    {
      "title": "media_recorder.cc: key frame interval options",
      "by": "Chromium",
      "where": "Chromium source (main branch)",
      "url": "https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/mediarecorder/media_recorder.cc"
    },
    {
      "title": "MediaRecorder.webidl: Firefox's MediaRecorderOptions",
      "by": "Mozilla",
      "where": "Firefox source (main branch, GitHub)",
      "url": "https://github.com/mozilla-firefox/firefox/blob/main/dom/webidl/MediaRecorder.webidl"
    },
    {
      "title": "MediaRecorder.idl: WebKit's MediaRecorderOptions",
      "by": "WebKit",
      "where": "WebKit source (main branch, GitHub)",
      "url": "https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/mediarecorder/MediaRecorder.idl"
    }
  ],
  "timeslice": [
    {
      "title": "MediaRecorder: start() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/start"
    },
    {
      "title": "MediaRecorder: dataavailable event",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/dataavailable_event"
    },
    {
      "title": "MediaStream Recording",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-record/"
    },
    {
      "title": "media_recorder_handler.cc: the types MediaRecorder accepts, and seekable versus live WebM",
      "by": "Chromium",
      "where": "Chromium source (main branch)",
      "url": "https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/mediarecorder/media_recorder_handler.cc"
    },
    {
      "title": "Issue 40482588: MediaRecorder: consider producing seekable WebM files",
      "by": "Chromium",
      "where": "Chromium issue tracker",
      "url": "https://issues.chromium.org/issues/40482588"
    }
  ],
  "container": [
    {
      "title": "Media container formats (file types)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers"
    },
    {
      "title": "Introduction",
      "by": "Mediabunny",
      "where": "Mediabunny documentation",
      "url": "https://mediabunny.dev/guide/introduction"
    }
  ],
  "codec": [
    {
      "title": "Codec (glossary)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Glossary/Codec"
    },
    {
      "title": "Codecs in common media types",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/codecs_parameter"
    },
    {
      "title": "MediaStream Recording",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-record/"
    },
    {
      "title": "Digital audio concepts",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_concepts"
    }
  ],
  "webm": [
    {
      "title": "Media container formats (file types)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers"
    },
    {
      "title": "WebM Container Guidelines",
      "by": "The WebM Project",
      "where": "webmproject.org",
      "url": "https://www.webmproject.org/docs/container/"
    },
    {
      "title": "Issue 40482588: MediaRecorder: consider producing seekable WebM files",
      "by": "Chromium",
      "where": "Chromium issue tracker",
      "url": "https://issues.chromium.org/issues/40482588"
    },
    {
      "title": "media_recorder_handler.cc: the types MediaRecorder accepts, and seekable versus live WebM",
      "by": "Chromium",
      "where": "Chromium source (main branch)",
      "url": "https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/mediarecorder/media_recorder_handler.cc"
    },
    {
      "title": "MediaRecorder.cpp: the types Firefox records",
      "by": "Mozilla",
      "where": "Firefox source (main branch, GitHub)",
      "url": "https://github.com/mozilla-firefox/firefox/blob/main/dom/media/MediaRecorder.cpp"
    },
    {
      "title": "WebKit Features in Safari 18.4",
      "by": "WebKit",
      "year": 2025,
      "where": "WebKit blog",
      "url": "https://webkit.org/blog/16574/webkit-features-in-safari-18-4/"
    }
  ],
  "mp4": [
    {
      "title": "Media container formats (file types)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers"
    },
    {
      "title": "MP4 container support for MediaRecorder",
      "by": "Chrome Platform Status",
      "where": "chromestatus.com",
      "url": "https://chromestatus.com/feature/5163469011943424"
    },
    {
      "title": "H26x Codec support updates for MediaRecorder",
      "by": "Chrome Platform Status",
      "where": "chromestatus.com",
      "url": "https://chromestatus.com/feature/6375884229181440"
    },
    {
      "title": "media_recorder_handler.cc: the types MediaRecorder accepts, and seekable versus live WebM",
      "by": "Chromium",
      "where": "Chromium source (main branch)",
      "url": "https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/mediarecorder/media_recorder_handler.cc"
    },
    {
      "title": "MediaRecorder API",
      "by": "WebKit",
      "year": 2020,
      "where": "WebKit blog",
      "url": "https://webkit.org/blog/11353/mediarecorder-api/"
    },
    {
      "title": "WebKit Features in Safari 18.4",
      "by": "WebKit",
      "year": 2025,
      "where": "WebKit blog",
      "url": "https://webkit.org/blog/16574/webkit-features-in-safari-18-4/"
    }
  ],
  "matroska": [
    {
      "title": "RFC 9559: Matroska Media Container Format Specification",
      "by": "IETF",
      "year": 2024,
      "where": "RFC Editor",
      "url": "https://www.rfc-editor.org/rfc/rfc9559.html"
    },
    {
      "title": "Matroska Streaming",
      "by": "Matroska.org",
      "where": "matroska.org",
      "url": "https://www.matroska.org/technical/streaming.html"
    },
    {
      "title": "WebM Container Guidelines",
      "by": "The WebM Project",
      "where": "webmproject.org",
      "url": "https://www.webmproject.org/docs/container/"
    },
    {
      "title": "media_recorder_handler.cc: the types MediaRecorder accepts, and seekable versus live WebM",
      "by": "Chromium",
      "where": "Chromium source (main branch)",
      "url": "https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/mediarecorder/media_recorder_handler.cc"
    },
    {
      "title": "Firefox 145 release notes for developers",
      "by": "MDN Web Docs (Mozilla)",
      "year": 2025,
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/145"
    }
  ],
  "ogg": [
    {
      "title": "Media container formats (file types)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers"
    },
    {
      "title": "Web audio codec guide",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs"
    },
    {
      "title": "RFC 7845: Ogg Encapsulation for the Opus Audio Codec",
      "by": "IETF",
      "year": 2016,
      "where": "RFC Editor",
      "url": "https://www.rfc-editor.org/rfc/rfc7845"
    },
    {
      "title": "MediaRecorder.cpp: the types Firefox records",
      "by": "Mozilla",
      "where": "Firefox source (main branch, GitHub)",
      "url": "https://github.com/mozilla-firefox/firefox/blob/main/dom/media/MediaRecorder.cpp"
    }
  ],
  "vp8": [
    {
      "title": "Web video codec guide",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Video_codecs"
    },
    {
      "title": "RFC 6386: VP8 Data Format and Decoding Guide",
      "by": "IETF",
      "year": 2011,
      "where": "RFC Editor",
      "url": "https://www.rfc-editor.org/rfc/rfc6386"
    },
    {
      "title": "Codecs used by WebRTC",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/WebRTC_codecs"
    },
    {
      "title": "WebM Container Guidelines",
      "by": "The WebM Project",
      "where": "webmproject.org",
      "url": "https://www.webmproject.org/docs/container/"
    }
  ],
  "vp9": [
    {
      "title": "Web video codec guide",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Video_codecs"
    },
    {
      "title": "WebM Container Guidelines",
      "by": "The WebM Project",
      "where": "webmproject.org",
      "url": "https://www.webmproject.org/docs/container/"
    },
    {
      "title": "media_recorder_handler.cc: the types MediaRecorder accepts, and seekable versus live WebM",
      "by": "Chromium",
      "where": "Chromium source (main branch)",
      "url": "https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/mediarecorder/media_recorder_handler.cc"
    },
    {
      "title": "WebKit Features in Safari 18.4",
      "by": "WebKit",
      "year": 2025,
      "where": "WebKit blog",
      "url": "https://webkit.org/blog/16574/webkit-features-in-safari-18-4/"
    }
  ],
  "av1": [
    {
      "title": "Web video codec guide",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Video_codecs"
    },
    {
      "title": "AV1 Bitstream & Decoding Process Specification",
      "by": "Alliance for Open Media",
      "where": "AOMedia",
      "url": "https://aomediacodec.github.io/av1-spec/"
    },
    {
      "title": "media_recorder_handler.cc: the types MediaRecorder accepts, and seekable versus live WebM",
      "by": "Chromium",
      "where": "Chromium source (main branch)",
      "url": "https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/mediarecorder/media_recorder_handler.cc"
    },
    {
      "title": "WebKit Features in Safari 18.4",
      "by": "WebKit",
      "year": 2025,
      "where": "WebKit blog",
      "url": "https://webkit.org/blog/16574/webkit-features-in-safari-18-4/"
    }
  ],
  "h264": [
    {
      "title": "Web video codec guide",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Video_codecs"
    },
    {
      "title": "Codecs in common media types",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/codecs_parameter"
    },
    {
      "title": "Codecs used by WebRTC",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/WebRTC_codecs"
    },
    {
      "title": "media_recorder_handler.cc: the types MediaRecorder accepts, and seekable versus live WebM",
      "by": "Chromium",
      "where": "Chromium source (main branch)",
      "url": "https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/mediarecorder/media_recorder_handler.cc"
    },
    {
      "title": "Media container formats (file types)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers"
    }
  ],
  "opus": [
    {
      "title": "Web audio codec guide",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs"
    },
    {
      "title": "RFC 6716: Definition of the Opus Audio Codec",
      "by": "IETF",
      "year": 2012,
      "where": "RFC Editor",
      "url": "https://www.rfc-editor.org/rfc/rfc6716"
    },
    {
      "title": "Codecs used by WebRTC",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/WebRTC_codecs"
    }
  ],
  "aac": [
    {
      "title": "Web audio codec guide",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs"
    },
    {
      "title": "Codecs in common media types",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/codecs_parameter"
    },
    {
      "title": "Media container formats (file types)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers"
    },
    {
      "title": "media_recorder_handler.cc: the types MediaRecorder accepts, and seekable versus live WebM",
      "by": "Chromium",
      "where": "Chromium source (main branch)",
      "url": "https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/mediarecorder/media_recorder_handler.cc"
    }
  ],
  "pcm": [
    {
      "title": "Digital audio concepts",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_concepts"
    },
    {
      "title": "media_recorder_handler.cc: the types MediaRecorder accepts, and seekable versus live WebM",
      "by": "Chromium",
      "where": "Chromium source (main branch)",
      "url": "https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/mediarecorder/media_recorder_handler.cc"
    },
    {
      "title": "WebKit Features in Safari 18.4",
      "by": "WebKit",
      "year": 2025,
      "where": "WebKit blog",
      "url": "https://webkit.org/blog/16574/webkit-features-in-safari-18-4/"
    },
    {
      "title": "WebKit Features in Safari 26.0",
      "by": "WebKit",
      "year": 2025,
      "where": "WebKit blog",
      "url": "https://webkit.org/blog/17333/webkit-features-in-safari-26-0/"
    }
  ],
  "remux": [
    {
      "title": "Issue 40482588: MediaRecorder: consider producing seekable WebM files",
      "by": "Chromium",
      "where": "Chromium issue tracker",
      "url": "https://issues.chromium.org/issues/40482588"
    },
    {
      "title": "Re-enable MediaRecorderSeekableWebm by default (change 6723416)",
      "by": "Chromium",
      "year": 2025,
      "where": "Chromium code review",
      "url": "https://chromium-review.googlesource.com/c/chromium/src/+/6723416"
    },
    {
      "title": "media_recorder_handler.cc: the types MediaRecorder accepts, and seekable versus live WebM",
      "by": "Chromium",
      "where": "Chromium source (main branch)",
      "url": "https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/mediarecorder/media_recorder_handler.cc"
    },
    {
      "title": "Matroska Streaming",
      "by": "Matroska.org",
      "where": "matroska.org",
      "url": "https://www.matroska.org/technical/streaming.html"
    },
    {
      "title": "Converting media files",
      "by": "Mediabunny",
      "where": "Mediabunny documentation",
      "url": "https://mediabunny.dev/guide/converting-media-files"
    }
  ],
  "key-frame": [
    {
      "title": "Web video codec guide",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Video_codecs"
    },
    {
      "title": "MediaStream Recording",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-record/"
    }
  ],
  "bitrate": [
    {
      "title": "Digital audio concepts",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_concepts"
    },
    {
      "title": "MediaStream Recording",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-record/"
    }
  ],
  "api-getUserMedia": [
    {
      "title": "MediaDevices: getUserMedia() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    }
  ],
  "api-getDisplayMedia": [
    {
      "title": "MediaDevices: getDisplayMedia() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia"
    },
    {
      "title": "Screen Capture",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-screen-share/"
    }
  ],
  "api-enumerateDevices": [
    {
      "title": "MediaDevices: enumerateDevices() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    },
    {
      "title": "Firefox 116 release notes for developers",
      "by": "MDN Web Docs (Mozilla)",
      "year": 2023,
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/116"
    },
    {
      "title": "WebKit Features for Safari 26.4",
      "by": "WebKit",
      "year": 2026,
      "where": "WebKit blog",
      "url": "https://webkit.org/blog/17862/webkit-features-for-safari-26-4/"
    }
  ],
  "api-MediaRecorder": [
    {
      "title": "MediaRecorder",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder"
    },
    {
      "title": "MediaStream Recording API",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API"
    },
    {
      "title": "MediaStream Recording",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-record/"
    }
  ],
  "api-AudioWorklet": [
    {
      "title": "AudioWorklet",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet"
    },
    {
      "title": "AudioWorkletNode",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletNode"
    },
    {
      "title": "Background audio processing using AudioWorklet",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet"
    }
  ],
  "api-HTMLMediaElement.captureStream": [
    {
      "title": "HTMLMediaElement: captureStream() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/captureStream"
    },
    {
      "title": "Media Capture from DOM Elements",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-fromelement/"
    },
    {
      "title": "Firefox 149 release notes for developers",
      "by": "MDN Web Docs (Mozilla)",
      "year": 2026,
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/149"
    },
    {
      "title": "Bug 275695: HTMLMediaElement: captureStream() method isn't implemented in Safari",
      "by": "WebKit",
      "where": "WebKit Bugzilla",
      "url": "https://bugs.webkit.org/show_bug.cgi?id=275695"
    }
  ],
  "api-HTMLMediaElement.mozCaptureStream": [
    {
      "title": "HTMLMediaElement: captureStream() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/captureStream"
    },
    {
      "title": "Firefox 149 release notes for developers",
      "by": "MDN Web Docs (Mozilla)",
      "year": 2026,
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/149"
    }
  ],
  "api-HTMLCanvasElement.captureStream": [
    {
      "title": "HTMLCanvasElement: captureStream() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream"
    },
    {
      "title": "CanvasCaptureMediaStreamTrack: requestFrame() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/CanvasCaptureMediaStreamTrack/requestFrame"
    },
    {
      "title": "CanvasCaptureMediaStreamTrack",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/CanvasCaptureMediaStreamTrack"
    },
    {
      "title": "CanvasCaptureMediaStream.webidl",
      "by": "Mozilla",
      "where": "Firefox source (main branch, GitHub)",
      "url": "https://github.com/mozilla-firefox/firefox/blob/main/dom/webidl/CanvasCaptureMediaStream.webidl"
    }
  ],
  "api-requestVideoFrameCallback": [
    {
      "title": "HTMLVideoElement: requestVideoFrameCallback() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback"
    },
    {
      "title": "HTMLVideoElement.requestVideoFrameCallback()",
      "by": "WICG",
      "where": "Draft Community Group Report",
      "url": "https://wicg.github.io/video-rvfc/"
    },
    {
      "title": "Firefox 132 release notes for developers",
      "by": "MDN Web Docs (Mozilla)",
      "year": 2024,
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/132"
    },
    {
      "title": "Perform efficient per-video-frame operations on video with requestVideoFrameCallback()",
      "by": "web.dev (Google)",
      "where": "web.dev",
      "url": "https://web.dev/articles/requestvideoframecallback-rvfc"
    }
  ],
  "api-RTCPeerConnection": [
    {
      "title": "RTCPeerConnection",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection"
    },
    {
      "title": "WebRTC: Real-Time Communication in Browsers",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/webrtc-pc/"
    }
  ],
  "api-CaptureController": [
    {
      "title": "CaptureController",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/CaptureController"
    },
    {
      "title": "Better screen sharing with Conditional Focus",
      "by": "François Beaufort, Elad Alon (Google)",
      "where": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/web-platform/conditional-focus"
    },
    {
      "title": "Scroll and zoom a captured tab",
      "by": "Chrome for Developers (Google)",
      "where": "developer.chrome.com",
      "url": "https://developer.chrome.com/docs/web-platform/captured-surface-control"
    }
  ],
  "api-MediaStreamTrackProcessor": [
    {
      "title": "MediaStreamTrackProcessor",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrackProcessor"
    },
    {
      "title": "MediaStreamTrack Insertable Media Processing using Streams",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-transform/"
    },
    {
      "title": "Insertable streams for MediaStreamTrack",
      "by": "Chrome for Developers (Google)",
      "where": "developer.chrome.com",
      "url": "https://developer.chrome.com/docs/capabilities/web-apis/mediastreamtrack-insertable-media-processing"
    },
    {
      "title": "WebKit Features in Safari 18.0",
      "by": "WebKit",
      "year": 2024,
      "where": "WebKit blog",
      "url": "https://webkit.org/blog/15865/webkit-features-in-safari-18-0/"
    }
  ],
  "api-VideoEncoder": [
    {
      "title": "VideoEncoder",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder"
    },
    {
      "title": "WebCodecs",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/webcodecs/"
    },
    {
      "title": "Firefox 130 release notes for developers",
      "by": "MDN Web Docs (Mozilla)",
      "year": 2024,
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/130"
    }
  ],
  "api-AudioEncoder": [
    {
      "title": "AudioEncoder",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/AudioEncoder"
    },
    {
      "title": "WebCodecs",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/webcodecs/"
    },
    {
      "title": "WebKit Features in Safari 26.0",
      "by": "WebKit",
      "year": 2025,
      "where": "WebKit blog",
      "url": "https://webkit.org/blog/17333/webkit-features-in-safari-26-0/"
    }
  ],
  "api-VideoDecoder": [
    {
      "title": "VideoDecoder",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/VideoDecoder"
    },
    {
      "title": "WebCodecs",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/webcodecs/"
    },
    {
      "title": "Introduction",
      "by": "Mediabunny",
      "where": "Mediabunny documentation",
      "url": "https://mediabunny.dev/guide/introduction"
    }
  ],
  "api-ImageCapture": [
    {
      "title": "ImageCapture",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/ImageCapture"
    },
    {
      "title": "MediaStream Image Capture",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-image/"
    },
    {
      "title": "WebKit Features in Safari 18.4",
      "by": "WebKit",
      "year": 2025,
      "where": "WebKit blog",
      "url": "https://webkit.org/blog/16574/webkit-features-in-safari-18-4/"
    }
  ],
  "api-SpeechRecognition": [
    {
      "title": "SpeechRecognition",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition"
    },
    {
      "title": "Web Speech API",
      "by": "W3C Audio Community Group",
      "where": "Draft Community Group Report",
      "url": "https://webaudio.github.io/web-speech-api/"
    },
    {
      "title": "Firefox 158 release notes for developers",
      "by": "MDN Web Docs (Mozilla)",
      "year": 2026,
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/158"
    }
  ],
  "api-Permissions API": [
    {
      "title": "Permissions: query() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/Permissions/query"
    },
    {
      "title": "Permissions API",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API"
    },
    {
      "title": "Permissions",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/permissions/"
    },
    {
      "title": "Firefox 132 release notes for developers",
      "by": "MDN Web Docs (Mozilla)",
      "year": 2024,
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/132"
    }
  ],
  "api-StorageManager.estimate": [
    {
      "title": "StorageManager: estimate() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate"
    },
    {
      "title": "Storage Standard",
      "by": "WHATWG",
      "where": "WHATWG Living Standard",
      "url": "https://storage.spec.whatwg.org/"
    }
  ],
  "wav": [
    {
      "title": "Media container formats (file types)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers"
    },
    {
      "title": "Digital audio concepts",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_concepts"
    }
  ],
  "dbfs": [
    {
      "title": "Web Audio API 1.1",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://webaudio.github.io/web-audio-api/"
    },
    {
      "title": "Digital audio concepts",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_concepts"
    }
  ],
  "rms": [
    {
      "title": "Identifiers for WebRTC's Statistics API",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/webrtc-stats/"
    }
  ],
  "sample-rate": [
    {
      "title": "Digital audio concepts",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_concepts"
    },
    {
      "title": "AudioContext: AudioContext() constructor",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext"
    },
    {
      "title": "BaseAudioContext: sampleRate property",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/sampleRate"
    },
    {
      "title": "Web audio codec guide",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs"
    }
  ],
  "webcodecs": [
    {
      "title": "WebCodecs API",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API"
    },
    {
      "title": "WebCodecs",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/webcodecs/"
    },
    {
      "title": "Video processing with WebCodecs",
      "by": "Chrome for Developers (Google)",
      "where": "developer.chrome.com",
      "url": "https://developer.chrome.com/docs/web-platform/best-practices/webcodecs"
    },
    {
      "title": "Firefox 130 release notes for developers",
      "by": "MDN Web Docs (Mozilla)",
      "year": 2024,
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/130"
    },
    {
      "title": "WebKit Features in Safari 26.0",
      "by": "WebKit",
      "year": 2025,
      "where": "WebKit blog",
      "url": "https://webkit.org/blog/17333/webkit-features-in-safari-26-0/"
    }
  ],
  "webrtc-term": [
    {
      "title": "WebRTC API",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API"
    },
    {
      "title": "WebRTC (glossary)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Glossary/WebRTC"
    },
    {
      "title": "WebRTC: Real-Time Communication in Browsers",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/webrtc-pc/"
    },
    {
      "title": "Codecs used by WebRTC",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/WebRTC_codecs"
    },
    {
      "title": "RTP (Real-time Transport Protocol) and SRTP (glossary)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Glossary/RTP"
    }
  ],
  "audioworklet": [
    {
      "title": "AudioWorklet",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet"
    },
    {
      "title": "Background audio processing using AudioWorklet",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet"
    },
    {
      "title": "Web Audio API 1.1",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://webaudio.github.io/web-audio-api/"
    }
  ],
  "secure-context": [
    {
      "title": "Secure contexts",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts"
    },
    {
      "title": "Secure context (glossary)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Glossary/Secure_Context"
    },
    {
      "title": "Secure Contexts",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/webappsec-secure-contexts/"
    },
    {
      "title": "MediaDevices: getUserMedia() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia"
    },
    {
      "title": "WebKit Features for Safari 26.4",
      "by": "WebKit",
      "year": 2026,
      "where": "WebKit blog",
      "url": "https://webkit.org/blog/17862/webkit-features-for-safari-26-4/"
    }
  ],
  "OverconstrainedError": [
    {
      "title": "OverconstrainedError",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/OverconstrainedError"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    },
    {
      "title": "MediaDevices: getUserMedia() method",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia"
    },
    {
      "title": "MediaStreamError.webidl: Firefox's capture errors",
      "by": "Mozilla",
      "where": "Firefox source (main branch, GitHub)",
      "url": "https://github.com/mozilla-firefox/firefox/blob/main/dom/webidl/MediaStreamError.webidl"
    }
  ],
  "chromium": [
    {
      "title": "The Chromium Projects",
      "by": "Chromium",
      "where": "chromium.org",
      "url": "https://www.chromium.org/Home"
    },
    {
      "title": "Google Chrome (glossary)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Glossary/Google_Chrome"
    },
    {
      "title": "Blink (glossary)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Glossary/Blink"
    },
    {
      "title": "Microsoft Edge (glossary)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Glossary/Microsoft_Edge"
    }
  ],
  "media-stream": [
    {
      "title": "MediaStream",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaStream"
    },
    {
      "title": "MediaStreamTrack",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack"
    },
    {
      "title": "Media Capture and Streams API (Media Stream)",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    },
    {
      "title": "Firefox 132 release notes for developers",
      "by": "MDN Web Docs (Mozilla)",
      "year": 2024,
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/132"
    }
  ],
  "constraints": [
    {
      "title": "Capabilities, constraints, and settings",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Constraints"
    },
    {
      "title": "MediaTrackConstraints",
      "by": "MDN Web Docs (Mozilla)",
      "where": "MDN",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints"
    },
    {
      "title": "Media Capture and Streams",
      "by": "W3C WebRTC Working Group",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-main/"
    },
    {
      "title": "Screen Capture",
      "by": "W3C",
      "where": "W3C Editor's Draft",
      "url": "https://w3c.github.io/mediacapture-screen-share/"
    }
  ]
};
