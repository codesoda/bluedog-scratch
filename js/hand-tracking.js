// Webcam + local hand tracking lifecycle.
//
// new HandTracker(videoElement, {onFrame, onStatus, onError} = {})
//   await start()  -> resolves once the camera is live AND one inference has
//                     completed (not when a hand first appears). Rejects with a
//                     TrackingError (`.code`) on failure; a start cancelled by
//                     stop() rejects with code 'cancelled' (name AbortError).
//                     Start failures reject only; onError is for runtime faults
//                     after a successful start (camera ended, tracker crashed).
//   stop()         -> releases camera tracks, worker, frame loop and bitmaps.
//   pause()/resume() -> suspend inference (camera stays open); no stale pointers.
//   running        -> true while the camera is live (inferring or paused); see .paused.
// onFrame({pointers, landmarks, inferenceMs}) once per tracking result;
// pointers are mirrored landmark-8 pointers, `[]` when no hand / stale / paused.
//
// Inference runs in a dedicated module worker; exactly one transferable
// ImageBitmap is in flight at a time (no backlog), throttled to ~30 Hz. If the
// worker cannot initialise, a main-thread detector is used as an explicit
// fallback. All files are local; no camera is requested until start().
//
// Helpers live in tracking-camera.js (camera/video/errors), tracking-backends.js
// (worker + main-thread backends, timeouts) and tracking-runtime.js (defaults,
// browser deps, frame loop). HandTracker delegates to them explicitly.

import { PointerTracker, extractHands, mirrorLandmarks } from './pointer.js';
import { createBackend, detectOnce, verifyInference, withTimeout } from './tracking-backends.js';
import {
  FALLBACK_CONSTRAINTS, PREFERRED_CONSTRAINTS, TrackingError, attachVideo, cameraUnavailableError,
  cancelledError, describeCameraError, detachVideo, ensureCameraLive, stopStream, watchTracks,
} from './tracking-camera.js';
import { TRACKING_DEFAULTS, cancelLoop, defaultDeps, scheduleNext, tick } from './tracking-runtime.js';

export { TRACKING_DEFAULTS, TrackingError, describeCameraError };

/**
 * Intentional observer no-op. onFrame/onStatus/onError are optional; when a
 * caller omits one, that event is deliberately discarded (not a stub).
 */
function ignoreTrackingEvent() {
  // Deliberately empty: nobody subscribed to this event.
}

const observer = (fn) => (typeof fn === 'function' ? fn : ignoreTrackingEvent);

export class HandTracker {
  constructor(videoElement, { onFrame, onStatus, onError, pointerOptions, settings, ...depOverrides } = {}) {
    this.video = videoElement;
    this.onFrame = observer(onFrame);
    this.onStatus = observer(onStatus);
    this.onError = observer(onError);
    this.deps = { ...defaultDeps(), ...depOverrides };
    this.settings = { ...TRACKING_DEFAULTS, ...settings };
    this.pointerTracker = new PointerTracker(pointerOptions);
    this.state = 'idle'; // idle | starting | running | paused | error
    this.generation = 0;
    this.stream = null;
    this.backend = null;
    this.backendKind = null;
    this.startPromise = null;
    this.loopTimer = null;
    this.videoFrameHandle = null;
    this.inFlight = false;
    this.inFlightSince = 0;
    this.sendToken = 0;
    this.consecutiveFrameErrors = 0;
    this.lastSendAt = -Infinity;
    this.lastResultAt = 0;
    this.lastEmitEmpty = true;
    this.trackCleanups = [];
    this.abortStart = null;
    this.startAbortReason = null;
  }

  /** True while the camera is live (inferring, or paused for page visibility). */
  get running() {
    return this.state === 'running' || this.state === 'paused';
  }

  get paused() {
    return this.state === 'paused';
  }

  /** Start camera + tracker. Idempotent while starting/running. */
  start() {
    if (this.running) return Promise.resolve();
    if (this.startPromise) return this.startPromise;
    const gen = ++this.generation;
    this.state = 'starting';
    this.startAbortReason = null;
    const promise = this.startInternal(gen).then(
      () => {
        if (this.startPromise === promise) this.startPromise = null;
      },
      (error) => {
        if (this.startPromise === promise) this.startPromise = null;
        this.abortStart = null;
        // stop() -> 'cancelled'; a runtime fault during start (e.g. camera unplugged) -> that fault.
        if (gen !== this.generation) throw this.startAbortReason || cancelledError();
        this.releaseResources();
        this.state = 'error';
        throw describeCameraError(error);
      },
    );
    this.startPromise = promise;
    return promise;
  }

  /** Every await races an abort signal so stop()/fail() settle start() immediately. */
  armStartAbort() {
    let abort;
    const aborted = new Promise((_, reject) => { abort = reject; });
    aborted.catch(() => {});
    this.abortStart = (reason) => abort(reason);
    return (promise) => Promise.race([promise, aborted]);
  }

  async openCamera(gen, guard) {
    const { mediaDevices } = this.deps;
    const requestCamera = (constraints) => {
      const request = Promise.resolve(mediaDevices.getUserMedia(constraints));
      // A camera granted after stop()/retry must never stay on.
      request.then((granted) => { if (gen !== this.generation) stopStream(granted); }, () => {});
      return guard(request);
    };
    try {
      return await requestCamera(PREFERRED_CONSTRAINTS);
    } catch (error) {
      if (error?.name !== 'OverconstrainedError') throw describeCameraError(error);
      return requestCamera(FALLBACK_CONSTRAINTS);
    }
  }

  async startInternal(gen) {
    this.consecutiveFrameErrors = 0;
    const { deps, settings } = this;
    const check = () => {
      if (gen !== this.generation) throw cancelledError();
    };
    const status = (text) => { if (gen === this.generation) this.onStatus(text); };
    const guard = this.armStartAbort();

    if (!deps.mediaDevices?.getUserMedia) throw cameraUnavailableError(deps.isSecureContext);

    status('Asking for the camera…');
    const stream = await this.openCamera(gen, guard);
    check();
    this.stream = stream;
    this.watchTracks(stream, gen);

    status('Starting the camera…');
    await guard(withTimeout(attachVideo(this.video, stream), settings.videoReadyTimeoutMs, deps,
      () => new TrackingError('camera-failed', 'The camera did not send any pictures. Press Try again.')));
    check();
    this.ensureCameraLive();

    status('Waking up the hand finder…');
    await guard(createBackend(this, gen, status));
    check();
    this.ensureCameraLive();

    this.pointerTracker.reset();
    this.state = 'running';
    this.lastResultAt = deps.now();
    this.emitEmpty(true);
    status('Ready! Show me your hand.');
    this.abortStart = null;
    this.scheduleNext();
  }

  ensureCameraLive() {
    ensureCameraLive(this.stream);
  }

  /** One frame through the backend; resolves after the result is handled. */
  detectOnce(gen) {
    return detectOnce(this, gen);
  }

  /** Prove the backend really infers on a camera frame (retries while the camera warms up). */
  verifyInference(gen) {
    return verifyInference(this, gen);
  }

  watchTracks(stream, gen) {
    const onEnded = () => {
      if (gen !== this.generation) return;
      this.fail(new TrackingError('camera-ended', 'The camera stopped or was unplugged. Press Try again.'), gen);
    };
    this.trackCleanups.push(...watchTracks(stream, onEnded));
  }

  /** Runtime failure: release everything, emit empty pointers and report once. */
  fail(error, gen) {
    if (gen !== this.generation) return;
    const wasStarting = this.state === 'starting';
    this.generation += 1;
    this.releaseResources();
    this.state = 'error';
    this.emitEmpty(true);
    if (wasStarting) {
      // start() rejects with the real cause instead of calling onError.
      this.startAbortReason = error;
      this.abortStart?.(error);
      this.abortStart = null;
      return;
    }
    this.onError(error);
  }

  scheduleNext() {
    scheduleNext(this);
  }

  cancelLoop() {
    cancelLoop(this);
  }

  tick(gen) {
    tick(this, gen);
  }

  handleResult(result, inferenceMs) {
    this.consecutiveFrameErrors = 0;
    const now = this.deps.now();
    this.lastResultAt = now;
    const hands = extractHands(result);
    const pointers = this.pointerTracker.update(hands, now);
    this.lastEmitEmpty = pointers.length === 0;
    this.safeFrame({
      pointers,
      landmarks: hands.map((h) => mirrorLandmarks(h.landmarks)),
      inferenceMs: Number.isFinite(inferenceMs) ? inferenceMs : 0,
    });
  }

  emitEmpty(force = false) {
    if (!force && this.lastEmitEmpty) return;
    this.lastEmitEmpty = true;
    this.safeFrame({ pointers: [], landmarks: [], inferenceMs: 0 });
  }

  safeFrame(payload) {
    try {
      this.onFrame(payload);
    } catch (error) {
      // Never let a consumer exception kill the tracking loop.
      globalThis.console?.error?.(error);
    }
  }

  /** Suspend inference (e.g. page hidden). Camera stays open. */
  pause() {
    if (this.state !== 'running') return;
    this.generation += 1; // invalidates in-flight results
    this.cancelLoop();
    this.state = 'paused';
    this.pointerTracker.reset();
    this.emitEmpty(true);
  }

  /** Resume after pause(). Reports via onError if the camera ended meanwhile. */
  resume() {
    if (this.state !== 'paused') return;
    try {
      this.ensureCameraLive();
    } catch (error) {
      this.state = 'running';
      this.fail(error, this.generation);
      return;
    }
    const gen = ++this.generation;
    if (this.backend) this.backend.onFatal = (error) => this.fail(error, gen);
    // Re-arm track listeners for the new generation.
    for (const cleanup of this.trackCleanups.splice(0)) cleanup();
    if (this.stream) this.watchTracks(this.stream, gen);
    this.pointerTracker.reset();
    this.consecutiveFrameErrors = 0;
    this.state = 'running';
    this.lastResultAt = this.deps.now();
    this.lastSendAt = -Infinity;
    this.scheduleNext();
  }

  /** Release everything. Safe to call at any time, including mid-start. */
  stop() {
    const hadAnything = this.state !== 'idle' || this.stream || this.backend;
    this.generation += 1;
    if (this.abortStart) {
      const reason = cancelledError();
      this.startAbortReason = reason;
      this.abortStart(reason);
      this.abortStart = null;
    }
    this.releaseResources();
    this.state = 'idle';
    this.startPromise = null;
    if (hadAnything) this.emitEmpty(true);
  }

  releaseResources() {
    this.cancelLoop();
    this.sendToken += 1;
    this.inFlight = false;
    for (const cleanup of this.trackCleanups.splice(0)) cleanup();
    if (this.backend) {
      this.backend.onFatal = null;
      this.backend.close();
      this.backend = null;
      this.backendKind = null;
    }
    if (this.stream) {
      stopStream(this.stream);
      this.stream = null;
    }
    detachVideo(this.video);
    this.pointerTracker.reset();
  }
}
