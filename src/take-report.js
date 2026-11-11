// After Stop: everything measured about a take. The recorded file is probed
// (container, codecs, packets), remuxed when it declares no duration,
// decoded at the tap's rate and at 16 kHz mono (the transcription copy), and
// compared with the lossless tap. The sound itself is measured in both
// (loudness, noise floor, bandwidth), its stretches of sound found in the
// 16 kHz copy, and a take with several channels has them compared. A
// synthetic take's frames are read back for dropped frames and A/V sync,
// and two cameras' frames, as the page saw them, are timed.

import { channelsOf, decodeAudio, resample } from "./audio.js";
import { probe, readFrames, remux } from "./container.js";
import { align, avOffsets, cameraTiming, flashEdges, frameOffset, frameTiming, levels, mixDown, onsets, overview, sequenceStats, silenceShare, waveMatch } from "./metrics.js";
import { bandwidth, channelPair, levelSpread, loudestShares, loudness, soundSegments } from "./sound.js";
import { encodeWav } from "./wav.js";

export const EXTRACT_RATE = 16000;
export const DRIFT_MIN_S = 60;

// Where the tap's last 30 s sit in the file, relative to the tap (as lagS is
// for its start). Both are at 16 kHz; startLag says where to look.
function endLag(tap16, pcm, startLag) {
  const window = 30 * EXTRACT_RATE;
  const from = tap16.length - window;
  const tail = tap16.subarray(from);
  // The file's stretch that holds it if nothing drifted, so the match is near a lag of
  // zero (which align() prefers when a repeating sound matches as well a period out).
  const at = Math.max(0, from + Math.round(startLag * EXTRACT_RATE));
  const stretch = pcm.subarray(at, at + window + EXTRACT_RATE);
  const coarse = align(tail, EXTRACT_RATE, stretch, EXTRACT_RATE, { maxLagS: 1, limitS: 31 });
  const fine = waveMatch(tail, stretch, EXTRACT_RATE, coarse.lagS);
  return fine.lagS + (at - from) / EXTRACT_RATE;
}

const round = (x, d = 4) => (x == null || !Number.isFinite(x) ? x ?? null : Math.round(x * 10 ** d) / 10 ** d);
const levelsOf = (channels) =>
  channels.map((c) => {
    const l = levels(c);
    return { peakDb: round(l.peakDb, 2), rmsDb: round(l.rmsDb, 2), clipped: l.clipped, clippedShare: round(l.clippedShare, 6), dc: round(l.dc, 6) };
  });

// Loudness, the noise floor and the loud level, and how high the sound reaches.
function soundOf(channels, sampleRate) {
  const mono = mixDown(channels);
  const l = loudness(channels, sampleRate);
  const spread = levelSpread(mono, sampleRate);
  return {
    lufs: round(l.integrated, 2),
    maxMomentaryLufs: round(l.maxMomentary, 2),
    floorDb: round(spread.floorDb, 1),
    loudDb: round(spread.loudDb, 1),
    bandwidthHz: round(bandwidth(mono, sampleRate), 0),
  };
}

// How much louder the file is than the tap, like with like: each mixed to one
// channel (BS.1770 adds channels up, so one sound as one channel or two reads
// 3 LU apart), and lined up over the stretch both hold (loudness is measured
// in 400 ms blocks every 100 ms, so a short sound that falls across blocks
// differently in the two would read up to about 1 LU apart). null when either
// is silent.
function loudnessChange(tapMono, fileMono, sampleRate, lagS) {
  const at = Math.round(lagS * sampleRate);
  const tapFrom = Math.max(0, -at);
  const fileFrom = Math.max(0, at);
  const n = Math.min(tapMono.length - tapFrom, fileMono.length - fileFrom);
  if (n <= 0) return null;
  const change = loudness([fileMono.subarray(fileFrom, fileFrom + n)], sampleRate).integrated - loudness([tapMono.subarray(tapFrom, tapFrom + n)], sampleRate).integrated;
  return Number.isFinite(change) ? round(change, 2) : null;
}

// Each camera's frames as the page saw them, and how far apart the two take theirs.
function camerasOf(cameras) {
  const timed = cameras.map((c) => ({ ...c, timing: cameraTiming(c.runs) }));
  const clock = timed.every((c) => c.timing.clock === "capture") ? "capture" : "presentation";
  const times = (c) => c.runs.flat().map((f) => (clock === "capture" ? f.captured : f.presented));
  return {
    clock,
    offsetS: timed.length > 1 ? round(frameOffset(times(timed[0]), times(timed[1])), 5) : null,
    list: timed.map(({ label, width, height, timing: t }) => ({
      label,
      width,
      height,
      frames: t.frames,
      fps: round(t.fps, 2),
      dropped: t.dropped,
      gaps: t.gaps,
      maxGapS: round(t.maxGapS),
      jitterS: round(t.jitterS, 5),
      missed: t.missed,
      delayS: round(t.delayS, 5),
    })),
  };
}

// The stretches of sound in the 16 kHz copy, where a transcriber would find words.
function activityOf(pcm, silenceDb) {
  const segments = soundSegments(pcm, EXTRACT_RATE, { thresholdDb: silenceDb }).map(([s, e]) => [round(s, 2), round(e, 2)]);
  const pauses = segments.slice(1).map(([s], i) => s - segments[i][1]);
  return {
    count: segments.length,
    soundS: round(segments.reduce((sum, [s, e]) => sum + e - s, 0), 2),
    longestPauseS: pauses.length ? round(pauses.reduce((max, p) => (p > max ? p : max)), 2) : null,
    segments,
  };
}

// file: the recorded Blob (or, for a whole-file analysis, the source file).
// tap: PcmTap.finish()'s result, or null. synthetic: the synthetic source's
// settings ({ fps }), or null. cameras: two cameras' frame logs
// ([{ label, width, height, runs }], from sources/cameras.js), or null.
// settings: { tapFloat, silenceDb }.
// onProgress(label) names each step as it starts.
export async function analyseTake({ file, tap = null, synthetic = null, cameras = null, settings = {}, onProgress = () => {} }) {
  const { tapFloat = false, silenceDb = -50 } = settings;
  const analysis = { file: { type: file.type, size: file.size }, tap: null, decoded: null, extracted: null, match: null, video: null, sync: null, overview: null, sound: null, activity: null, channels: null, cameras: null };
  const media = { file, seekable: null, tap: null, pcm16k: null };

  onProgress("Reading the file");
  let videoTimestamps = null;
  try {
    const result = await probe(file);
    analysis.file.probe = result.probe;
    videoTimestamps = result.videoTimestamps;
  } catch (err) {
    analysis.file.probeError = String(err?.message ?? err);
  }
  const declared = analysis.file.probe?.declaredDuration;
  analysis.file.declaresDuration = declared != null && Number.isFinite(declared) && declared > 0;
  if (analysis.file.probe && !analysis.file.declaresDuration) {
    onProgress("Remuxing so it can be seeked");
    media.seekable = await remux(file);
    analysis.file.remuxed = Boolean(media.seekable);
  }
  if (cameras?.length) analysis.cameras = camerasOf(cameras);
  if (videoTimestamps?.length) {
    const t = frameTiming(videoTimestamps);
    analysis.video = { frames: t.frames, fps: round(t.fps, 2), dropped: t.dropped, gaps: t.gaps, maxGapS: round(t.maxGapS), jitterS: round(t.jitterS, 5) };
  }

  if (tap?.frames) {
    const mono = mixDown(tap.channels);
    analysis.tap = {
      sampleRate: tap.sampleRate,
      channels: tap.channels.length,
      frames: tap.frames,
      duration: round(tap.frames / tap.sampleRate),
      lostFrames: tap.lostFrames,
      emptyFrames: tap.emptyFrames,
      levels: levelsOf(tap.channels),
      silenceShare: round(silenceShare(mono, tap.sampleRate, { thresholdDb: silenceDb }), 4),
    };
    media.tap = new Blob([encodeWav(tap.channels, tap.sampleRate, { float: tapFloat })], { type: "audio/wav" });
    onProgress("Measuring the sound");
    analysis.sound = { tap: soundOf(tap.channels, tap.sampleRate), file: null };
    if (tap.channels.length > 1) {
      // The first two channels: two microphones, or one delivered twice.
      const pair = channelPair(tap.channels[0], tap.channels[1], tap.sampleRate);
      analysis.channels = {
        tap: tap.channels.length,
        file: analysis.file.probe?.tracks.find((t) => t.type === "audio")?.channels ?? null,
        identical: pair.identical,
        // The same sound in both, if not to the bit (a mono source carried as two channels):
        // a file with fewer channels then loses nothing.
        same: pair.identical || (Math.abs(pair.lagS) < 0.0005 && pair.score >= 0.999),
        lagS: round(pair.lagS, 5),
        waveScore: round(pair.score),
        ...(({ shares, tied }) => ({ loudest: shares.map((x) => round(x, 3)), loudestTied: round(tied, 3) }))(loudestShares(tap.channels, tap.sampleRate, { thresholdDb: silenceDb })),
      };
    }
  }

  onProgress("Decoding the audio");
  const rate = tap?.sampleRate || 48000;
  const decoded = await decodeAudio(file, rate);
  if (decoded) {
    const channels = channelsOf(decoded);
    const mono = mixDown(channels);
    analysis.decoded = { sampleRate: decoded.sampleRate, channels: channels.length, frames: decoded.length, duration: round(decoded.duration), levels: levelsOf(channels) };
    analysis.sound = { tap: analysis.sound?.tap ?? null, file: soundOf(channels, decoded.sampleRate) };

    onProgress("Making the 16 kHz copy");
    const [pcm] = await resample(channels, decoded.sampleRate, EXTRACT_RATE, { mono: true });
    analysis.extracted = {
      sampleRate: EXTRACT_RATE,
      frames: pcm.length,
      duration: round(pcm.length / EXTRACT_RATE),
      levels: levelsOf([pcm]),
      silenceShare: round(silenceShare(pcm, EXTRACT_RATE, { thresholdDb: silenceDb }), 4),
    };
    media.pcm16k = new Blob([encodeWav([pcm], EXTRACT_RATE)], { type: "audio/wav" });
    analysis.activity = activityOf(pcm, silenceDb);

    if (tap?.frames) {
      onProgress("Lining the file up with the tap");
      const tapMono = mixDown(tap.channels);
      const tapS = tap.frames / tap.sampleRate;
      const coarse = align(tapMono, tap.sampleRate, mono, decoded.sampleRate, { limitS: 30 });
      const [tap16] = await resample(tap.channels, tap.sampleRate, EXTRACT_RATE, { mono: true });
      const start = waveMatch(tap16, pcm, EXTRACT_RATE, coarse.lagS);
      analysis.match = {
        // Where the tap's sound starts in the file, and how much later (or, below 0,
        // earlier) the file's sound ends than the tap's, once lined up.
        lagS: round(start.lagS, 5),
        endS: round(decoded.duration - start.lagS - tapS, 5),
        envelopeScore: round(coarse.score),
        waveScore: round(start.score),
        // Drift: whether the file's clock runs at the tap's rate, from lining up the last
        // 30 s as well. A take shorter than DRIFT_MIN_S gives too little to tell.
        driftS: tapS >= DRIFT_MIN_S ? round(endLag(tap16, pcm, start.lagS) - start.lagS, 5) : null,
      };
      analysis.overview = { tap: overview(tapMono), file: overview(mono) };
      analysis.sound.changeLu = loudnessChange(tapMono, mono, decoded.sampleRate, start.lagS);
    } else {
      analysis.overview = { tap: null, file: overview(mono) };
    }

    if (synthetic) {
      onProgress("Reading the frames back");
      const frames = await readFrames(file);
      // The beeps, on the file's timeline: decoding starts at the audio track's first timestamp.
      const audioStart = analysis.file.probe?.tracks.find((t) => t.type === "audio")?.firstTimestamp ?? 0;
      const beeps = onsets(mono, decoded.sampleRate).map((t) => t + audioStart);
      if (frames) {
        const codes = sequenceStats(frames.sort((a, b) => a.t - b.t).map((f) => f.code));
        const flashes = flashEdges(frames);
        const offset = avOffsets(flashes, beeps);
        analysis.sync = {
          fps: synthetic.fps,
          frames: codes,
          flashes: flashes.length,
          beeps: beeps.length,
          offsetS: { median: round(offset.medianS), min: round(offset.minS), max: round(offset.maxS), pairs: offset.pairs },
        };
      } else {
        analysis.sync = { fps: synthetic.fps, frames: null, beeps: beeps.length, error: "This browser can't decode the recorded video (WebCodecs is missing or lacks the codec)" };
      }
    }
  } else if (tap?.frames) {
    analysis.overview = { tap: overview(mixDown(tap.channels)), file: null };
  }
  return { analysis, media };
}
