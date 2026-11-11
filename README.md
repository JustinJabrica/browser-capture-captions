# browser-capture-captions

**A study of in-browser media capture that writes its own subtitles.** A test
bench that captures video and audio in the browser, from every kind of source
the web platform offers, and aims to caption what it hears as it records,
with a speech model running in the page. Everything runs on this computer: no
service, no upload, nothing to pay for.

It joins two earlier studies, both private repositories of the same author:

- browser-media-capture (from commit `54a2d7b`): the capture bench, its
  recorders and its measurements.
- automatic-speech-recognition-and-diarization (from commit `7e293e0`):
  speech recognition in the page, with a local Whisper model.

**Where it stands.** The capture bench runs from this repo. It captions what
it hears while a source is open, and each take is saved with a transcript of
what was said while it recorded, timed on the recording: see
[Live captions](#live-captions) and
[Transcripts and subtitles](#transcripts-and-subtitles). Subtitles written
into the file itself come next (see the [Roadmap](#roadmap)). Most of this
page still describes the capture bench as it came over.

It's plain modern JavaScript, with no framework, bundler or build step.

## Quick start

```sh
npm install
npm run download-model whisper-tiny.en    # optional: 90 MB into models/
npm start
```

Open <http://127.0.0.1:8100/> in Chrome, Edge or Firefox. Captions are on at
first, so the first source you open loads a speech model: from `models/` if
you downloaded one, otherwise 41 MB from the Hugging Face hub, which the
browser then keeps. Turn `captions` off in the Captions tab for the capture
bench alone.

 If the page loads but nothing works, it says why at the top (opened as a file, a file that didn't load, or the error that stopped it). Blockers' lists include rules for any site by file name, so `npm run check:blockers` checks that none of the bench's files would be blocked: EasyPrivacy's `/analyse.js` rule once stopped the whole bench in a Firefox with uBlock Origin. Capture needs a
secure context, and `http://127.0.0.1` and `http://localhost` count. To
test on a phone, a tablet or another computer (Safari on an iPhone or a Mac
among them), see
[Other devices on your network](#other-devices-on-your-network).

## The bench

<http://127.0.0.1:8100/> is the capture bench. It can capture from:

| Source | How | Notes |
| --- | --- | --- |
| **Camera & mic** | `getUserMedia()` | Camera, microphone or both. Pick the devices in the toolbar |
| **Two cameras** | `getUserMedia()` twice, drawn side by side on a canvas that's recorded (`canvas.captureStream()`) | Camera 1 on the left, camera 2 on the right, with the microphone when `audio` is on. A recorder keeps one video track, so this is how one file holds both. Camera 1 sets the picture's pace; each camera's own frames are timed as they reach the page (`requestVideoFrameCallback()`). The same camera twice is the control |
| **Two mics** | `getUserMedia()` twice, joined with Web Audio's `ChannelMergerNode` | One microphone in each channel of a stereo track: the first left, the second right. With a microphone in front of each speaker, each channel is a reference for one voice, as speaker diarization is tested. The same microphone twice is the control |
| **Screen** | `getDisplayMedia()` | A screen, window or tab. Only Chromium browsers share sound: a tab's, or the system's when sharing a screen |
| **Media file** | a `<video>` element, captured as it plays | A sample, your own file (Browse, or drop one on the page), or a video from a phone's camera app (**Camera app…**, `<input capture>`). Chromium and Firefox use `captureStream()`. Safari has none, so the bench builds the stream from Web Audio and a canvas |
| **Test signal** | `canvas.captureStream()` and Web Audio | Numbered frames, with a flash and a beep at the start of every second, so the take can be checked for dropped frames and A/V sync |

Two more steps can sit between any source and the recorder:

- **mixMic** mixes the microphone into the source's sound, as you would to
  narrate a screen share.
- **webrtc** sends the stream through a WebRTC connection on the same page.
  The take then hears what a call would deliver.

For each source:

- **Start preview** opens it.
- **Record** starts a take, opening the source first if it isn't open yet.
- **Stop** ends the take.
- A take also stops by itself:
  - when every track ends (you stop sharing, a device is unplugged)
  - when a file reaches its end
  - after `maxSeconds`, if set

While a source is open, the Live view shows:

- the picture, and a level meter per audio channel (RMS with a held peak, in
  dBFS)
- **what was asked for against what the browser gave**: every track's
  settings, with what was asked (the constraints), what it got
  (`getSettings()`) and what the device can do (`getCapabilities()`).
  Settings that came out differently from what was asked are marked.

The parameter panel groups every option by when it takes effect:

- **Each start**: `getUserMedia()` constraints, such as resolution, frame
  rate, `echoCancellation`, `noiseSuppression`, `autoGainControl`,
  `sampleRate` and `strict` (for exact values). Also the `getDisplayMedia()`
  options, the test signal's size and frame rate, and the pipeline switches.
  Constraints this browser doesn't know are tagged "not supported here".
- **Each record**: MediaRecorder's options. `mimeType` lists exactly what this
  browser says it can record. The others are bitrates, `audioBitrateMode`,
  `videoKeyFrameIntervalDuration`, `timeslice` and `maxSeconds`.
- **Analysis**: how the tap's WAV is stored, and the silence threshold.

The settings, the chosen source and the panel sizes are remembered between
visits.

On a phone, the bench fits the screen:
- At phone width, the header and the source picker are each one row that
  swipes sideways.
- On a touch screen, every control is at least 44 px, Apple's minimum touch
  target.
- Explanations work by touch (see [Explanations](#explanations)).

### Takes

Every take is analysed after **Stop** and saved in the browser (IndexedDB)
with four files:

- **the recording**, as the browser wrote it (`.webm`, `.mp4`, `.ogg`…), plus
  a **seekable copy** when the original declares no duration (see below)
- **tap.wav**: the lossless tap, every channel at the AudioContext's own rate
  (16-bit, or 32-bit float to keep it exactly as captured)
- **16k.wav**: the recording's audio as 16 kHz mono 16-bit, ready for
  transcription
- **report.json**: everything below

A recording with both sound and picture can also be downloaded as
**audio only** or **video only**. These are made when clicked, by copying
the packets out as they are (no re-encoding) with Mediabunny:

- Opus and Vorbis go into `.ogg`, AAC into `.m4a`, PCM into `.wav`.
- The picture goes into the recording's own kind of container: `.webm`,
  `.mp4`, or `.mkv` for a codec WebM can't hold.
- When the codec's usual container can't hold the track as it is, the
  recording's own kind is used (`.weba`, `.m4a`), then Matroska.
- The copy keeps the recording's timeline, so a container that would have
  to shift the track is skipped.
- If no container takes the codec as it is, the bench says so rather than
  re-encode.

Each take's card plays it back and draws the tap's and the file's waveforms
one above the other. It also lists what was measured:

| Group | What | Good when |
| --- | --- | --- |
| Durations | Recording (wall clock), the file from its packets, the duration the file declares, the decoded audio, the tap | The file declares a duration |
| Audio | The tap's format, the file's audio track, peak and RMS levels, clipped samples, silence, tap blocks lost | No clipping, no lost blocks |
| Sound | Loudness of the tap and the file ([ITU-R BS.1770](https://www.itu.int/rec/R-REC-BS.1770/en), in LUFS) and the change between them (each mixed to one channel and lined up); the loudest 400 ms; the noise floor and loud level (10th and 95th percentiles of 20 ms levels); bandwidth (the highest frequency within 60 dB of the strongest); DC offset; the stretches of sound in the 16 kHz copy, with the longest pause (each stretch's times are in the report) | The file within 1 LU of the tap |
| Cameras (Two cameras) | Each camera's picture size, frames and frame rate, gaps (as dropped frames), frames the page missed, longest gap and jitter; the time from a frame being taken to reaching the page (Chromium only); how far apart the two cameras take their frames | No dropped frames |
| Channels (when the tap has two or more) | How many channels the file kept; channel 2 against channel 1 (identical, or its lag and waveform match); which channel is loudest, as a share of the sound | The file keeps every channel |
| File against tap | Where the file's sound starts and ends against the tap; drift over the take (from 60 s); how alike the loudness and the waveform are | Starts and ends within 100 ms; drift within 45 ms; waveform match ≥ 0.9 |
| Video | The file's video track, frames, frame rate, key frames, gaps (as dropped frames), the longest gap, jitter | No dropped frames |
| Test signal | Frame numbers read back, missing and repeated frames, flashes and beeps, the A/V offset | No missing frames; the sound between 45 ms ahead of and 125 ms behind the picture ([ITU-R BT.1359](https://www.itu.int/rec/R-REC-BT.1359/en)'s detectability thresholds) |
| Recorder | The type it used and what was asked, bitrates, when the start event came, chunks and bytes, errors | No error |
| WebRTC loopback | The negotiated codecs, packets lost, frames dropped | Nothing lost |

The tap is the reference. It's the audio as it reached the page, before the
recorder's encoder touched it. Both come from the same stream, so any
difference between the tap and the recording comes from the recorder: its
codec, a late start or an early end. The browser's own processing (echo
cancellation and the rest) is applied before both, so it shows up as a
difference between takes recorded with different settings.

**Takes** lists every take in a sortable table, which can be filtered by
source:

- Click a take to open its card.
- Tick up to four to see their measurements side by side.
- **Export** writes the reports as JSON, and **Import** reads them in another
  browser. That's how takes made on a phone or another computer get
  compared with this one's. The files themselves are downloaded from each card.

**Browser** reports what this browser offers:

- which capture APIs exist
- which constraints it understands
- which of the bench's MIME candidates MediaRecorder accepts
- the permission states, the devices and the AudioContext's defaults

It can be saved as JSON.

### Explanations

Everything with a dotted underline explains itself: every setting,
measurement, column, chip, button and event. Hovering shows a short answer;
right-clicking offers the full article, with its sources (the W3C
specifications, MDN and the browsers' own documentation). On a touch screen,
touching and holding anything explained offers the article, and tapping a
setting's or measurement's name shows the short answer. The **Guide**
(`guide.html`) has every article, by section, with search. The explainer
engine is automatic-speech-recognition-and-diarization's.

## Live captions

While a source with sound is open, a speech model in the page captions it:
the caption just finished in white over the preview, and the words still
being worked out in a lighter colour. It runs in preview and while a take
records. The sound never leaves the browser.

```
the session's PcmTap (one AudioWorklet, the AudioContext's own rate and clock)
   ├─► levels, tap.wav, the WebCodecs recorder's fallback audio     as before
   └─► tap-feed.js     mono, lost frames filled with silence, resampled to 16 kHz;
        │              remembers the context frame of the first sample fed
        ▼
       Segmenter       20 ms frames, a speech detector, a pause ends an utterance
        │
        ▼
       engine worker   Whisper, through Transformers.js on ONNX Runtime Web
        │              (WebAssembly, or the encoder on WebGPU); one job at a time
        ▼
       segments        { start, end, transcript, confidence, latency }, in seconds
                       of the audio fed, so: context frame = first frame + seconds × rate
```

The engine is automatic-speech-recognition-and-diarization's, without its
speaker labels and server-side models. The one change of substance
is where its audio comes from. That bench captured a track through its own
AudioWorklet; here the engine is fed from the tap the take already uses, so
there is one worklet and one clock, and every caption can be placed on the
clock the take's start, pauses and end are counted on. That is what the next
stage needs to put captions on the saved file's timeline.

**Models.** The Captions tab lists the transcription models: Whisper tiny.en
(41 MB loaded), base.en (77 MB), small.en and Distil-Whisper small.en,
large-v3-turbo on WebGPU, and two CTC models. All but large-v3-turbo hear
English only.

- A model in `models/` loads from this server: `npm run download-model
  <id>` puts it there, and `npm run download-model -- --list` shows what is
  there. `models/` isn't committed.
- Any other model is fetched from the Hugging Face hub the first time it's
  used. The browser keeps it in its Cache Storage, so later loads need no
  network.
- The page asks the server which models it has (`models/index.json`) rather
  than probing for files, so a model that isn't there costs no failed
  requests.
- `model` is `automatic` at first: base.en when it's on the server, else
  tiny.en, the smallest download.

**Settings** (the Captions tab; each has its explanation on the bench):
`captions`, `model`, `device` (WebAssembly or WebGPU), the speech detector
(the bench's energy rule, WebRTC VAD or Silero VAD) and its level or
threshold, the pause that ends an utterance (800 ms), the longest utterance
(20 s), interim text and how often it's refreshed, and word times. They are
read when a source opens. A change of model, device or word times restarts
the engine. Three more shape a take's subtitles (the longest line, the most
lines, the longest time on screen) and are read when subtitles are made.

Under the preview, **Transcript** lists every utterance heard since the
source opened, with its times.

**The Captions chip** in the header shows the model's state: loading with its
progress, then the model and its thread count. One thread means the page
isn't cross-origin isolated, which costs about half the speed.

## Transcripts and subtitles

Each take is saved with a transcript: what was said while it recorded, every
utterance with its start and end **on the saved file's own timeline**. On the
take's card:

- the recording plays with the transcript as its subtitles (a `<track>` of
  WebVTT made from it);
- **Transcript** lists the utterances; the one being said is marked as the
  recording plays, and a click on a row plays from there;
- four downloads: `.vtt` and `.srt` (subtitles), `.txt` (an utterance a
  line, with its times) and `transcript.json` (the whole record);
- a **Captions** group of measurements: the model, how many captions and
  words, how long after each utterance its caption came, the model's working
  time against the speech's length, and the offset that placed the captions.

Transcripts are kept in IndexedDB beside the takes, and Export and Import
carry them.

### How a caption gets a time in the file

Everything is counted in AudioContext frames, the clock the tap counts on.

```
the captions' seconds  ─►  context frames   the feed: first frame + seconds × rate
context frames         ─►  take time        the tap: from the frame at Record, less the pauses
take time              ─►  file time        + one offset: where the take starts in the saved file
```

1. **Captions to frames.** The speech model is fed from the take's own tap,
   whose blocks carry the context frame they start at. The feed
   (`src/captions/tap-feed.js`) keeps the frame of the first sample it fed,
   and feeds silence for any frames the tap lost, so the sum stays exact.
2. **Frames to take time.** `PcmTap.record()`, `pause()`, `resume()` and
   `finish()` report the frame each took effect at. Take time is the frames
   since Record less the paused ranges (`src/captions/timeline.js`), which is
   the same arithmetic the tap uses to cut `tap.wav`: take time is, by
   construction, the position in the tap's recording.
3. **Take time to file time.** The one thing measured rather than counted.
   The analysis already finds where the tap's sound sits in the file's
   decoded sound (**Starts (file against tap)**); that, plus the audio
   track's first timestamp, is the offset. When that match is below 0.9 the
   offset is estimated: 0 (the recorder and the tap start together), or,
   for the WebCodecs recorder taking its sound from the tap, the exact
   figure from the timestamps it wrote.

**At a take's edges.** A caption in progress when the take starts, pauses,
resumes or stops is cut at exactly that frame: the feed splits the block
there and ends the utterance, so no caption spans an edge. A take keeps the
captions whose middle fell while it recorded. One that was cut, or that
begins where recording began (so its start was said outside the take), is
marked with scissors: its sentence may be unfinished.

**After Stop** the bench waits up to 20 s for the model to finish the last
captions, while the take is analysed. If it runs out, the transcript is
saved without them and says so.

### From utterances to subtitles

An utterance can be 20 s of speech, far more than a screen holds.
`src/captions/subtitles.js` cuts a transcript into subtitles of at most two
lines of 42 characters, up for at most 6 s, ending where a sentence does once
a subtitle has half a line or more. Subtitles never overlap, and one too
short to read is held until the next begins.

A long utterance is cut between words, so the words need times:

- **word times off** (the default): each utterance's time is shared out
  among its words by their length. Close enough to cut a caption into
  subtitles; a subtitle can start a word early or late.
- **from Whisper**: the model's `_timestamped` export is loaded in its
  place, and each word is timed from the decoder's cross-attention.
- **forced alignment**: a second model (wav2vec2) lines the caption's letters
  up with the sound, as WhisperX does.

The transcript is saved whole; subtitles are cut from it when the card is
shown and at each download, with the Captions tab's limits as they are then.

### What the caption tests have shown so far

On one Windows desktop, with fake devices, in Edge 157 and Firefox 161.
(An earlier version of this page and the first caption commit said Edge 156
and Firefox 160; the browsers had already updated.) All headless unless it
says otherwise.

**Live captions**

- **It works in both** on WebAssembly with four threads. Edge's fake
  microphone plays `fox.wav` on a loop, and every loop is captioned "The
  quick brown fox jumps over the lazy dog."; in both, `two-sentences.wav`
  played as a media file is captioned "Speech recognition now works in
  Firefox." and "Everything runs locally on this computer."
- **How late captions come depends on whether the window is visible.** In a
  visible Edge window (one take of 16 s, camera and microphone, tiny.en):
  final captions a median 0.80 s after each utterance ended, the model
  working 0.17 s for each second of speech, 15 interim texts. Headless,
  takes like it had their captions 3.1 to 4.8 s after each utterance, the
  model took 0.74 to 1.3 s for each second of speech, and interim text
  rarely arrived before the final one. Headless browsers are throttled on Windows,
  so the tests' timings are for comparing runs, not for judging the model.
- **Loading tiny.en from the server** took 1.0 s in Firefox and 2.3 to 5.3 s
  in Edge.
- **Loading it from the Hugging Face hub works on a cross-origin isolated
  page** (`Cross-Origin-Embedder-Policy: require-corp`), in both browsers:
  the hub's responses carry CORS headers. One check each: ready 6.8 s after
  the source opened in Edge and 5.9 s in Firefox, after 22 requests to
  `huggingface.co` and 4 to its CDN. A second load in the same profile made
  no request to another host and took 2.5 s (Edge) and 2.9 s (Firefox).
- **With captions off, no model is loaded**: the engine stays unloaded
  through every capture test.

**Captions on the file's timeline**

- **A recorded file's captions sit on its speech.** `two-sentences.wav`
  recorded to its end, with the take's own decoded sound as the reference
  (the energy detector on the 16 kHz copy). Edge: captions at 0.408 to
  3.368 s and 5.348 to 7.808 s, speech at 0.60 to 3.16 s and 5.54 to 7.60 s.
  Firefox: 0.613 to 3.413 s and 5.393 to 7.853 s, speech at 0.66 to 3.22 s
  and 5.58 to 7.66 s. Each caption starts up to 300 ms before its speech and
  ends about 200 ms after it, which is the lead-in and tail the segmenter
  keeps. The measured offsets were -41 ms (Edge) and -6 ms (Firefox).
- **The estimate agrees with the measurement** where the estimate is exact:
  with the WebCodecs recorder taking its sound from the tap, both gave 1 ms
  and 7 ms in two Edge takes and 8 ms in Firefox.
- **A paused take keeps what was said while it recorded.** Edge, the fake
  microphone, 8.5 s recorded, 3 s paused, 4 s recorded: 3 captions in a
  12.6 s recording, in order, none from the pause, the whole sentence on its
  speech and the two cut by the take's edges marked.
- **A paused take's offset is usually the estimate.** Its waveform match was
  0.38 and 0.62 in two takes, under the 0.9 that counts as measured: the
  recorder and the tap pause a few milliseconds apart, which is enough to
  spoil a sample-by-sample match after the pause. The lag the match found in
  one of them was -19 ms, against the 0 used.
- **Whisper tiny.en's word times run late.** Its first word started 425 to
  445 ms after the speech did, in both browsers and in Node ("Speech" at
  1.06 s where the sound starts at 0.62 s), and every later word is late by
  about as much: its times look like where each word ends. base.en's are
  close: "Speech" at 0.86 s in the same clip (one check, in Node). Subtitles
  cut on tiny.en's word times start late by a word.
- **Once, a file take's first caption began at the take's start** rather than
  0.3 s before its speech: the detector heard the stream's first frames as
  speech. It didn't happen again in the next four takes, or in the tests.

**Found on the way**

- Waiting for "every caption delivered" never ended when the source kept
  talking after Stop and the model was slower than the speech, as it is
  headless: there was always another utterance queued. The wait now covers
  only what was said before the cut.
- A finished utterance now goes ahead of a waiting interim, and an interim
  that is out of date is dropped from the queue. Before, they ran in the
  order they were queued.

### Captions' limits, for now

- A media file played without recording closes when it ends, so its last
  sentence's caption, which needs the pause after it, is dropped. Recorded,
  it is kept.
- A transcript holds what the live captions heard: nothing is transcribed
  again from the finished file yet, so a take recorded with captions off has
  no transcript.
- One offset places a whole take. Each pause can differ by a few
  milliseconds between the tap and the recorder, which isn't corrected.
- Subtitles are a separate file, or the card's own track: nothing is written
  into the recording yet.
- English only, in practice.
- Whisper isn't a streaming model. A final caption can't come sooner than the
  pause that ends its utterance plus the model's time over it.
- The energy detector can take steady noise for speech.
- Silero VAD has to be on the server (`npm run download-model silero-vad`):
  its file is a raw download the hub doesn't serve in this form.
- Safari hasn't been tried.

## How a take works

```
 source: getUserMedia / getDisplayMedia / <video>.captureStream() / canvas + Web Audio
                 │
                 ├── optional: mix in the microphone (Web Audio)
                 ├── optional: through a WebRTC loopback (two RTCPeerConnections)
                 ▼
            MediaStream ────────────┬────────────────────────┬──────────────┐
                 │                  │                        │              │
                 ▼                  ▼                        ▼              ▼
   MediaRecorder (src/recorder.js)  PCM tap: AudioWorklet   level meters   preview
   WebM / MP4 / Ogg, in chunks      (src/tap-processor.js),
                 │                  every channel, native rate
                 ▼                          │
 after Stop (src/take-report.js):               │
   1. probe the file with Mediabunny: container, codecs, packets, key frames,
      the duration it declares (src/container.js)
   2. no declared duration? remux it, packet for packet, into a seekable copy
   3. decode its audio at the tap's rate (decodeAudioData)
   4. render it through an OfflineAudioContext to 16 kHz mono: 16k.wav
   5. line it up with the tap: loudness envelopes at 10 ms, then 1 ms, then
      the waveform sample by sample (src/metrics.js)
   5b. measure the sound in the tap and the file: loudness, noise floor,
      bandwidth; the stretches of sound in the 16 kHz copy; and, for two or
      more channels, how they compare (src/sound.js)
   5c. for two cameras, time each camera's frames as the page saw them
      (src/metrics.js)
   6. frame timing from the video packets; for the test signal, decode every
      frame (WebCodecs) and read its number and flash back (src/pattern.js)
   7. save the report and the files (page/takes.js)
```

Some details that matter for the measurements:

- **The tap runs at the AudioContext's own rate.** Firefox can't connect a
  stream to an AudioContext running at a different rate, so nothing is
  resampled until the analysis. The tap also counts frames on the context's
  clock. A take starts at the frame playing when Record is pressed, and the
  tap can tell when blocks were lost.
- **Record waits for audio.** Firefox can take most of a second to start
  its first AudioContext. Record therefore waits (up to 2 s) until audio
  reaches the tap before starting the recorder, so both start together. The
  AudioContext is created or resumed on every click, as in
  automatic-speech-recognition-and-diarization, because Chrome and Safari only
  start one during a user gesture.
- **Takes are timed from `start()`.** MediaRecorder's start event can come
  seconds after `start()` is called: headless Edge with fake devices took
  about 3 s. The file still begins at `start()`, so the take's length is
  measured from there, and the delay is reported on its own.
- **Repeating sounds line up at the nearest match.** The test signal's beep,
  and Firefox's fake microphone tone, repeat every second, so they match
  equally well a whole second out. Of equally good matches, the nearest wins.

## Two recorders: MediaRecorder and WebCodecs

**Each record → `recorder`** picks what makes the file. `MediaRecorder` does
everything inside the browser: it takes the stream's frames, encodes them
and writes the file, and the page only sees the result. The bench's own
WebCodecs recorder (`src/webcodecs-recorder.js`) does the same three steps in
the open, so each one can be set and measured:

```
 track ──► raw frames ──────────────► encoder ─────────────► muxer ──► file
           MediaStreamTrackProcessor   VideoEncoder           Mediabunny's
           (VideoFrame, AudioData)     AudioEncoder           EncodedVideoPacketSource,
           or, without one:            configure(), encode(), EncodedAudioPacketSource
           <video> + new VideoFrame()  key frames on request, → WebM, MP4 or Matroska
           and the AudioWorklet tap    a queue limit
```

- **Raw frames.** `MediaStreamTrackProcessor` turns a track into a stream of
  `VideoFrame`s or `AudioData`s. The spec puts it in dedicated workers;
  Chromium has it on the page instead. Where there's none (Firefox), the video
  plays in a `<video>` element and each frame it presents is copied with
  `new VideoFrame(video)` on `requestVideoFrameCallback()`, and the sound
  comes from the bench's AudioWorklet tap as `AudioData`.
  **WebCodecs → `frames from`** forces this fallback, to compare the two paths
  in one browser.
- **One timeline from several clocks.** Each track's frames are stamped on
  its own clock. Chromium's processor gives video frames the camera's capture
  time (about 10¹² µs) and audio a count from zero. So each track is placed
  by when its first frame reached the page, keeps its own clock's spacing
  after that, and every frame is restamped before it's encoded. That has to
  happen before the encoder, because an audio encoder regroups its input: Opus
  makes 20 ms packets out of 10 ms blocks. Paused time is cut out, and audio
  from before the take started is trimmed.
- **Encoding.** The tab sets the codec, bitrate and its mode, latency mode,
  hardware acceleration, a key frame every so many seconds (WebCodecs makes
  one only when asked, after the first), and a queue limit: a frame that
  arrives while that many are waiting in the encoder is dropped, as a live
  encoder must. H.264's codec string carries the lowest level that holds the
  picture (`src/codecs.js`, from the standard's Table A-1), because Chromium
  refuses a level too low for it.
- **Muxing.** Mediabunny writes each encoded packet into the file as the
  encoder hands it over, with the decoder config from the encoder's first
  output, and finishes the file at **Stop**. So its files always declare
  their duration.

The take is analysed exactly as a MediaRecorder take: the same tap, probe,
frame timing and test-signal read-back. So two takes of the same source, one
from each recorder, compare the recorders like for like. The card adds each
encoder's config, frames in, encoded and dropped, key frames asked for and
written, the most frames waiting, and the encode latency. The Browser view
lists the codecs this browser's encoders take, with software and with
hardware preferred.

## Browser support

| Browser | Status |
| --- | --- |
| Edge 156 | Tested headless, with fake devices: all 26 end-to-end tests pass, one of them at iPhone width with touch |
| Firefox 160 (Developer Edition) | Tested headless, with fake devices: all 21 pass. There's no screen capture test (no way to skip the picker), no MP4 test (it doesn't record MP4, and its WebCodecs has no AAC, so its WebCodecs camera take is WebM), and no forced-fallback test (it has no `MediaStreamTrackProcessor`, so its WebCodecs takes always use the fallback) |
| Chrome for Testing 156 | Tested headless, with fake devices: all 26 pass. It's the build Google publishes for automation, downloaded into Puppeteer's cache (`npm run install:chrome-for-testing`). It has the same Chromium engine and media stack as Chrome 156, but it isn't the product people run |
| Google Chrome, Brave and other Chromium browsers | Not tested: not installed on the development machine |
| Safari (macOS, iOS), and phones | Opened by hand on an iPhone over the local network, not tested systematically. Two different cameras can't run at once there: see [Limitations](#limitations). Safari can't run on Windows, where this was developed: see [Other devices on your network](#other-devices-on-your-network) |

### What the tests have shown so far

These are from the end-to-end tests: **headless browsers with fake devices**
on a Windows desktop. Real devices, visible windows and other machines will
differ. That's what the saved takes and the Takes view are for.

- **WebM recorded in chunks declares no duration.** With the bench's default
  `timeslice` (1 s), neither Edge's nor Firefox's WebM has a duration or an
  index, so players show no length and can't seek. Without a timeslice, Edge
  156 writes a file that declares its duration (Chromium changed this in
  2025), but Firefox still doesn't. The bench keeps 1 s chunks as its default
  anyway, so a crash or a closed tab loses at most a second. Any take without
  a duration gets a seekable copy.
- **What each records:**
  - Edge records 18 of the bench's 23 candidate types, MP4 among them (H.264
    or AV1 video, with AAC or Opus).
  - Firefox records 6, all WebM or Ogg.
  - Left to choose, Edge records audio-only streams as `audio/webm;codecs=opus`
    and Firefox as `audio/ogg; codecs=opus`.
- **Firefox has `captureStream()` unprefixed** on media elements (Firefox 160),
  as well as `mozCaptureStream()`.
- **Firefox's first AudioContext took about 0.9 s to start.** That's why
  Record waits for audio.
- **Headless Edge's recorder starts slowly.** The start event came about 3 s
  after `start()`, and a fake camera's frames had a gap of about 2.5 s at the
  start of the file. The test signal, drawn by the page, lost no frames, and
  its sound came about 46 ms after the picture.
- **Headless Firefox drew the test signal at about half its frame rate**
  (about 77 of 210 frames missing), while its sound stayed within about 40 ms
  of the picture.
- **The file's audio lines up with the tap within a few tens of
  milliseconds** at the start and the end, with a waveform match of 0.97 to
  1.00 (Opus at the browsers' default bitrates).
- **The WebRTC loopback negotiated Opus (48 kHz, 2 channels) and VP8** in both
  browsers, with no packets lost on the same page.
- **Headless Edge's fake picker shares the whole screen**, not the tab, even
  with `preferCurrentTab`.
- **Audio only and video only copy cleanly.** Every copy kept the
  original's codec, packet count, key frames and start time:
  - Edge's WebM: Opus into `.ogg`, VP8 into `.webm`.
  - Edge's MP4: AAC into `.m4a`, H.264 into `.mp4`.
  - Firefox's WebM: VP8 into `.webm`. Its Opus starts 1 ms before zero,
    which Ogg can't hold without shifting it, so it went into `.weba`.
- **Two microphones keep both channels.** Edge recorded the stereo track
  as `audio/webm;codecs=opus` with 2 channels, and Firefox as
  `audio/ogg; codecs=opus` with 2.
  - Edge's two fake microphones play the same file. Channel 2 came out
    behind channel 1 by a different amount each run: 30 ms, 20 ms and 10 ms
    in Edge, and 0 ms and 10 ms in Chrome for Testing. It isn't a fixed
    property of either browser.
  - Firefox has one fake microphone, so the test opens it twice. Its two
    channels came out identical in one run, and in another lined up
    exactly with a waveform match of 1.000.
- **Ogg declares no duration.** Its headers have no place for one: players
  read it from the last page
  ([RFC 7845](https://www.rfc-editor.org/rfc/rfc7845)). The bench doesn't
  mark that as a fault.
- **The recorder doesn't change the loudness.** With tap and file each
  mixed to one channel and lined up, every take's file measured within
  0.1 LU of its tap, in all three browsers. The exception is the paused
  take in Edge, at +0.11 and +0.14 LU in two runs (+0.08 in Chrome for
  Testing). Lining up matters: the test signal's
  short beeps fall across BS.1770's 400 ms blocks differently when the file
  starts a few milliseconds off the tap. Unaligned, they once read 1.06 LU
  apart.
- **Two cameras: each browser's one fake camera, opened twice.**
  - Both browsers kept the two sides in step: 0 ms between the two
    cameras' frames, and the page missed none of either camera's frames.
  - Edge's fake camera gave 320×180 at about 32 fps, Firefox's 640×480 at
    30 fps.
  - Only Edge said when each frame was taken (`captureTime`). Its fake
    camera's frames reached the page well under a millisecond later, which
    a real camera won't match. Firefox's frames are timed by when they
    reached the page.
- **Edge recorded some two-channel streams as mono.** The media file's
  sound and the WebRTC loopback's reached the page as two channels, and
  Edge's file kept one. The tap's two channels were identical there, so
  nothing was lost. Edge kept both channels of the camera's stream and of
  two microphones.
- **The WebCodecs recorder against MediaRecorder, on the test signal.** These
  are 7 s takes; A/V is how far the sound trails the picture, given as the
  range over the runs made so far:

  | | MediaRecorder | WebCodecs, from the processor | WebCodecs, fallback |
  |---|---|---|---|
  | Edge 156 | 0 frames missing; A/V +35 ms (1 run) | 0 missing; −12 to −1 ms (3 runs) | 0 missing; +11 to +19 ms (3 runs) |
  | Chrome for Testing 156 | 0 missing; +35 to +45 ms (2 runs) | 0 missing; −17 to −15 ms (2 runs) | 0 missing; +10 to +12 ms (2 runs) |
  | Firefox 160 | 103 missing; −39 ms (1 run) | (no processor) | 77 to 103 missing; −60 to −12 ms (2 runs) |

  Read the table with three caveats:
  - The WebCodecs offsets measure the bench's own way of lining the tracks
    up (each track placed by when its first frame reached the page, an audio
    block's end at the moment it arrived), as much as WebCodecs itself.
  - On the fallback path, the file's sound is the tap's own samples, encoded.
    So there the file-against-tap measurements (start, end, waveform match,
    loudness) measure only the encoder and the timeline, not a separate
    capture route, and a match of 1.000 isn't independent evidence.
  - Firefox's missing frames are its headless drawing (see above), the same
    for both recorders.

  Every WebCodecs file declared its duration; at the bench's default 1 s
  `timeslice`, none of the MediaRecorder WebM files did.
- **`MediaStreamTrackProcessor` is on the page in Chromium, and in no
  worker** (the Browser view checks it, and its end-to-end test prints the
  result). Edge 156 and Chrome for Testing 156 have it on the page, not in a
  dedicated worker, where the spec puts it. None of the three browsers can
  send a track to a worker (`DataCloneError`), so the spec's worker path
  can't run in any of them. Firefox 160 has no processor at all.
- **What the encoders take** (the Browser view's `isConfigSupported()`
  table, 1280 × 720 at 30 fps):

  | | VP8 | VP9 | AV1 | H.264 | H.265 | Audio |
  |---|---|---|---|---|---|---|
  | Edge 156 | software | software | software, hardware | software, hardware | no | Opus, AAC |
  | Chrome for Testing 156 | software | software | software, hardware | software, hardware | hardware only | Opus, AAC |
  | Firefox 160 | software | software | software | software | no | Opus, Vorbis |

  Edge and Chrome for Testing differ only in H.265, on the same machine and
  engine. In a one-off check, Chromium refused an H.264 level too low for the
  picture (level 3.0 at 1280 × 720; 3.1 worked), and Firefox accepted every
  level. That's why the bench works the level out from the picture.
- **An encoder's first frames are the slowest.**
  - In the end-to-end runs (queue limit 8), the slowest H.264 frame took
    113 to 116 ms in Edge and 83 to 84 ms in Chrome for Testing, and none
    was dropped.
  - In a one-off check, a fresh Chrome for Testing where H.264 was the first
    encoder used took about 700 ms for its first frame. With a queue limit
    of 4, that dropped 12 frames.
  - That's why the default limit is 8, Mediabunny's own.
- **Key frames.** Edge's and Chrome for Testing's VP8 wrote exactly the key
  frames asked for. Firefox's wrote exactly those asked for from the test
  signal, but 34 or 35 for 3 asked over a 5 s take from its fake camera.
  So when it adds its own depends on the picture.
- **What was asked for isn't always what's written.** H.264 was asked for as
  Constrained Baseline at level 3 (`avc1.42E01E`; the bench's level table
  starts at 3). Each encoder wrote its own profile flags and level into its
  stream's parameter set:
  - Chrome for Testing's: Baseline with no constraint flags, at the lowest
    level that fits. That was `avc1.42000d` (level 1.3) for the end-to-end
    test's 320 × 180, and `avc1.42001e` at 640 × 480 in a one-off check.
  - Edge's: two of the three constraint flags, `avc1.42c014` (level 2) and
    `avc1.42c01e`.

  The file's MIME type, which Mediabunny takes from the encoder's decoder
  config, still says `avc1.42E01E` in both. The card shows both strings:
  **Type it wrote**, and the codec string under **File's video track**.
- **The route changes the sound's format.** Chromium's processor delivers a
  track as it is: its fake microphone, playing `fox.wav`, came as 2 channels
  at 44.1 kHz. The tap is an AudioWorklet in an AudioContext, so it
  delivers the context's rate, 48 kHz here: Chromium's fake microphone as
  2 channels, Firefox's as 1. The card's **Rate · channels, as delivered**
  shows which.

## Limitations

- **Takes are held in memory until they're saved.** The tap keeps every
  channel as 32-bit floats: about 23 MB a minute for stereo at 48 kHz, or
  1.4 GB an hour. The recording's chunks add the file's own size. Saved
  takes count against the browser's storage quota, which the Takes view
  shows.
- **Some measurements need the right take:**
  - Drift needs a take of at least 60 s.
  - Reading frames back (frame numbers, A/V sync) needs WebCodecs with the
    recorded codec, and only works for the test signal.
  - Alignment uses the first 30 s, and so do bandwidth and comparing
    channels.
  - Stretches of sound aren't speech detection. Anything louder than
    `silenceDb` counts, so a noisy take needs a higher threshold.
- **Two mics means two at most**, one per channel of a stereo track, and
  **two cameras** means two side by side.
- **The WebCodecs recorder:**
  - Each encoder is configured from its track's first frame. A picture
    that changes size during a take (a shared window resized) hasn't been
    tried.
  - The file is built in memory until **Stop**, like MediaRecorder's chunks.
  - Frames are handled on the page's own thread, though the encoders run
    off it. The spec's worker path is left out, since no browser tested here
    can transfer a track to a worker.
- **Safari on iOS opens one camera at a time.** WebKit's engineers say
  opening a second, different camera ends the first one's track
  ([WebKit bug 264288](https://bugs.webkit.org/show_bug.cgi?id=264288));
  older versions muted it instead. WebKit says the same camera twice keeps
  running ([bug 179363](https://bugs.webkit.org/show_bug.cgi?id=179363)),
  though one report there still saw a black picture; that hasn't been tried
  on an iPhone here. Once both cameras (or both microphones) have opened,
  the bench checks that neither has been stopped. If one has, it says **One
  device at a time here** rather than wait on a picture that's never drawn.
  A test stands in for Safari's behaviour; the check hasn't been run on an
  iPhone yet.
- **Two cameras' picture follows camera 1.** A faster camera 2 has frames
  left out of the file, though its own timing counts them all. A browser
  without `requestVideoFrameCallback()` draws the picture on a timer and
  doesn't time the cameras.
- **Headless browsers aren't real conditions.** Windows throttles them, and
  their fake devices start slowly. Take measurements that matter in a visible
  window, with real devices.
- **The screen picker can't be skipped in Firefox or Safari**, so screen
  capture there is tested by hand.

## Other devices on your network

Phones, tablets and other computers can use the bench served from this
computer, over your Wi-Fi or wired network. Capture needs a secure context,
and on another device that means `https://`: only this computer's own
`localhost` counts as secure over plain `http://`. So the server serves
HTTPS with a certificate from a small certificate authority of your own,
which each device trusts once. (For a Chromium browser there's a shortcut
without certificates: see [Without certificates](#without-certificates-chromium-only).)

### 1. On this computer

1. **Make the certificates:** `npm run cert`. It uses `openssl` (Git for
   Windows has it) and writes two to `.cert/`:
   - a certificate authority of your own (`ca.pem`), made the first time and
     kept
   - the server's certificate, issued by it, for `localhost` and this
     computer's current network addresses

   Apple's devices only offer full trust to a certificate authority, not to
   a server's own self-signed certificate
   ([Apple's developer forums](https://developer.apple.com/forums/thread/720477)),
   and the other systems install an authority the same way. The authority
   can only vouch for `localhost` and private network addresses (10.x,
   172.16–31.x, 192.168.x), never a real site, so trusting it trusts nothing
   on the internet.
2. **Start the server** on every network interface:
   - Git Bash: `HTTPS=1 HOST=0.0.0.0 npm start`
   - PowerShell: `$env:HTTPS=1; $env:HOST="0.0.0.0"; npm start`

   It prints an address for each network interface, such as
   `https://192.168.0.14:8100/`. Use the one on your Wi-Fi or Ethernet
   (`ipconfig` names them). On Windows, the addresses of virtual adapters,
   such as WSL's and Hyper-V's `vEthernet`, can't be reached from other
   devices.
3. **Let other devices in.** Windows Firewall must allow Node.js on the kind
   of network you're on. Windows asks the first time. But if Node.js was only
   allowed on public networks, a home network (private) stays blocked. In
   PowerShell, run as administrator, this opens the bench's port to devices
   on your own network only:

   ```powershell
   New-NetFirewallRule -DisplayName "Capture bench (local network)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8100 -Profile Private -RemoteAddress LocalSubnet -Program "C:\Program Files\nodejs\node.exe"
   ```

   `Get-NetConnectionProfile` says whether Windows counts your network as
   Private or Public.
4. **Put the device on the same network.** A guest network usually keeps
   devices from reaching each other, and so can a VPN on the device: turn it
   off while testing.

### 2. On each device, trust the authority (once)

Open `/ca.pem` at the bench's address in the device's browser, such as
`https://192.168.0.14:8100/ca.pem`. The browser warns that the connection
isn't private, since the device doesn't trust the bench yet. Go on to the
page anyway:
- in Safari, **Show Details**, then **visit this website**
- in Chrome or Edge, **Advanced**, then **Proceed**

That downloads the authority's certificate. Then install it as the device
needs:

- **iPhone or iPad:** allow the profile download. Then:
  1. Settings → General → VPN & Device Management → **Capture bench local
     CA** → Install.
  2. Settings → General → About → Certificate Trust Settings → turn on
     **Capture bench local CA**.

  Chrome on iOS uses the same trust: Chrome's own certificate checks don't
  run on iOS
  ([Chrome Root Store FAQ](https://chromium.googlesource.com/chromium/src/+/main/net/data/ssl/chrome_root_store/faq.md)).
- **Android:** Settings → Security & privacy → More security settings →
  Encryption & credentials → Install a certificate → **CA certificate** →
  Install anyway, then pick the downloaded `ca.pem`. The names differ a little
  between makers and versions, and Android may ask you to set a screen lock
  first. It's listed afterwards under Trusted credentials → User.
  - Chrome on Android trusts an authority installed there (Chrome's
    certificate checks honour local trust decisions:
    [Chrome Root Store FAQ](https://chromium.googlesource.com/chromium/src/+/main/net/data/ssl/chrome_root_store/faq.md)).
  - So does Firefox, by default
    ([Mozilla](https://support.mozilla.org/en-US/kb/setting-certificate-authorities-firefox)).
- **Mac:** open `ca.pem` in Keychain Access. Open the certificate, and under
  Trust set **When using this certificate** to **Always Trust**.
- **Windows PC:** in a command prompt or PowerShell (not as administrator):
  `certutil -user -addstore Root ca.pem`, and confirm the warning. Chrome
  and Edge use the Windows certificate store.
- **Linux:** in Chrome or Chromium, Settings → Privacy and security →
  Security → Manage certificates, and import `ca.pem` as a trusted
  authority.
- **Firefox, anywhere:** Mozilla says Firefox uses authorities added to the
  system on Windows, macOS and Android by default. If it still warns, import
  `ca.pem` in Firefox itself: Settings → Privacy & Security → Certificates →
  View Certificates → Authorities → Import, and tick **Trust this CA to
  identify websites**.

### 3. Open the bench

Open the bench's address, such as `https://192.168.0.14:8100/`. It opens
with no warning now. Allow the camera and microphone when asked, and check
that the **Secure context** chip is green.

On a phone:
- the header and the source picker each swipe sideways
- every control is at least 44 px
- touching and holding anything explains it

Also:
- **Each device keeps its own takes.** To compare them with this computer's,
  **Export** them from the device's Takes view, move the JSON file across
  (AirDrop, email, a cloud drive), and **Import** it here. Download any
  recordings you want from each take's card.
- **Camera app…** (with **Media file**) records with the phone's own camera
  app, then plays the video in the bench.
- **Some sources depend on the device.**
  - MDN lists no Android browser with screen capture.
  - Safari on iOS can't run two different cameras at once (see
    [Limitations](#limitations)). The bench says **One device at a time
    here** when a browser stops the first camera or microphone as the
    second opens.
  - Whether Android runs two cameras, and whether either runs two
    microphones, is untested.
- **Switching to another app** can pause or end capture on a phone. The log
  shows the track events.

### Without certificates (Chromium only)

Chrome and Edge can be told to treat one plain `http://` address as secure,
which skips the certificates:

1. Start the server without HTTPS: `HOST=0.0.0.0 npm start`. The firewall
   step above still applies.
2. On the device, open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
   (`edge://flags/...` in Edge). Enable it, enter the bench's address, such
   as `http://192.168.0.14:8100`, and relaunch the browser.

In the bench's own check, Edge 156 started with the same switch
(`--unsafely-treat-insecure-origin-as-secure=http://192.168.0.14:8100`)
counted that address as secure, and the camera and microphone opened. It
doesn't work in Safari or Firefox. The flag makes the address count as
secure for everything, so turn it off when you're done.

### If something goes wrong

- **The page doesn't load on the device:**
  - Check the firewall rule.
  - Check that both are on the same network, and not a guest network.
  - Turn off a VPN on the device.
  - Check that the address is still this computer's. Addresses can change
    after a restart.
- **The address changed:** run `npm run cert` again and restart the server.
  The authority stays the same, so the devices needn't be set up again.
- **The certificate warning won't go away:**
  - On an iPhone, check the switch in Certificate Trust Settings.
  - Otherwise, the server's certificate may predate a new address: run
    `npm run cert` again.
- **"This page isn't a secure context":** the page was opened over
  `http://` without the Chromium flag.
- **The camera or microphone is refused:** check the browser's permissions
  for the bench's address. On an iPhone, that's also Settings → Apps →
  Safari → Camera and Microphone.
- **`npm run cert` stops with a "no such file" error:** an `OPENSSL_CONF`
  variable set by other software may name a file that isn't there.
  `npm run cert` leaves such a variable out, but running `openssl` by hand
  doesn't.

### Safety, and undoing it

- With `HOST=0.0.0.0`, any device on your network can open the bench. The
  server never serves a file or folder whose name starts with a dot: not
  `.git`, and not `.cert` with its keys. The one exception is `/ca.pem`, the
  authority's certificate, which is public.
- The authority can't vouch for any real site (see step 1). Even so, remove
  it from a device when you're done:
  - **iPhone:** Settings → General → VPN & Device Management → the profile →
    Remove.
  - **Android:** Trusted credentials → User → remove it.
  - **Mac:** delete it in Keychain Access.
  - **Windows:** `certutil -user -delstore Root "Capture bench local CA"`.
- To close the firewall again, in PowerShell as administrator:
  `Remove-NetFirewallRule -DisplayName "Capture bench (local network)"`.

If [mkcert](https://github.com/FiloSottile/mkcert) is installed, it does the
same as `npm run cert`. Write its server files to `.cert/key.pem` and
`.cert/cert.pem`, and trust its own root on each device.

## Project layout

```
index.html, page/app.js       the bench: sources, settings, transport, live view, takes, Browser view
page/take-view.js             a take's card: playback with subtitles, waveforms, transcript, measurements, asked vs got
page/compare.js, page/takes.js  the Takes view, and the takes and their transcripts in IndexedDB (export and import)
page/bench.js, app.css, icons.svg  the bench's building blocks: parameter panel, events log, status, alerts
page/explain.js, page/explain/  the hover bubbles, right-click (or touch-and-hold) menu and article window, and the articles
guide.html, page/guide.js     the Guide: every article, by section, with search
src/sources/                  user-media.js, cameras.js, mics.js, display.js, media-file.js, synthetic.js
src/pipeline.js               mixing in the microphone; the WebRTC loopback
src/recorder.js               MediaRecorder: the candidate types, and the take's stats
src/webcodecs-recorder.js     the WebCodecs recorder: raw frames, the encoders, Mediabunny's muxing; the encoder table
src/codecs.js                 its codecs and containers, and H.264's level from the picture (no DOM)
src/audio.js                  the shared AudioContext, the PCM tap, decoding, resampling, capturing a media element
src/tap-processor.js          the tap's AudioWorklet
src/take-report.js            everything after Stop
src/container.js              Mediabunny: probing, remuxing, audio or video on its own, reading frames back
src/metrics.js                levels, silence, alignment, drift, frame timing, cameras' timing, A/V sync (no DOM)
src/sound.js                  loudness (BS.1770), noise floor, bandwidth, stretches of sound, channels (no DOM)
src/pattern.js                the test pattern's flash and frame-number cells (no DOM)
src/wav.js                    WAV writing and reading (no DOM)
src/capabilities.js           the Browser view's report
src/deps.js                   where the vendored libraries and the models are, from this file's own address
page/captions.js              live captions: the overlay, the transcript, the Captions chip, and each take's transcript
src/captions/tap-feed.js      the tap's blocks to 16 kHz mono, with their place on the context's clock, and cuts at a frame (no DOM)
src/captions/timeline.js      context frames to take time to file time; which captions a take keeps (no DOM)
src/captions/subtitles.js     a transcript cut into subtitles; WebVTT, SubRip, text and JSON (no DOM)
src/speech/core.js            the speech engine's settings, the worker's client and job queue, transcript clean-up
src/speech/engine-worker.js   the worker that hosts the model: loading, WebGPU with its fallback, word times
src/speech/asr-engine.js, whisper-engine.js, ctc-engine.js  the transcription engines (they run in Node too)
src/speech/audio.js           the resampler, the Segmenter (utterances), decoding and chunking whole files
src/speech/vad.js, vad-worker.js  the speech detectors: energy, WebRTC VAD, Silero VAD
src/speech/transcriber.js     live transcription: interim and final segments, in order, with their times
src/speech/registry.js        every model and detector the bench can select, as data
src/speech/model-env.js       points Transformers.js at this server or the hub, one model at a time
src/speech/align/             word times by forced alignment (wav2vec2)
server.mjs                    static server; HTTPS=1 for other devices
scripts/vendor.mjs            copies the libraries the pages load from node_modules into vendor/ (after npm install)
scripts/download-model.mjs    speech models into models/, from the registry
scripts/make-cert.mjs         a local certificate authority, and the server's certificate it issues, for HTTPS=1
scripts/make-fixtures.mjs     the test pattern as .y4m, for Chromium's fake camera
scripts/check-sources.mjs     checks every link the explanations cite
scripts/check-blockers.mjs    checks that no ad or tracker blocker's list would block the bench's files
scripts/install-chrome-for-testing.mjs  Chrome for Testing into Puppeteer's cache, for the end-to-end tests
test/unit/                    node --test: WAV, pattern, metrics, sound, constraints, types, codecs, probing,
                              the speech engine's pure parts, the tap feed, the timeline, subtitles, what the pages load
test/engine.test.mjs          the speech model in Node, on the fixtures
test/browser.test.mjs         end-to-end, in real browsers
test/fixtures/                fox.wav and two-sentences.wav (from automatic-speech-recognition-and-diarization)
```

There are three runtime dependencies:

- [Mediabunny](https://mediabunny.dev/), for reading and remuxing the
  recorded files, and for writing the WebCodecs recorder's packets into a
  file.
- [Transformers.js](https://huggingface.co/docs/transformers.js/index), with
  ONNX Runtime Web inside it, which runs the speech model.
- [@echogarden/fvad-wasm](https://www.npmjs.com/package/@echogarden/fvad-wasm),
  WebRTC's voice activity detector as WebAssembly.

The pages load them from `vendor/` (30 MB, most of it ONNX Runtime's
WebAssembly build), which `scripts/vendor.mjs` fills from the installed
packages after every `npm install`. `vendor/` isn't committed. Nothing in
the browser asks for a path under `node_modules/`, so the same pages work
from a static host.

## Testing

```sh
# Pure code (WAV, the test pattern, metrics, sound, constraints, MIME types, probing,
# the speech engine's registry, resampler, segmenter and detectors, the tap feed,
# the take's timeline, subtitles); no browser
npm run test:unit

# The speech model itself, in Node: needs a model in models/
npm run download-model whisper-tiny.en
npm run test:engine

# End to end in a real browser: start the server, then in another terminal.
# The caption tests need whisper-tiny.en in models/, and are skipped without it;
# the word-times test needs whisper-tiny.en-timestamped as well.
npm start
npm test               # Firefox
npm run test:edge      # Microsoft Edge
npm run test:chrome    # Google Chrome
node test/browser.test.mjs brave

# Chrome for Testing, without installing Chrome: download it once into
# Puppeteer's cache (440 MB unpacked; PUPPETEER_CACHE_DIR moves it), then test it
npm run install:chrome-for-testing
npm run test:chrome-for-testing

# Every link the explanations cite
npm run check:sources

# No ad or tracker blocker would block the bench's own files (downloads their lists)
npm run check:blockers
```

The end-to-end tests drive the bench with Puppeteer: Firefox over WebDriver
BiDi, Chromium browsers over the Chrome DevTools Protocol. Fake devices stand
in for the camera and microphone, and prompts are granted without asking.

- Chromium's fake microphone plays `fox.wav` on a loop, so the test checks the
  take's 16 kHz copy against the file.
- Its fake camera plays the test pattern, which the tests write to
  `test/output/` when it's missing (`npm run fixtures`).
- Firefox's fake devices play a tone and a coloured picture.
- The capture tests run with captions off, as the bench they came from did.
  The caption tests turn them on: Chromium captions its fake microphone, and
  every browser captions `two-sentences.wav` played as a media file.
- The transcript tests check captions' times against the recording itself:
  where the take's own decoded sound has speech. They cover a recorded file
  in every browser, both recorders, a paused take in Chromium, the card's
  subtitles and downloads, and word times.

The tests look for each browser in its usual install location. These
environment variables change that and other settings:

- `BROWSER_PATH`: the browser binary. Any Chromium browser works with a name
  other than `firefox`.
- `BASE_URL`: a different server address
- `HEADFUL=1`: show the browser while the tests run (headless browsers are
  throttled on Windows, which shows in the frame timing)
- `LONG=1`: also record a 65 s take of the test signal, to measure drift (it
  needs a minute or more)
- `DUMPIO=1`: the browser's own output

## Roadmap

- **Test on real hardware**: Chrome, Edge and Firefox with real cameras and
  microphones, tab and screen audio, and Safari on macOS and iOS. Fill in the
  support table from the saved takes.
- **Captions**, in stages:
  1. Done: live captions over the preview, from a Whisper model in the
     page, fed by the same audio tap the takes use.
  2. Done: a timed transcript saved with each take, on the saved file's own
     timeline, and `.vtt`, `.srt`, `.txt` and `.json` downloads.
  3. The subtitles written into the saved file as a track.
  4. A second, slower transcription of the finished take, and captions
     drawn into the picture.
  5. The bench published on GitHub Pages.
  6. Later: speaker labels, other languages, streaming models.
- **The WebCodecs recorder, further** (it exists now: see
  [Two recorders](#two-recorders-mediarecorder-and-webcodecs)):
  - Try it on Safari 26, the first Safari with `AudioEncoder`.
  - The spec's worker path, once a browser can transfer a track to a worker.
  - Pictures that change size during a take.
