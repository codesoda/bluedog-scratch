/**
 * Pure, deterministic "is a hand steady enough to start?" state machine for the
 * webcam onboarding screen. No browser globals; time is passed in via dtMs.
 *
 * Pointers: {id, x, y, active, sampleId} with normalized (0..1-ish) x/y.
 * Callers are expected to have already dropped stale tracking samples; this
 * class only filters for basic shape validity.
 *
 * Lifecycle: waiting -> steady -> countdown -> ready.
 * - waiting: no hand tracked yet, or the tracked hand was just (re)acquired.
 * - steady: a single hand is held still, accumulating toward `steadyMs`.
 * - countdown: steady threshold reached; counts down 3, 2, 1 over `countdownMs`.
 * - ready: countdown completed. Sticky until reset() or a disqualifying event.
 *
 * Disqualifying events (reset stability + countdown, from any phase):
 * - no hand present
 * - the tracked id disappears and a different id takes over ("replacement")
 * - a fresh sample implies speed above `maxSpeed` ("excessive movement")
 *
 * `hint` turns on when a hand is lost after having been seen, or on excessive
 * movement; it clears once a full, uninterrupted `steadyMs` has been held.
 *
 * Duplicate `sampleId`s (repeated frames of the same underlying camera sample)
 * still advance the steady/countdown clocks (real time keeps passing), but
 * never contribute to the velocity check: elapsed time since the last *unique*
 * sample is tracked separately so a short per-tick dt can never manufacture a
 * false speed spike.
 */

function isUsablePointer(p) {
  return Boolean(p) && p.active !== false && Number.isFinite(p.x) && Number.isFinite(p.y) && p.id !== undefined && p.id !== null;
}

export class HandReadiness {
  constructor({ steadyMs = 1000, countdownMs = 3000, maxSpeed = 1.2 } = {}) {
    this.steadyMs = steadyMs;
    this.countdownMs = countdownMs;
    this.maxSpeed = maxSpeed;
    this.reset();
  }

  reset() {
    this.phase = 'waiting';
    this.countdown = null;
    this.hint = false;
    this.ownerId = null;
    this.x = null;
    this.y = null;
    this.lastSampleId = undefined;
    this.sampleElapsedMs = 0;
    this.steadyElapsedMs = 0;
    this.countdownElapsedMs = 0;
  }

  snapshot() {
    return { phase: this.phase, countdown: this.countdown, hint: this.hint };
  }

  _clearOwner() {
    this.ownerId = null;
    this.x = null;
    this.y = null;
    this.lastSampleId = undefined;
    this.sampleElapsedMs = 0;
  }

  _disqualify(hintNow) {
    this.phase = 'waiting';
    this.countdown = null;
    this.steadyElapsedMs = 0;
    this.countdownElapsedMs = 0;
    if (hintNow) this.hint = true;
  }

  /** Advance the steady/countdown clocks by `dt` ms for the current owner. */
  _advance(dt) {
    if (this.phase === 'ready') return;
    if (this.phase === 'countdown') {
      this.countdownElapsedMs += dt;
      if (this.countdownElapsedMs >= this.countdownMs) {
        this.phase = 'ready';
        this.countdown = null;
        return;
      }
      const step = this.countdownMs / 3;
      const n = 3 - Math.floor(this.countdownElapsedMs / step);
      this.countdown = Math.min(3, Math.max(1, n));
      return;
    }
    this.steadyElapsedMs += dt;
    if (this.steadyElapsedMs >= this.steadyMs) {
      this.phase = 'countdown';
      this.hint = false;
      this.countdownElapsedMs = 0;
      this.countdown = 3;
    } else {
      this.phase = 'steady';
    }
  }

  /**
   * @param {number} dtMs milliseconds elapsed since the previous update (clamped 0..100).
   * @param {Array} pointers current pointer list.
   * @returns {{phase:string, countdown:(null|1|2|3), hint:boolean}}
   */
  update(dtMs, pointers) {
    const dt = Number.isFinite(dtMs) && dtMs >= 0 ? Math.min(dtMs, 100) : 0;
    const list = Array.isArray(pointers) ? pointers.filter(isUsablePointer) : [];

    if (list.length === 0) {
      if (this.ownerId !== null) this.hint = true;
      this._clearOwner();
      this.phase = 'waiting';
      this.countdown = null;
      this.steadyElapsedMs = 0;
      this.countdownElapsedMs = 0;
      return this.snapshot();
    }

    let owner = list.find((p) => p.id === this.ownerId);
    if (!owner) {
      const replaced = this.ownerId !== null;
      owner = list[0];
      this.ownerId = owner.id;
      this.x = owner.x;
      this.y = owner.y;
      this.lastSampleId = owner.sampleId;
      this.sampleElapsedMs = 0;
      this._disqualify(replaced);
      return this.snapshot();
    }

    const fresh = Number.isFinite(owner.sampleId)
      ? owner.sampleId !== this.lastSampleId
      : (this.x !== owner.x || this.y !== owner.y);

    if (!fresh) {
      this.sampleElapsedMs += dt;
      this._advance(dt);
      return this.snapshot();
    }

    const elapsedForSpeed = this.sampleElapsedMs + dt;
    const dist = Math.hypot(owner.x - this.x, owner.y - this.y);
    const speed = elapsedForSpeed > 0 ? dist / (elapsedForSpeed / 1000) : 0;
    const excessive = elapsedForSpeed > 0 && speed > this.maxSpeed;

    this.x = owner.x;
    this.y = owner.y;
    this.lastSampleId = owner.sampleId;
    this.sampleElapsedMs = 0;

    if (excessive) {
      this._disqualify(true);
      return this.snapshot();
    }
    if (elapsedForSpeed === 0) return this.snapshot();

    this._advance(dt);
    return this.snapshot();
  }
}
