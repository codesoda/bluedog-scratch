// Inference backends for HandTracker: the dedicated module worker (preferred)
// and an explicit main-thread fallback, plus the shared timeout helper.

import { TrackingError, closeBitmap, grabBitmap } from './tracking-camera.js';

const closedError = () => new TrackingError('tracker-closed', 'Tracker closed.');
const slowLoadError = () => new TrackingError('tracker-failed', 'The hand tracker took too long to load.');
const FATAL_CODES = new Set(['tracker-crashed', 'tracker-closed', 'tracker-failed', 'cancelled']);

/** Race `promise` against a timer that rejects with makeError(); always clears the timer. */
export function withTimeout(promise, ms, deps, makeError) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = deps.setTimeout(() => reject(makeError()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => deps.clearTimeout(timer));
}

/** Worker backend: one in-flight frame, results via promise. */
export class WorkerBackend {
  constructor(worker) {
    this.worker = worker;
    this.usesBitmaps = true;
    this.pending = null; // {id, resolve, reject}
    this.readyWaiter = null;
    this.onFatal = null;
    this.nextId = 1;
    this.closed = false;
    this.handleMessage = (event) => this.onMessage(event.data || {});
    this.handleError = (event) => {
      event?.preventDefault?.();
      this.fail(new TrackingError('tracker-crashed', `The hand tracker stopped${event?.message ? ` (${event.message})` : ''}.`));
    };
    worker.addEventListener('message', this.handleMessage);
    worker.addEventListener('error', this.handleError);
    worker.addEventListener('messageerror', this.handleError);
  }

  init(urls) {
    return new Promise((resolve, reject) => {
      this.readyWaiter = { resolve, reject };
      this.worker.postMessage({ type: 'init', wasmUrl: urls.wasmUrl, modelUrl: urls.modelUrl });
    });
  }

  detect(bitmap, timestamp) {
    if (this.closed) {
      closeBitmap(bitmap);
      return Promise.reject(closedError());
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending = { id, resolve, reject };
      try {
        this.worker.postMessage({ type: 'frame', id, bitmap, timestamp }, [bitmap]);
      } catch (error) {
        this.pending = null;
        closeBitmap(bitmap);
        reject(error);
      }
    });
  }

  onMessage(data) {
    if (this.closed) return;
    if (data.type === 'ready') {
      this.readyWaiter?.resolve();
      this.readyWaiter = null;
    } else if (data.type === 'result') {
      this.settleFrame(data.id, (pending) => pending.resolve({ result: data.result, inferenceMs: data.inferenceMs }));
    } else if (data.type === 'error' && data.stage === 'init') {
      const waiter = this.readyWaiter;
      this.readyWaiter = null;
      waiter?.reject(new TrackingError('tracker-failed', `The hand tracker could not load (${data.message}).`));
    } else if (data.type === 'error') {
      const error = new TrackingError('frame-failed', data.message || 'Frame failed.');
      this.settleFrame(data.id, (pending) => pending.reject(error), true);
    }
  }

  settleFrame(id, settle, matchAny = false) {
    if (!this.pending || (this.pending.id !== id && !(matchAny && id === undefined))) return;
    const pending = this.pending;
    this.pending = null;
    settle(pending);
  }

  fail(error) {
    if (this.closed) return;
    const waiter = this.readyWaiter;
    const pending = this.pending;
    this.readyWaiter = null;
    this.pending = null;
    if (waiter) waiter.reject(error);
    if (pending) pending.reject(error);
    if (!waiter) this.onFatal?.(error);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    const cancelled = closedError();
    this.readyWaiter?.reject(cancelled);
    this.pending?.reject(cancelled);
    this.readyWaiter = null;
    this.pending = null;
    this.worker.removeEventListener('message', this.handleMessage);
    this.worker.removeEventListener('error', this.handleError);
    this.worker.removeEventListener('messageerror', this.handleError);
    try { this.worker.postMessage({ type: 'close' }); } catch { /* worker already gone */ }
    try { this.worker.terminate(); } catch { /* worker already gone */ }
  }
}

/** Main-thread fallback backend (synchronous detection on the video element). */
export class MainThreadBackend {
  constructor(detector, now) {
    this.detector = detector;
    this.now = now;
    this.lastTimestamp = -Infinity;
    this.closed = false;
    this.usesBitmaps = false;
  }

  async detect(source, timestamp) {
    if (this.closed) throw closedError();
    const ts = Math.max(timestamp, this.lastTimestamp + 1);
    this.lastTimestamp = ts;
    const started = this.now();
    const result = this.detector.detect(source, ts);
    return { result, inferenceMs: this.now() - started };
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try { this.detector.close(); } catch { /* detector already closed */ }
  }
}

/** One frame through the tracker's backend; resolves with {result, inferenceMs}. */
export async function detectOnce(tracker, gen) {
  const backend = tracker.backend;
  if (!backend) throw new TrackingError('tracker-failed', 'No tracker.');
  const timestamp = tracker.deps.now();
  let source = tracker.video;
  if (backend.usesBitmaps) {
    source = await grabBitmap(tracker.video, tracker.deps.createImageBitmap);
    if (!source) throw new TrackingError('frame-failed', 'No camera frame yet.');
    if (gen !== tracker.generation || backend.closed) {
      closeBitmap(source);
      throw new TrackingError('cancelled', 'Cancelled.');
    }
  }
  return backend.detect(source, timestamp);
}

/** Prove the backend really infers on a camera frame (retries while the camera warms up). */
export async function verifyInference(tracker, gen) {
  const { deps, settings } = tracker;
  const deadline = deps.now() + settings.firstResultTimeoutMs;
  for (;;) {
    try {
      await withTimeout(detectOnce(tracker, gen), settings.firstResultTimeoutMs, deps,
        () => new TrackingError('tracker-failed', 'The hand tracker did not respond.'));
      return;
    } catch (error) {
      if (gen !== tracker.generation || FATAL_CODES.has(error?.code) || deps.now() >= deadline) throw error;
      await new Promise((resolve) => deps.setTimeout(resolve, 100));
    }
  }
}

function adoptBackend(tracker, backend, kind) {
  tracker.backend = backend;
  tracker.backendKind = kind;
}

function dropBackend(tracker, backend) {
  backend?.close();
  if (tracker.backend === backend) adoptBackend(tracker, null, null);
}

/** Try the worker backend. Returns null on success/cancel, or the load error to fall back from. */
async function startWorkerBackend(tracker, gen, urls) {
  const { deps, settings } = tracker;
  let backend = null;
  try {
    backend = new WorkerBackend(deps.createWorker());
    // Adopted before init so stop() during init terminates the worker.
    adoptBackend(tracker, backend, 'worker');
    await withTimeout(backend.init(urls), settings.initTimeoutMs, deps, slowLoadError);
    if (gen !== tracker.generation) return null;
    backend.onFatal = (error) => tracker.fail(error, gen);
    await verifyInference(tracker, gen);
    return null;
  } catch (error) {
    if (gen !== tracker.generation) return null;
    if (error?.code === 'camera-ended' || error?.code === 'cancelled') throw error;
    dropBackend(tracker, backend);
    return error;
  }
}

async function startMainThreadBackend(tracker, gen, urls, workerError) {
  const { deps, settings } = tracker;
  try {
    let timedOut = false;
    const creating = Promise.resolve(deps.createMainThreadDetector(urls));
    // Close a detector that finishes loading after a timeout, stop() or retry.
    creating.then((late) => {
      if (timedOut || gen !== tracker.generation) { try { late.close(); } catch { /* already closed */ } }
    }, () => {});
    const detector = await withTimeout(creating, settings.initTimeoutMs, deps, () => {
      timedOut = true;
      return slowLoadError();
    });
    if (gen !== tracker.generation) return;
    adoptBackend(tracker, new MainThreadBackend(detector, deps.now), 'main-thread');
    await verifyInference(tracker, gen);
  } catch (error) {
    if (gen !== tracker.generation) return;
    const detail = error?.message || workerError?.message || 'unknown error';
    throw new TrackingError('tracker-failed', `The hand tracker could not load (${detail}). Press Try again.`, error);
  }
}

/** Load a verified backend onto `tracker`: worker first, then the main-thread fallback. */
export async function createBackend(tracker, gen, status) {
  const { deps } = tracker;
  const urls = { wasmUrl: deps.wasmUrl, modelUrl: deps.modelUrl };
  let workerError = null;
  if (deps.createWorker && deps.createImageBitmap) {
    workerError = await startWorkerBackend(tracker, gen, urls);
    if (!workerError) return;
  }
  if (!deps.createMainThreadDetector) {
    throw workerError || new TrackingError('unsupported', 'This browser cannot run the hand tracker.');
  }
  status('Using the backup hand finder…');
  await startMainThreadBackend(tracker, gen, urls, workerError);
}
