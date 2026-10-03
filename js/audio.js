// Synthesized Web Audio feedback for the blue dog game.
//
// Every sound is a short, bounded one-shot built from oscillators and gain
// envelopes. There is no looping noise or music bed. All output goes through a
// clamped master gain and a gentle compressor so nothing can spike loudly.
// The manager never touches the DOM or the webcam and silently no-ops when Web
// Audio is unavailable or anything throws.

import {
  AUDIO_LIMITS,
  DEFAULT_VOLUME,
  MAX_MASTER,
  MAX_SOUNDS_PER_BATCH,
  PRIORITY,
  THROTTLE_MS,
  clamp,
  normaliseKind,
  propFamily,
  setParam,
} from './audio-constants.js';
import { playEventCue, propCue } from './audio-cues.js';
import { primeOutput, scheduleTone, stopAllVoices } from './audio-voices.js';

export { AUDIO_LIMITS, propFamily };

function defaultContextFactory() {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  const Ctor = g.AudioContext || g.webkitAudioContext;
  if (typeof Ctor !== 'function') return null;
  try {
    return new Ctor({ latencyHint: 'interactive' });
  } catch {
    try {
      return new Ctor();
    } catch {
      return null;
    }
  }
}

function defaultNow() {
  const p = globalThis.performance;
  return p && typeof p.now === 'function' ? p.now() : Date.now();
}

export class AudioManager {
  /**
   * @param {object} [options]
   * @param {() => (AudioContext|null)} [options.contextFactory] injectable for tests
   * @param {() => number} [options.now] ms clock used for throttling
   * @param {() => number} [options.random] used for small pitch variation
   * @param {number} [options.volume] 0..1
   * @param {boolean} [options.muted]
   */
  constructor({
    contextFactory = defaultContextFactory,
    now = defaultNow,
    random = Math.random,
    volume = DEFAULT_VOLUME,
    muted = false,
  } = {}) {
    this._contextFactory = contextFactory;
    this._now = now;
    this._random = random;
    this._volume = clamp(volume, 0, 1);
    this._muted = Boolean(muted);
    this._ctx = null;
    this._master = null;
    this._compressor = null;
    this._voices = new Set();
    this._lastPlayed = new Map();
    this._unsupported = false;
    this._destroyed = false;
    this._unlockPromise = null;
    // Explicit callbacks the cue functions use (see audio-cues.js).
    this._cueHost = {
      tone: (options) => this._tone(options),
      jitter: (cents) => this._jitter(cents),
      random: () => this._random(),
    };
  }

  get muted() {
    return this._muted;
  }

  /** True once a context exists and is running. */
  get ready() {
    return Boolean(this._ctx && this._ctx.state === 'running' && !this._destroyed);
  }

  get activeVoices() {
    return this._voices.size;
  }

  /**
   * Must be called synchronously from a user gesture (the start click). The
   * context is created and resume() is requested before any await so browser
   * autoplay policies accept it. Resolves true if audio is usable.
   */
  unlock() {
    if (this._destroyed || this._unsupported) return Promise.resolve(false);
    if (!this._ensureContext()) return Promise.resolve(false);
    if (this._muted) return Promise.resolve(false); // stay suspended while muted
    if (this._ctx.state === 'running') {
      this._primeOutput();
      return Promise.resolve(true);
    }
    if (this._unlockPromise) return this._unlockPromise;
    let resumeResult;
    try {
      resumeResult = this._ctx.resume ? this._ctx.resume() : undefined;
    } catch {
      return Promise.resolve(false);
    }
    // A tiny silent buffer-less blip helps older Safari/iOS unlock output.
    this._primeOutput();
    this._unlockPromise = Promise.resolve(resumeResult)
      .then(() => {
        // Muted or destroyed while resuming: put it back to sleep.
        if (this._destroyed) return false;
        if (this._muted) {
          this._suspend();
          return false;
        }
        return Boolean(this._ctx && this._ctx.state === 'running');
      })
      .catch(() => false)
      .finally(() => {
        this._unlockPromise = null;
      });
    return this._unlockPromise;
  }

  setMuted(value) {
    const next = Boolean(value);
    this._muted = next;
    if (this._destroyed || !this._ctx) return;
    if (next) {
      // Silence immediately, including already-playing tails.
      this._setMasterGain(0);
      this._stopAllVoices();
      this._suspend();
    } else {
      this._setMasterGain(this._masterLevel());
      try {
        if (this._ctx.state !== 'running' && this._ctx.state !== 'closed' && this._ctx.resume) {
          const r = this._ctx.resume();
          if (r && typeof r.catch === 'function') r.catch(() => {});
        }
      } catch {
        /* ignore */
      }
    }
  }

  setVolume(value) {
    this._volume = clamp(value, 0, 1);
    if (!this._muted && this._master) this._setMasterGain(this._masterLevel());
  }

  /** Accepts game events [{type, x?, y?, kind?, progress?}]. Never throws. */
  handleEvents(events) {
    if (this._muted || this._destroyed || !Array.isArray(events) || events.length === 0) return;
    if (!this.ready) return; // do not queue sounds into a suspended context
    let started = 0;
    // Prioritise rarer, more meaningful events if a frame produced many.
    const ordered = events
      .filter((e) => e && typeof e.type === 'string')
      .map((e, i) => ({ e, i, p: PRIORITY[e.type] ?? 0 }))
      .sort((a, b) => b.p - a.p || a.i - b.i);
    for (const { e } of ordered) {
      if (started >= MAX_SOUNDS_PER_BATCH) break;
      try {
        if (this._play(e)) started += 1;
      } catch {
        /* never let audio break gameplay */
      }
    }
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._stopAllVoices();
    const ctx = this._ctx;
    try {
      this._compressor?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this._master?.disconnect();
    } catch {
      /* ignore */
    }
    this._master = null;
    this._compressor = null;
    this._ctx = null;
    this._lastPlayed.clear();
    if (ctx && ctx.state !== 'closed' && typeof ctx.close === 'function') {
      try {
        const r = ctx.close();
        if (r && typeof r.catch === 'function') r.catch(() => {});
      } catch {
        /* ignore */
      }
    }
  }

  // ---------------------------------------------------------------- internals

  _ensureContext() {
    if (this._ctx) return true;
    let ctx = null;
    try {
      ctx = this._contextFactory ? this._contextFactory() : null;
    } catch {
      ctx = null;
    }
    if (!ctx || typeof ctx.createOscillator !== 'function' || typeof ctx.createGain !== 'function') {
      this._unsupported = true;
      return false;
    }
    try {
      const master = ctx.createGain();
      master.gain.value = this._muted ? 0 : this._masterLevel();
      let tail = master;
      if (typeof ctx.createDynamicsCompressor === 'function') {
        const comp = ctx.createDynamicsCompressor();
        setParam(comp.threshold, -18);
        setParam(comp.knee, 12);
        setParam(comp.ratio, 6);
        setParam(comp.attack, 0.004);
        setParam(comp.release, 0.2);
        master.connect(comp);
        tail = comp;
        this._compressor = comp;
      }
      tail.connect(ctx.destination);
      this._ctx = ctx;
      this._master = master;
      return true;
    } catch {
      this._unsupported = true;
      try {
        ctx.close?.();
      } catch {
        /* ignore */
      }
      return false;
    }
  }

  _masterLevel() {
    return clamp(this._volume * MAX_MASTER, 0, MAX_MASTER);
  }

  _setMasterGain(level) {
    if (!this._master || !this._ctx) return;
    const g = this._master.gain;
    const t = this._ctx.currentTime || 0;
    try {
      g.cancelScheduledValues?.(t);
      g.setValueAtTime(clamp(level, 0, MAX_MASTER), t);
    } catch {
      /* ignore */
    }
    try {
      g.value = clamp(level, 0, MAX_MASTER);
    } catch {
      /* ignore */
    }
  }

  _suspend() {
    try {
      if (this._ctx && this._ctx.state === 'running' && this._ctx.suspend) {
        const r = this._ctx.suspend();
        if (r && typeof r.catch === 'function') r.catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }

  _primeOutput() {
    primeOutput(this._ctx, this._master);
  }

  _throttled(key, ms) {
    const now = this._now();
    const last = this._lastPlayed.get(key);
    if (last !== undefined && now - last < ms) return true;
    this._lastPlayed.set(key, now);
    return false;
  }

  _jitter(cents = 30) {
    // Small random detune so repeated sounds feel alive.
    return Math.pow(2, ((this._random() * 2 - 1) * cents) / 1200);
  }

  _play(event) {
    const type = event.type;
    if (!(type in THROTTLE_MS) || type === 'propAny') return false;
    if (type === 'prop') {
      const kind = normaliseKind(event.kind);
      const now = this._now();
      const lastAny = this._lastPlayed.get('propAny');
      if (lastAny !== undefined && now - lastAny < THROTTLE_MS.propAny) return false;
      if (this._throttled(`prop:${kind}`, THROTTLE_MS.prop)) return false;
      this._lastPlayed.set('propAny', now);
      propCue(this._cueHost, kind, (this._ctx.currentTime || 0) + 0.01);
      return true;
    }
    if (this._throttled(type, THROTTLE_MS[type])) return false;
    const t0 = (this._ctx.currentTime || 0) + 0.01;
    return playEventCue(this._cueHost, type, t0, event);
  }

  // ----------------------------------------------------- voice delegation

  /** Current routing target for new voices (see audio-voices.js). */
  _voiceHost() {
    return {
      ctx: this._ctx,
      master: this._master,
      voices: this._voices,
      enabled: !this._muted && !this._destroyed,
    };
  }

  /** Schedule one enveloped oscillator voice. @returns {boolean} */
  _tone(options) {
    return scheduleTone(this._voiceHost(), options);
  }

  _stopAllVoices() {
    stopAllVoices(this._ctx, this._voices);
  }
}
