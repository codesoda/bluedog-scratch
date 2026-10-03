import test from 'node:test';
import assert from 'node:assert/strict';
import { HandTracker, TrackingError, describeCameraError } from '../../js/hand-tracking.js';
import { installClassicScriptBridge, serializeResult } from '../../js/tracking-worker.js';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ADAPTER = fileURLToPath(new URL('../../public/mediapipe/wasm/vision_wasm_internal.js.mjs', import.meta.url));

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 1500) => {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await tick(2);
  }
};

class FakeTrack {
  constructor() { this.readyState = 'live'; this.listeners = {}; this.stopped = false; }
  stop() { this.stopped = true; this.readyState = 'ended'; }
  addEventListener(t, f) { (this.listeners[t] ||= new Set()).add(f); }
  removeEventListener(t, f) { this.listeners[t]?.delete(f); }
  end() { this.readyState = 'ended'; for (const f of this.listeners.ended || []) f(); }
}
class FakeStream {
  constructor() { this.track = new FakeTrack(); }
  getTracks() { return [this.track]; }
  getVideoTracks() { return [this.track]; }
}
class FakeVideo {
  constructor() { this.readyState = 0; this.videoWidth = 0; this.listeners = {}; this._src = null; this.paused = true; }
  set srcObject(s) {
    this._src = s;
    if (s) setTimeout(() => { this.readyState = 4; this.videoWidth = 640; for (const f of [...(this.listeners.loadeddata || [])]) f(); }, 1);
    else { this.readyState = 0; this.videoWidth = 0; }
  }
  get srcObject() { return this._src; }
  setAttribute() {}
  addEventListener(t, f) { (this.listeners[t] ||= new Set()).add(f); }
  removeEventListener(t, f) { this.listeners[t]?.delete(f); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}
class FakeBitmap { constructor() { this.closed = false; } close() { this.closed = true; } }

/** Programmable fake worker speaking the tracking-worker protocol. */
class FakeWorker {
  constructor(opts = {}) {
    this.opts = opts; this.listeners = {}; this.frames = []; this.terminated = false; this.inFlight = 0; this.maxInFlight = 0;
    FakeWorker.instances.push(this);
  }
  addEventListener(t, f) { (this.listeners[t] ||= new Set()).add(f); }
  removeEventListener(t, f) { this.listeners[t]?.delete(f); }
  emit(type, data) { for (const f of this.listeners[type] || []) f(type === 'message' ? { data } : data); }
  postMessage(msg, transfer) {
    if (this.terminated) return;
    if (msg.type === 'init') {
      this.init = msg;
      if (this.opts.initError) setTimeout(() => this.emit('message', { type: 'error', stage: 'init', message: this.opts.initError }), 1);
      else if (!this.opts.hangInit) setTimeout(() => this.emit('message', { type: 'ready' }), 1);
    } else if (msg.type === 'frame') {
      assert.deepEqual(transfer, [msg.bitmap], 'bitmap is transferred');
      this.frames.push(msg);
      this.inFlight += 1;
      this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
      if (!this.opts.manual) setTimeout(() => this.respond(), 2);
    }
  }
  respond(result = this.opts.result || { landmarks: [], handedness: [] }) {
    const frame = this.frames.find((f) => !f.answered);
    if (!frame || this.terminated) return;
    frame.answered = true;
    frame.bitmap.close();
    this.inFlight -= 1;
    this.emit('message', { type: 'result', id: frame.id, result, inferenceMs: 5 });
  }
  terminate() { this.terminated = true; }
}
FakeWorker.instances = [];

function handResult(rawX, rawY) {
  const lm = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  lm[8] = { x: rawX, y: rawY, z: 0 };
  return { landmarks: [lm], handedness: [[{ categoryName: 'Right', score: 0.9 }]] };
}

function setup({ worker = {}, gum, mainThread, settings } = {}) {
  FakeWorker.instances = [];
  const streams = [];
  const frames = [];
  const statuses = [];
  const errors = [];
  const bitmaps = [];
  const video = new FakeVideo();
  const getUserMedia = gum || (async () => { const s = new FakeStream(); streams.push(s); return s; });
  const tracker = new HandTracker(video, {
    onFrame: (f) => frames.push(f),
    onStatus: (s) => statuses.push(s),
    onError: (e) => errors.push(e),
    mediaDevices: { getUserMedia },
    createWorker: worker === null ? null : () => new FakeWorker(worker),
    createMainThreadDetector: mainThread || null,
    createImageBitmap: async () => { const b = new FakeBitmap(); bitmaps.push(b); return b; },
    wasmUrl: 'http://localhost/mediapipe/wasm',
    modelUrl: 'http://localhost/models/hand_landmarker.task',
    settings: { initTimeoutMs: 500, firstResultTimeoutMs: 400, staleAfterMs: 150, hungAfterMs: 400, ...settings },
  });
  return { tracker, video, streams, frames, statuses, errors, bitmaps, worker: () => FakeWorker.instances.at(-1) };
}

test('start resolves after camera + first inference, then emits mirrored pointers', async () => {
  const env = setup({ worker: { result: handResult(0.25, 0.4) } });
  await env.tracker.start();
  assert.equal(env.tracker.running, true);
  assert.equal(env.tracker.backendKind, 'worker');
  assert.match(env.worker().init.modelUrl, /models\/hand_landmarker\.task$/);
  assert.ok(env.statuses.length >= 3);
  assert.equal(env.statuses.at(-1), 'Ready! Show me your hand.');
  await until(() => env.frames.some((f) => f.pointers.length));
  const frame = env.frames.find((f) => f.pointers.length);
  assert.ok(Math.abs(frame.pointers[0].x - 0.75) < 1e-9);
  assert.equal(frame.landmarks.length, 1);
  assert.equal(frame.inferenceMs, 5);
  env.tracker.stop();
  assert.equal(env.streams[0].track.stopped, true);
  assert.equal(env.worker().terminated, true);
  assert.equal(env.video.srcObject, null);
  assert.equal(env.tracker.running, false);
});

test('only one frame is ever in flight (no backlog)', async () => {
  const env = setup({ worker: { manual: true } });
  const starting = env.tracker.start();
  await until(() => env.worker()?.frames.length === 1);
  env.worker().respond();
  await starting;
  await until(() => env.worker().frames.length === 2);
  await tick(120); // many loop ticks pass while the frame is pending
  assert.equal(env.worker().frames.length, 2);
  assert.equal(env.worker().maxInFlight, 1);
  env.worker().respond();
  await until(() => env.worker().frames.length === 3);
  assert.equal(env.worker().maxInFlight, 1);
  env.tracker.stop();
});

test('stale tracking emits empty pointers', async () => {
  const env = setup({ worker: { manual: true } });
  const starting = env.tracker.start();
  await until(() => env.worker()?.frames.length === 1);
  env.worker().respond(handResult(0.5, 0.5));
  await starting;
  await until(() => env.worker().frames.length === 2);
  env.worker().respond(handResult(0.5, 0.5));
  await until(() => env.frames.at(-1).pointers.length === 1);
  await until(() => env.frames.at(-1).pointers.length === 0, 1000);
  env.tracker.stop();
});

test('permission denial rejects with a friendly error and no camera leak', async () => {
  const denied = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
  const env = setup({ gum: async () => { throw denied; } });
  await assert.rejects(env.tracker.start(), (e) => e.code === 'permission-denied' && e.name === 'NotAllowedError');
  assert.equal(env.errors.length, 0);
  assert.equal(env.tracker.running, false);
  assert.equal(FakeWorker.instances.length, 0);
});

test('error mapping covers missing, busy and unknown cameras', () => {
  assert.equal(describeCameraError({ name: 'NotFoundError' }).code, 'no-camera');
  assert.equal(describeCameraError({ name: 'NotReadableError' }).code, 'camera-busy');
  assert.equal(describeCameraError(new Error('x')).code, 'camera-failed');
  const e = new TrackingError('camera-ended', 'gone');
  assert.equal(describeCameraError(e), e);
});

test('no mediaDevices on an insecure page fails fast', async () => {
  const env = setup();
  env.tracker.deps.mediaDevices = undefined;
  env.tracker.deps.isSecureContext = false;
  await assert.rejects(env.tracker.start(), (e) => e.code === 'insecure');
});

test('stop() during a pending permission prompt cancels and stops the late stream', async () => {
  let grant;
  const late = new FakeStream();
  const env = setup({ gum: () => new Promise((r) => { grant = r; }) });
  const starting = env.tracker.start();
  await tick(5);
  env.tracker.stop();
  await assert.rejects(starting, (e) => e.code === 'cancelled' && e.name === 'AbortError');
  grant(late);
  await tick(5);
  assert.equal(late.track.stopped, true);
  assert.equal(FakeWorker.instances.length, 0);
});

test('stop() during tracker init terminates the worker and camera; retry works', async () => {
  const env = setup({ worker: { hangInit: true } });
  const starting = env.tracker.start();
  await until(() => FakeWorker.instances.length === 1);
  env.tracker.stop();
  await assert.rejects(starting, (e) => e.code === 'cancelled');
  assert.equal(FakeWorker.instances[0].terminated, true);
  assert.equal(env.streams[0].track.stopped, true);
  env.tracker.deps.createWorker = () => new FakeWorker({});
  await env.tracker.start();
  assert.equal(env.tracker.running, true);
  env.tracker.stop();
  assert.equal(env.streams[1].track.stopped, true);
});

test('repeated start() calls share one camera request', async () => {
  const env = setup();
  const a = env.tracker.start();
  const b = env.tracker.start();
  assert.equal(a, b);
  await a;
  await env.tracker.start();
  assert.equal(env.streams.length, 1);
  env.tracker.stop();
});

test('worker load failure falls back to an explicit main-thread detector', async () => {
  let detectorClosed = false;
  const env = setup({
    worker: { initError: 'importScripts failed' },
    mainThread: async () => ({ detect: () => handResult(0.1, 0.9), close: () => { detectorClosed = true; } }),
  });
  await env.tracker.start();
  assert.equal(env.tracker.backendKind, 'main-thread');
  assert.equal(FakeWorker.instances[0].terminated, true);
  assert.ok(env.statuses.some((s) => /backup/i.test(s)));
  await until(() => env.frames.some((f) => f.pointers.length));
  env.tracker.stop();
  assert.equal(detectorClosed, true);
});

test('tracker load failure with no fallback rejects (never hangs) and releases camera', async () => {
  const env = setup({ worker: { initError: 'model 404' } });
  await assert.rejects(env.tracker.start(), (e) => e.code === 'tracker-failed' && /model 404/.test(e.message));
  assert.equal(env.streams[0].track.stopped, true);
  assert.equal(env.tracker.running, false);
});

test('hanging tracker init times out instead of leaving startup stuck', async () => {
  const env = setup({ worker: { hangInit: true }, settings: { initTimeoutMs: 40 } });
  await assert.rejects(env.tracker.start(), (e) => e.code === 'tracker-failed');
  assert.equal(FakeWorker.instances[0].terminated, true);
  assert.equal(env.streams[0].track.stopped, true);
});

test('camera ended at runtime reports onError and cleans up', async () => {
  const env = setup();
  await env.tracker.start();
  env.streams[0].track.end();
  assert.equal(env.errors.length, 1);
  assert.equal(env.errors[0].code, 'camera-ended');
  assert.equal(env.tracker.running, false);
  assert.equal(env.worker().terminated, true);
  assert.deepEqual(env.frames.at(-1).pointers, []);
});

test('camera ended during start rejects start with the real cause', async () => {
  const env = setup({ worker: { hangInit: true } });
  const starting = env.tracker.start();
  await until(() => FakeWorker.instances.length === 1);
  env.streams[0].track.end();
  await assert.rejects(starting, (e) => e.code === 'camera-ended');
  assert.equal(env.errors.length, 0);
});

test('worker crash at runtime reports onError', async () => {
  const env = setup();
  await env.tracker.start();
  env.worker().emit('error', { message: 'boom', preventDefault() {} });
  assert.equal(env.errors[0]?.code, 'tracker-crashed');
  assert.equal(env.streams[0].track.stopped, true);
});

test('pause drops in-flight results and stale pointers; resume restarts inference', async () => {
  const env = setup({ worker: { manual: true } });
  const starting = env.tracker.start();
  await until(() => env.worker()?.frames.length === 1);
  env.worker().respond();
  await starting;
  await until(() => env.worker().frames.length === 2);
  env.tracker.pause();
  assert.equal(env.tracker.paused, true);
  assert.equal(env.tracker.running, true, 'camera stays live while paused');
  const count = env.frames.length;
  assert.deepEqual(env.frames.at(-1).pointers, []);
  env.worker().respond(handResult(0.5, 0.5));
  await tick(60);
  assert.equal(env.frames.length, count, 'paused result discarded');
  assert.equal(env.worker().frames.length, 2, 'no inference while paused');
  env.tracker.resume();
  await until(() => env.worker().frames.length === 3);
  env.worker().respond(handResult(0.5, 0.5));
  await until(() => env.frames.at(-1).pointers.length === 1);
  env.tracker.stop();
});

test('immediate pause/resume never sends a second frame while one remains in flight', async () => {
  const env = setup({ worker: { manual: true } });
  const starting = env.tracker.start();
  await until(() => env.worker()?.frames.length === 1);
  env.worker().respond();
  await starting;
  await until(() => env.worker().frames.length === 2);
  env.tracker.pause();
  env.tracker.resume();
  await tick(70);
  assert.equal(env.worker().frames.length, 2);
  assert.equal(env.worker().maxInFlight, 1);
  env.worker().respond(handResult(0.5, 0.5));
  await until(() => env.worker().frames.length === 3);
  assert.equal(env.worker().maxInFlight, 1);
  env.worker().respond(handResult(0.5, 0.5));
  await until(() => env.frames.at(-1).pointers.length === 1);
  env.tracker.stop();
});

function rejectPendingFrame(worker) {
  const frame = worker.frames.find(f => !f.answered);
  assert.ok(frame);
  frame.answered = true;
  frame.bitmap.close();
  worker.inFlight--;
  worker.emit('message', { type: 'error', stage: 'frame', id: frame.id, message: 'Persistent inference failure' });
}

test('persistent worker frame errors report a retry error and release the camera', async () => {
  const env = setup({ worker: { manual: true }, settings: { maxConsecutiveFrameErrors: 3 } });
  const starting = env.tracker.start();
  await until(() => env.worker()?.frames.length === 1);
  env.worker().respond();
  await starting;
  for (let i = 0; i < 3; i++) {
    await until(() => env.worker().frames.some(frame => !frame.answered));
    rejectPendingFrame(env.worker());
  }
  await until(() => env.errors.length === 1);
  assert.equal(env.errors[0].code, 'tracker-crashed');
  assert.match(env.errors[0].message, /Try again/);
  assert.equal(env.streams[0].track.stopped, true);
  assert.equal(env.worker().terminated, true);
});

test('a successful result clears transient frame error counts', async () => {
  const env = setup({ worker: { manual: true }, settings: { maxConsecutiveFrameErrors: 3 } });
  const starting = env.tracker.start();
  await until(() => env.worker()?.frames.length === 1);
  env.worker().respond();
  await starting;
  await until(() => env.worker().frames.length === 2);
  rejectPendingFrame(env.worker());
  await until(() => env.tracker.consecutiveFrameErrors === 1);
  await until(() => env.worker().frames.length === 3);
  env.worker().respond();
  await until(() => env.tracker.consecutiveFrameErrors === 0);
  assert.equal(env.errors.length, 0);
  env.tracker.stop();
});

test('persistent main-thread inference errors also release the camera', async () => {
  let calls = 0;
  let closed = false;
  const env = setup({ worker: null, settings: { maxConsecutiveFrameErrors: 3 }, mainThread: async () => ({
    detect: () => { if (calls++ === 0) return { landmarks: [] }; throw new Error('WASM stopped'); },
    close: () => { closed = true; },
  }) });
  await env.tracker.start();
  await until(() => env.errors.length === 1);
  assert.equal(env.errors[0].code, 'tracker-crashed');
  assert.equal(env.streams[0].track.stopped, true);
  assert.equal(closed, true);
});

test('module-worker bridge imports the local loader adapter and exposes ModuleFactory', async () => {
  const location = { href: 'http://localhost/game/assets/w.js', origin: 'http://localhost' };
  const factory = () => 42;
  const imported = [];
  const scope = { location };
  const importModule = async (url) => { imported.push(url); return { default: factory }; };
  assert.equal(installClassicScriptBridge(scope, importModule), true);
  await scope.import('/game/mediapipe/wasm/vision_wasm_internal.js');
  assert.deepEqual(imported, ['http://localhost/game/mediapipe/wasm/vision_wasm_internal.js.mjs']);
  assert.equal(scope.ModuleFactory, factory);
  assert.equal(scope.ModuleFactory(), 42);
  // Foreign origins are refused before any import is attempted.
  await assert.rejects(scope.import('https://cdn.example.com/vision_wasm_internal.js'), /non-local/);
  assert.equal(imported.length, 1);
  // Missing adapter or missing export fail with clear load errors.
  const broken = { location };
  installClassicScriptBridge(broken, async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(broken.import('/x.js'), /failed to load .*x\.js\.mjs.*prepare:tracking/);
  const empty = { location };
  installClassicScriptBridge(empty, async () => ({}));
  await assert.rejects(empty.import('/x.js'), /did not initialise/);
  assert.equal(empty.ModuleFactory, undefined);
  assert.equal(installClassicScriptBridge({ import: () => {} }, importModule), false);
});

test('generated loader adapters default-export the pinned ModuleFactory', { skip: !existsSync(ADAPTER) && 'run npm run prepare:tracking' }, async () => {
  const mod = await import(pathToFileURL(ADAPTER).href);
  assert.equal(typeof mod.default, 'function');
});

test('serializeResult keeps only cloneable plain data', () => {
  const out = serializeResult({ landmarks: [[{ x: 1, y: 2, z: 3, visibility: 1 }]], handedness: [[{ categoryName: 'Left', score: 0.8, index: 0, displayName: '' }]] });
  assert.deepEqual(out, { landmarks: [[{ x: 1, y: 2, z: 3 }]], handedness: [[{ categoryName: 'Left', score: 0.8 }]] });
});
