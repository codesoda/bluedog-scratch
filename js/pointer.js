// Pure pointer helpers for webcam hand tracking. No browser globals.
//
// Coordinates are normalized [0,1] in mirrored game space: when the player
// moves their real hand to their left, the pointer moves left on screen, as if
// looking into a mirror. MediaPipe reports un-mirrored camera coordinates, so
// x is flipped exactly once here.

export const INDEX_FINGER_TIP = 8;
export const MAX_POINTERS = 2;

export const DEFAULT_POINTER_OPTIONS = Object.freeze({
  /** PRD smoothing factor (weight of previous value) at the reference interval. */
  smoothing: 0.6,
  /** Interval (ms) at which `smoothing` applies; other intervals are scaled. */
  referenceMs: 1000 / 30,
  /** Fast movements (normalized units/sample) reduce smoothing to limit lag. */
  fastDistance: 0.06,
  /** Smoothing used at or above fastDistance. */
  fastSmoothing: 0.25,
  /** Max distance (normalized) to match a detection to an existing pointer. */
  matchDistance: 0.3,
  /** Keep identity of a briefly lost hand for this long (not emitted while lost). */
  identityGraceMs: 400,
  /** If the gap between samples exceeds this, smoothing is reset (no glide). */
  resetGapMs: 250,
  /** Max number of pointers. */
  maxPointers: MAX_POINTERS,
});

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);

/** Mirror a raw MediaPipe normalized landmark into game space. Returns null when invalid. */
export function mirrorLandmark(landmark) {
  if (!landmark || !finite(landmark.x) || !finite(landmark.y)) return null;
  return { x: clamp01(1 - landmark.x), y: clamp01(landmark.y) };
}

/** Mirror a full landmark list (debug drawing), preserving z when present. */
export function mirrorLandmarks(landmarks) {
  if (!Array.isArray(landmarks)) return [];
  return landmarks.map((lm) => ({
    x: finite(lm?.x) ? 1 - lm.x : 0,
    y: finite(lm?.y) ? lm.y : 0,
    z: finite(lm?.z) ? lm.z : 0,
  }));
}

/**
 * Convert a HandLandmarker-like result into hands with mirrored landmark 8 tips.
 * Accepts `{landmarks, handedness}` (or deprecated `handednesses`).
 * @returns {{label: string, score: number, tip: {x:number,y:number}, landmarks: Array}[]}
 */
export function extractHands(result) {
  const all = Array.isArray(result?.landmarks) ? result.landmarks : [];
  const handedness = result?.handedness || result?.handednesses || [];
  const hands = [];
  for (let i = 0; i < all.length; i += 1) {
    const landmarks = all[i];
    if (!Array.isArray(landmarks)) continue;
    const tip = mirrorLandmark(landmarks[INDEX_FINGER_TIP]);
    if (!tip) continue;
    const category = Array.isArray(handedness[i]) ? handedness[i][0] : handedness[i];
    hands.push({
      label: typeof category?.categoryName === 'string' ? category.categoryName : '',
      score: finite(category?.score) ? category.score : 0,
      tip,
      landmarks,
    });
  }
  return hands;
}

/**
 * Elapsed-time-aware exponential smoothing.
 * `smoothed = previous * s + current * (1 - s)` where s is scaled for dtMs, and
 * reduced for fast movement so the pointer never feels laggy.
 */
export function smoothPoint(previous, current, dtMs, options = DEFAULT_POINTER_OPTIONS) {
  if (!previous) return { x: current.x, y: current.y };
  const o = { ...DEFAULT_POINTER_OPTIONS, ...options };
  const dt = finite(dtMs) && dtMs > 0 ? dtMs : o.referenceMs;
  if (dt >= o.resetGapMs) return { x: current.x, y: current.y };
  const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
  const speed = Math.min(1, distance / o.fastDistance);
  const base = o.smoothing + (o.fastSmoothing - o.smoothing) * speed;
  const s = Math.pow(Math.min(Math.max(base, 0), 0.99), dt / o.referenceMs);
  return {
    x: clamp01(previous.x * s + current.x * (1 - s)),
    y: clamp01(previous.y * s + current.y * (1 - s)),
  };
}

/**
 * Stateful pointer identity + smoothing. Pure (time is passed in).
 * `update(hands, timeMs)` is called once per tracking result and returns the
 * active pointers, oldest (most stable) hand first.
 */
export class PointerTracker {
  constructor(options = {}) {
    this.options = { ...DEFAULT_POINTER_OPTIONS, ...options };
    this.tracks = [];
    this.sampleId = 0;
    this.nextId = 1;
  }

  /** Forget all hands (loss, pause, restart). Next detection starts fresh, unsmoothed. */
  reset() {
    this.tracks = [];
  }

  /** Record a sample with no detections (e.g. stale data). Returns []. */
  clear(timeMs) {
    return this.update([], timeMs);
  }

  update(hands, timeMs) {
    const o = this.options;
    this.sampleId += 1;
    const now = finite(timeMs) ? timeMs : 0;
    const detections = (Array.isArray(hands) ? hands : []).filter((h) => h && h.tip).slice(0, o.maxPointers);

    // Drop tracks whose identity grace has expired.
    this.tracks = this.tracks.filter((t) => now - t.lastSeen <= o.identityGraceMs);

    // Greedy global nearest matching; a handedness agreement acts as a small bonus,
    // so swapped output ordering never swaps (teleports) pointer identities.
    const pairs = [];
    for (let ti = 0; ti < this.tracks.length; ti += 1) {
      const track = this.tracks[ti];
      for (let di = 0; di < detections.length; di += 1) {
        const d = detections[di];
        let cost = Math.hypot(d.tip.x - track.rawX, d.tip.y - track.rawY);
        if (cost > o.matchDistance) continue;
        if (track.label && d.label && track.label !== d.label) cost += 0.05;
        pairs.push({ ti, di, cost });
      }
    }
    pairs.sort((a, b) => a.cost - b.cost || a.ti - b.ti || a.di - b.di);
    const trackUsed = new Set();
    const detectionTrack = new Map();
    for (const p of pairs) {
      if (trackUsed.has(p.ti) || detectionTrack.has(p.di)) continue;
      trackUsed.add(p.ti);
      detectionTrack.set(p.di, this.tracks[p.ti]);
    }

    const matched = new Set(detectionTrack.values());
    const seen = new Set();
    for (let di = 0; di < detections.length; di += 1) {
      const d = detections[di];
      let track = detectionTrack.get(di);
      if (track) {
        // Reacquired after a loss: jump to the new position (no glide, no stale motion).
        const next = track.missed ? d.tip : smoothPoint({ x: track.x, y: track.y }, d.tip, now - track.lastSeen, o);
        track.x = next.x;
        track.y = next.y;
      } else {
        if (this.tracks.length >= o.maxPointers) {
          // Evict the longest-lost unmatched track to make room.
          const lost = this.tracks.filter((t) => !matched.has(t)).sort((a, b) => a.lastSeen - b.lastSeen);
          if (!lost.length) continue;
          this.tracks.splice(this.tracks.indexOf(lost[0]), 1);
        }
        track = { id: `hand-${this.nextId}`, x: d.tip.x, y: d.tip.y, order: this.nextId, label: '' };
        this.nextId += 1;
        this.tracks.push(track);
        matched.add(track);
      }
      track.rawX = d.tip.x;
      track.rawY = d.tip.y;
      track.label = d.label || track.label;
      track.lastSeen = now;
      track.missed = false;
      seen.add(track);
    }
    for (const track of this.tracks) if (!seen.has(track)) track.missed = true;

    return this.tracks
      .filter((t) => seen.has(t))
      .sort((a, b) => a.order - b.order)
      .map((t) => ({ id: t.id, x: t.x, y: t.y, active: true, sampleId: this.sampleId }));
  }
}
