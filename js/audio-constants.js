// Shared limits, note tables, priorities and prop sound families for audio.

export const MAX_MASTER = 0.45; // absolute ceiling for the master gain
export const DEFAULT_VOLUME = 0.6; // 0..1 user-level volume, mapped onto MAX_MASTER
export const MAX_VOICES = 32; // simultaneous oscillators
export const MAX_SOUNDS_PER_BATCH = 4; // sounds started per handleEvents call
export const MAX_PEAK = 0.32; // per-oscillator peak gain before master
export const MIN_GAIN = 0.0001;

// Minimum gap (ms) between two sounds of the same throttle key.
export const THROTTLE_MS = {
  scene: 900,
  found: 250,
  scratch: 220,
  bonusAppeared: 600,
  bonusHit: 300,
  bonusMiss: 600,
  prop: 160, // per prop kind (key includes kind)
  propAny: 70, // across all props
  celebration: 3000,
  hint: 1400,
};

// Pleasant pitches (Hz).
export const NOTE = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77,
  C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, A6: 1760.0,
  C3: 130.81, F3: 174.61, G3: 196.0, A3: 220.0,
};
export const PENTATONIC = [NOTE.C5, NOTE.D5, NOTE.E5, NOTE.G5, NOTE.A5, NOTE.C6, NOTE.D6, NOTE.E6];

// Higher plays first when a frame produces more events than the batch cap.
export const PRIORITY = {
  celebration: 9,
  bonusHit: 8,
  bonusAppeared: 7,
  scratch: 6,
  found: 5,
  bonusMiss: 4,
  scene: 3,
  prop: 2,
  hint: 1,
};

export function clamp(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

export function setParam(param, value) {
  if (!param) return;
  try {
    param.value = value;
  } catch {
    /* ignore */
  }
}

export function normaliseKind(kind) {
  return typeof kind === 'string' ? kind.toLowerCase().replace(/[^a-z0-9]/g, '') : 'default';
}

/** Map arbitrary scene prop kind names onto a small set of sound families. */
export function propFamily(kind) {
  const k = normaliseKind(kind);
  if (/chime|bell|mobile/.test(k)) return 'chime';
  if (/xylo|piano|music|glock/.test(k)) return 'xylophone';
  if (/ball|trampoline|bounce|balloon|swing/.test(k)) return 'bounce';
  if (/sprinkler|puddle|pool|water|fish|splash|bubble/.test(k)) return 'water';
  if (/bush|leaf|leaves|plant|curtain|blanket|tree|grass|cushion/.test(k)) return 'rustle';
  if (/lamp|light|switch|tv|remote|clock/.test(k)) return 'click';
  if (/windup|robot|toy|car|train|drum/.test(k)) return 'toy';
  if (/duck|squeak|teddy|plush|bird|slide/.test(k)) return 'squeak';
  return 'default';
}

export const AUDIO_LIMITS = Object.freeze({
  MAX_MASTER,
  MAX_VOICES,
  MAX_SOUNDS_PER_BATCH,
  MAX_PEAK,
  THROTTLE_MS: Object.freeze({ ...THROTTLE_MS }),
});
