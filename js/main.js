import '../css/game.css';
import { Game } from './game.js';
import { SCENE_IDS } from './scenes.js';
import { Renderer } from './renderer.js';
import { HandTracker } from './hand-tracking.js';
import { AudioManager } from './audio.js';
import { parseOptions, createRng, readMuted, saveMuted } from './config.js';
import { installDebug } from './debug.js';
import { renderHandGuide } from './onboarding.js';
import { HandReadiness } from './hand-readiness.js';
import { HandSetupView } from './hand-setup-view.js';
import { installGoControls } from './go-controls.js';
import { STATES } from './game-state.js';

const byId = id => document.getElementById(id);
const options = parseOptions(location.search, SCENE_IDS);
const rng = createRng(options.seed);
const game = new Game({
  rng, scene: options.scene || SCENE_IDS[Math.floor(rng() * SCENE_IDS.length)],
  bonusRate: options.bonusRate, cameoRate: options.cameoRate,
});
const world = byId('world');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const renderer = new Renderer(world, { reducedMotion });
const audio = new AudioManager();
audio.setMuted(readMuted());
const video = byId('camera-preview');
const handSetup = new HandSetupView(video);
const readiness = new HandReadiness();
const overlay = byId('setup-overlay');
const startButton = byId('start-button');
const retryButton = byId('retry-button');
const handHint = byId('hand-hint');
const countdown = byId('countdown');
const loading = byId('loading-progress');
renderHandGuide(byId('hand-guide'));
renderHandGuide(byId('lost-hand-guide'));
let pointers = [];
let landmarks = [];
let inferenceMs = 0;
let lastTrackingAt = 0;
let started = false;
let waiting = false;
let loadingCamera = false;
let manual = false;
let pausedByAdult = false;
let missingHandMs = 0;
let startupEpoch = 0;
let lastFrameAt = performance.now();
let fps = 60;
let updateDebug;

function setPointers(next) { pointers = next; lastTrackingAt = performance.now(); }
function setManual(value) { manual = value; }
function setMessage(title, message) {
  byId('setup-title').textContent = title;
  byId('setup-message').textContent = message;
}

function showError(error) {
  if (game.state === STATES.GO_COMPLETE) return;
  handSetup.hide();
  waiting = false;
  loadingCamera = false;
  pointers = [];
  readiness.reset();
  countdown.hidden = true;
  overlay.hidden = false;
  handHint.hidden = true;
  loading.hidden = true;
  startButton.hidden = true;
  retryButton.hidden = false;
  retryButton.disabled = false;
  const permission = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
  setMessage(permission ? 'The camera needs permission' : 'Let’s help the camera',
    permission ? 'Grown-ups: allow camera access in your browser, then try again.'
      : error?.message || 'Connect a camera, close other camera apps, and try again.');
  tracker.stop();
  game.update(0, []);
  syncCameraPreview();
  byId('stop-camera').hidden = true;
  byId('resume-camera').hidden = false;
}

const tracker = new HandTracker(video, {
  onFrame: frame => {
    setPointers(frame.pointers || []);
    if (waiting) handSetup.draw(frame);
    landmarks = options.debug ? frame.landmarks || [] : [];
    inferenceMs = frame.inferenceMs || 0;
  },
  onStatus: status => {
    if (loadingCamera) byId('setup-message').textContent = status;
  },
  onError: error => showError(error),
});

const goControls = installGoControls({ game, onComplete: endTurn, onPlayAgain: playAgain });

function endTurn() {
  startupEpoch++;
  tracker.stop();
  started = false;
  waiting = false;
  loadingCamera = false;
  pausedByAdult = true;
  pointers = [];
  landmarks = [];
  readiness.reset();
  handSetup.hide();
  overlay.hidden = true;
  countdown.hidden = true;
  handHint.hidden = true;
  loading.hidden = true;
  video.hidden = true;
  byId('stop-camera').hidden = true;
  byId('resume-camera').hidden = true;
}

function playAgain() {
  game.start();
  missingHandMs = 0;
  byId('settings-panel').hidden = true;
  byId('settings-toggle').setAttribute('aria-expanded', 'false');
  overlay.hidden = false;
  void startCamera();
}

function syncCameraPreview() {
  video.hidden = !byId('camera-preview-toggle').checked || !tracker.running;
}

function beginPlay() {
  if (!started) game.start();
  handSetup.hide();
  started = true;
  waiting = false;
  readiness.reset();
  countdown.hidden = true;
  overlay.hidden = true;
  handHint.hidden = true;
}

// Render a scene before camera permission, without advancing its interaction clock.
game.start();

async function startCamera() {
  if (loadingCamera || game.state === STATES.GO_COMPLETE) return;
  byId('stop-camera').hidden = false;
  byId('resume-camera').hidden = true;
  const epoch = ++startupEpoch;
  pausedByAdult = false;
  loadingCamera = true;
  waiting = false;
  pointers = [];
  readiness.reset();
  handSetup.hide();
  startButton.disabled = true;
  retryButton.disabled = true;
  startButton.hidden = true;
  retryButton.hidden = true;
  loading.hidden = false;
  setMessage('Getting ready…', options.mouse ? 'Debug mouse input. No camera is requested.' : 'Allow the camera. Everything stays on this device.');
  // Call unlock during the adult click, before awaiting camera permission.
  void audio.unlock().catch(() => false);
  try {
    if (options.mouse) {
      loadingCamera = false;
      loading.hidden = true;
      beginPlay();
      return;
    }
    await tracker.start();
    if (epoch !== startupEpoch) return;
    loadingCamera = false;
    loading.hidden = true;
    syncCameraPreview();
    if (started) { overlay.hidden = true; return; }
    waiting = true;
    handSetup.show();
    setMessage('Show me your hand', 'Point your index finger up to the sky. Keep your hand where the camera can see it.');
  } catch (error) {
    if (epoch === startupEpoch) showError(error);
  } finally {
    if (epoch === startupEpoch) { startButton.disabled = false; retryButton.disabled = false; }
  }
}

function updateStartup(dt) {
  if (!waiting) return;
  const status = readiness.update(dt, pointers);
  if (!pointers.length) handSetup.draw({});
  countdown.hidden = status.countdown === null;
  const number = status.countdown === null ? '' : String(status.countdown);
  if (countdown.textContent !== number) countdown.textContent = number;
  const message = status.hint
    ? 'Point your index finger up to the sky. Move slowly so the camera can see your hand.'
    : 'Point your index finger up to the sky. Hold your hand steady while we get ready.';
  if (byId('setup-message').textContent !== message) byId('setup-message').textContent = message;
  if (status.phase === 'ready') beginPlay();
}

function render() {
  const events = game.drainEvents();
  renderer.handleEvents(events);
  audio.handleEvents(events);
  const snapshot = game.snapshot();
  goControls.update(snapshot, started);
  renderer.render(snapshot, pointers, { debug: options.debug, fps, landmarks });
  updateDebug?.(snapshot);
  if (options.debug) byId('debug-text').textContent += `\nInference: ${inferenceMs.toFixed(1)} ms`;
}

function tick(now) {
  const dt = Math.max(0, Math.min(80, now - lastFrameAt));
  lastFrameAt = now;
  if (dt > 0) fps = fps * 0.95 + Math.min(240, 1000 / dt) * 0.05;
  if (!manual && !document.hidden) {
    if (!options.mouse && now - lastTrackingAt > 350) pointers = [];
    const hasHand = pointers.some(p => p.active);
    updateStartup(dt);
    if (started && !pausedByAdult) {
      game.update(dt, pointers);
      missingHandMs = hasHand ? 0 : missingHandMs + dt;
      handHint.hidden = missingHandMs < 800 || !game.snapshot().paused || !overlay.hidden;
    }
  }
  render();
  requestAnimationFrame(tick);
}

function syncSoundButton() {
  const button = byId('sound-toggle');
  button.textContent = audio.muted ? '♪̸' : '♫';
  button.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
  button.setAttribute('aria-pressed', String(audio.muted));
  button.title = audio.muted ? 'Unmute sound' : 'Mute sound';
}

startButton.addEventListener('click', startCamera);
retryButton.addEventListener('click', startCamera);
byId('sound-toggle').addEventListener('click', () => {
  audio.setMuted(!audio.muted);
  saveMuted(audio.muted);
  if (!audio.muted) void audio.unlock();
  syncSoundButton();
});
byId('fullscreen-toggle').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { byId('fullscreen-toggle').title = 'Full screen is not available in this browser'; }
});
document.addEventListener('fullscreenchange', () => {
  byId('fullscreen-toggle').setAttribute('aria-label', document.fullscreenElement ? 'Exit full screen' : 'Enter full screen');
});
byId('settings-toggle').addEventListener('click', () => {
  const panel = byId('settings-panel');
  panel.hidden = !panel.hidden;
  byId('settings-toggle').setAttribute('aria-expanded', String(!panel.hidden));
});
byId('camera-preview-toggle').checked = options.camera;
byId('camera-preview-toggle').addEventListener('change', syncCameraPreview);
byId('stop-camera').addEventListener('click', () => {
  startupEpoch++;
  tracker.stop();
  handSetup.hide();
  readiness.reset();
  pointers = [];
  game.update(0, []);
  pausedByAdult = true;
  loadingCamera = false;
  waiting = false;
  video.hidden = true;
  loading.hidden = true;
  countdown.hidden = true;
  handHint.hidden = true;
  byId('stop-camera').hidden = true;
  byId('resume-camera').hidden = false;
  if (!started || !overlay.hidden) {
    overlay.hidden = false;
    retryButton.hidden = true;
    startButton.hidden = false;
    startButton.disabled = false;
    setMessage('The camera is off', 'A grown-up can start it again when you are ready.');
  }
});
byId('resume-camera').addEventListener('click', () => {
  overlay.hidden = false;
  void startCamera();
});

document.addEventListener('visibilitychange', () => {
  pointers = [];
  game.update(0, []);
  readiness.reset();
  lastFrameAt = performance.now();
  if (document.hidden) tracker.pause();
  else if (!pausedByAdult && tracker.running) tracker.resume();
});
window.addEventListener('pagehide', event => {
  startupEpoch++;
  tracker.stop();
  handSetup.hide();
  readiness.reset();
  pointers = [];
  game.update(0, []);
  if (!event.persisted) audio.destroy();
});
window.addEventListener('pageshow', event => {
  if (event.persisted && !options.mouse && !pausedByAdult && (started || waiting || loadingCamera)) {
    showError(new Error('The camera was stopped while you were away. Try again to continue.'));
  }
});

updateDebug = installDebug({
  game, renderer, world, options, getPointers: () => pointers, setPointers,
  start: beginPlay, render, setManual,
  getTrackingStatus: () => ({ running: tracker.running, backend: tracker.backendKind, state: tracker.state, inferenceMs }),
});
syncSoundButton();
render();
requestAnimationFrame(tick);
