/**
 * Pure interaction primitives: hit tests, scratch movement gate, dwell.
 * Pointers: {id, x, y, active, sampleId} with normalized x/y.
 */

export const STAGE = Object.freeze({ width: 1600, height: 900 });

/** rect: {x, y, w, h} with x/y as CENTER and w/h as full size (normalized). */
export function rectContains(rect, x, y) {
  if (!rect) return false;
  const EPS = 1e-9;
  return Math.abs(x - rect.x) <= rect.w / 2 + EPS && Math.abs(y - rect.y) <= rect.h / 2 + EPS;
}

export function scaleRect(rect, factor) {
  return { x: rect.x, y: rect.y, w: rect.w * factor, h: rect.h * factor };
}

/** Distance between two normalized points, measured in virtual stage pixels. */
export function virtualDistance(a, b) {
  const dx = (a.x - b.x) * STAGE.width;
  const dy = (a.y - b.y) * STAGE.height;
  return Math.hypot(dx, dy);
}

export function isUsablePointer(p) {
  return Boolean(p) && p.active !== false && Number.isFinite(p.x) && Number.isFinite(p.y);
}

/**
 * Scratch tracker with a displacement gate.
 *
 * - A single "owner" pointer inside the rect may scratch; other pointers
 *   cannot add duplicate progress. Owner changes reset the baseline.
 * - Movement only counts once the pointer is displaced at least `gatePx`
 *   from its anchor, so low-amplitude jitter never accumulates.
 * - If the gate is only reached after `anchorWindowMs` (slow drift), the
 *   anchor is re-based without credit.
 * - Displacements above `maxJumpPx` (tracking teleports/reacquisition) are
 *   rejected and re-based. Each accepted step is capped at `maxStepPx`.
 * - Each tracking sample is counted at most once (sampleId dedupe).
 */
export class ScratchGesture {
  constructor({ gatePx = 18, maxJumpPx = 180, maxStepPx = 110, anchorWindowMs = 450 } = {}) {
    this.gatePx = gatePx;
    this.maxJumpPx = maxJumpPx;
    this.maxStepPx = maxStepPx;
    this.anchorWindowMs = anchorWindowMs;
    this.reset();
  }

  reset() {
    this.ownerId = null;
    this.anchor = null;
    this.anchorTime = 0;
    this.lastSampleId = undefined;
    this.lastPos = null;
  }

  _isNewSample(p) {
    if (Number.isFinite(p.sampleId)) return p.sampleId !== this.lastSampleId;
    return !this.lastPos || this.lastPos.x !== p.x || this.lastPos.y !== p.y;
  }

  _rebase(p, nowMs) {
    this.anchor = { x: p.x, y: p.y };
    this.anchorTime = nowMs;
    this.lastSampleId = p.sampleId;
    this.lastPos = { x: p.x, y: p.y };
  }

  /**
   * @param {Array} pointers
   * @param {{x,y,w,h}} rect scratch region
   * @param {number} [nowMs] active-clock timestamp, enables drift rejection
   * @returns {{accepted:number, ownerId:string|null, inside:boolean}}
   */
  update(pointers, rect, nowMs) {
    const inside = (pointers || []).filter((p) => isUsablePointer(p) && rectContains(rect, p.x, p.y));
    let owner = inside.find((p) => p.id === this.ownerId);
    if (!owner) {
      this.reset();
      owner = inside[0];
      if (!owner) return { accepted: 0, ownerId: null, inside: false };
      this.ownerId = owner.id;
    }
    const timed = Number.isFinite(nowMs);
    if (!this.anchor) {
      this._rebase(owner, timed ? nowMs : 0);
      return { accepted: 0, ownerId: this.ownerId, inside: true };
    }
    if (!this._isNewSample(owner)) return { accepted: 0, ownerId: this.ownerId, inside: true };
    this.lastSampleId = owner.sampleId;
    this.lastPos = { x: owner.x, y: owner.y };

    const d = virtualDistance(this.anchor, owner);
    if (d > this.maxJumpPx) {
      this._rebase(owner, timed ? nowMs : 0);
      return { accepted: 0, ownerId: this.ownerId, inside: true };
    }
    if (d < this.gatePx) {
      if (timed && nowMs - this.anchorTime > this.anchorWindowMs) {
        // Slow drift: re-anchor so creeping noise never pays out.
        this._rebase(owner, nowMs);
      }
      return { accepted: 0, ownerId: this.ownerId, inside: true };
    }
    const slow = timed && nowMs - this.anchorTime > this.anchorWindowMs;
    this._rebase(owner, timed ? nowMs : 0);
    if (slow) return { accepted: 0, ownerId: this.ownerId, inside: true };
    return { accepted: Math.min(d, this.maxStepPx), ownerId: this.ownerId, inside: true };
  }
}

/** Dwell timer for optional dwell-only UI. Leaving resets progress. */
export class DwellTracker {
  constructor({ dwellMs = 800 } = {}) {
    this.dwellMs = dwellMs;
    this.elapsedMs = 0;
    this.done = false;
  }

  reset() {
    this.elapsedMs = 0;
    this.done = false;
  }

  /** @returns {{progress:number, activated:boolean}} activated is true once. */
  update(dtMs, inside) {
    if (!inside) {
      this.reset();
      return { progress: 0, activated: false };
    }
    if (this.done) return { progress: 1, activated: false };
    this.elapsedMs += Math.max(0, dtMs || 0);
    if (this.elapsedMs >= this.dwellMs) {
      this.done = true;
      return { progress: 1, activated: true };
    }
    return { progress: this.elapsedMs / this.dwellMs, activated: false };
  }
}
