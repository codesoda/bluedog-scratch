// Runtime defaults, browser dependencies and the throttled inference loop for HandTracker.

import { detectOnce } from './tracking-backends.js';
import { TrackingError } from './tracking-camera.js';

const ENV = import.meta.env || {};
const BASE_URL = ENV.BASE_URL || './';

export const TRACKING_DEFAULTS = Object.freeze({
  minFrameIntervalMs: 1000 / 30,
  initTimeoutMs: 45000,
  firstResultTimeoutMs: 15000,
  videoReadyTimeoutMs: 12000,
  staleAfterMs: 700,
  hungAfterMs: 8000,
  maxConsecutiveFrameErrors: 30,
});

function resolveAssetUrl(path, baseHref) {
  const relative = `${BASE_URL.replace(/\/?$/, '/')}${path}`;
  try { return new URL(relative, baseHref).href; } catch { return relative; }
}

async function createMainThreadDetector(urls) {
  const { createHandLandmarker } = await import('./tracking-worker.js');
  const landmarker = await createHandLandmarker(urls);
  return {
    detect: (source, timestamp) => landmarker.detectForVideo(source, timestamp),
    close: () => landmarker.close(),
  };
}

/** Real browser dependencies; tests override any of these via HandTracker options. */
export function defaultDeps() {
  const g = globalThis;
  const baseHref = g.document?.baseURI || g.location?.href || 'http://localhost/';
  return {
    mediaDevices: g.navigator?.mediaDevices,
    isSecureContext: g.isSecureContext !== false,
    createWorker: typeof g.Worker === 'function'
      ? () => new Worker(new URL('./tracking-worker.js', import.meta.url), { type: 'module', name: 'hand-tracking' })
      : null,
    createMainThreadDetector,
    createImageBitmap: typeof g.createImageBitmap === 'function' ? (src) => g.createImageBitmap(src) : null,
    now: () => (g.performance ? g.performance.now() : Date.now()),
    setTimeout: (fn, ms) => g.setTimeout(fn, ms),
    clearTimeout: (id) => g.clearTimeout(id),
    wasmUrl: resolveAssetUrl('mediapipe/wasm', baseHref),
    modelUrl: resolveAssetUrl('models/hand_landmarker.task', baseHref),
  };
}

function scheduleVideoFrame(tracker, gen, video) {
  tracker.videoFrameHandle = video.requestVideoFrameCallback(() => {
    tracker.videoFrameHandle = null;
    if (gen === tracker.generation) tick(tracker, gen);
  });
  // Safety net: rVFC stalls while the tab is hidden or the camera freezes.
  tracker.loopTimer = tracker.deps.setTimeout(() => {
    tracker.loopTimer = null;
    if (gen !== tracker.generation || tracker.videoFrameHandle === null) return;
    try { video.cancelVideoFrameCallback?.(tracker.videoFrameHandle); } catch { /* callback already fired */ }
    tracker.videoFrameHandle = null;
    tick(tracker, gen);
  }, 250);
}

/** Arm the next loop tick (video-frame callback when due, timer otherwise). */
export function scheduleNext(tracker) {
  if (tracker.state !== 'running' || tracker.loopTimer !== null || tracker.videoFrameHandle !== null) return;
  const { deps, settings, video } = tracker;
  const gen = tracker.generation;
  const wait = Math.max(0, tracker.lastSendAt + settings.minFrameIntervalMs - deps.now());
  if (wait <= 4 && typeof video?.requestVideoFrameCallback === 'function' && !deps.disableVideoFrameCallback) {
    scheduleVideoFrame(tracker, gen, video);
    return;
  }
  tracker.loopTimer = deps.setTimeout(() => {
    tracker.loopTimer = null;
    if (gen === tracker.generation) tick(tracker, gen);
  }, Math.max(wait, 4));
}

export function cancelLoop(tracker) {
  if (tracker.loopTimer !== null) {
    tracker.deps.clearTimeout(tracker.loopTimer);
    tracker.loopTimer = null;
  }
  if (tracker.videoFrameHandle !== null) {
    try { tracker.video?.cancelVideoFrameCallback?.(tracker.videoFrameHandle); } catch { /* callback already fired */ }
    tracker.videoFrameHandle = null;
  }
}

function sendFrame(tracker, gen, now) {
  const token = ++tracker.sendToken;
  tracker.inFlight = true;
  tracker.inFlightSince = now;
  tracker.lastSendAt = now;
  // Not awaited: the loop keeps ticking so the stale/hung watchdog can run.
  detectOnce(tracker, gen).then(
    ({ result, inferenceMs }) => {
      if (gen === tracker.generation && tracker.state === 'running') tracker.handleResult(result, inferenceMs);
    },
    (error) => {
      if (gen !== tracker.generation) return;
      tracker.consecutiveFrameErrors += 1;
      if (error?.code === 'tracker-crashed') tracker.fail(error, gen);
      else if (tracker.consecutiveFrameErrors >= tracker.settings.maxConsecutiveFrameErrors) {
        tracker.fail(new TrackingError('tracker-crashed', 'The hand tracker stopped working. Press Try again.', error), gen);
      }
    },
  ).finally(() => {
    if (tracker.sendToken === token) tracker.inFlight = false;
    if (gen === tracker.generation) scheduleNext(tracker);
  });
}

/** One loop step: watchdogs, then send a frame if none is in flight and the throttle allows. */
export function tick(tracker, gen) {
  const { deps, settings } = tracker;
  if (tracker.loopTimer !== null) { deps.clearTimeout(tracker.loopTimer); tracker.loopTimer = null; }
  if (gen !== tracker.generation || tracker.state !== 'running') return;
  const now = deps.now();

  // Watchdog: stale tracking -> empty pointers; hung tracker -> error.
  if (now - tracker.lastResultAt > settings.staleAfterMs) {
    tracker.pointerTracker.reset();
    tracker.emitEmpty();
  }
  if (tracker.inFlight && now - tracker.inFlightSince > settings.hungAfterMs) {
    tracker.fail(new TrackingError('tracker-crashed', 'The hand tracker stopped responding. Press Try again.'), gen);
    return;
  }
  if (!tracker.inFlight && now - tracker.lastSendAt >= settings.minFrameIntervalMs - 2) sendFrame(tracker, gen, now);
  scheduleNext(tracker);
}
