// Synthesized sound cues for game events.
//
// A "cue host" exposes three explicit callbacks supplied by the AudioManager:
//   { tone(opts) -> boolean, jitter(cents) -> number, random() -> number }
// Cues only describe notes; scheduling, limits and cleanup live elsewhere.

import { NOTE, PENTATONIC, clamp, propFamily } from './audio-constants.js';

/** Gentle "here we go" arpeggio when a scene begins. */
export function sceneCue(host, t) {
  const notes = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6];
  notes.forEach((f, i) => {
    host.tone({ freq: f, start: t + i * 0.09, dur: 0.42, type: 'triangle', gain: 0.08 });
  });
  host.tone({ freq: NOTE.C4, start: t, dur: 0.6, type: 'sine', gain: 0.06 });
}

/** Happy "boing-yip" when Blue Dog is found. */
export function foundCue(host, t) {
  const j = host.jitter(40);
  host.tone({ freq: 440 * j, glideTo: 880 * j, glideTime: 0.12, start: t, dur: 0.2, type: 'triangle', gain: 0.14 });
  host.tone({ freq: 660 * j, glideTo: 990 * j, glideTime: 0.08, start: t + 0.13, dur: 0.18, type: 'sine', gain: 0.12 });
  host.tone({ freq: NOTE.E6, start: t + 0.12, dur: 0.3, type: 'sine', gain: 0.04 });
}

/** Scratch completion: a contented wiggle then a giggle and sparkle. */
export function scratchCue(host, t) {
  const j = host.jitter(50);
  // Contented "rrr-wiggle": warm vibrato hum that bends upward.
  host.tone({
    freq: 330 * j, glideTo: 520 * j, start: t, dur: 0.32, type: 'triangle', gain: 0.1,
    vibratoHz: 14, vibratoDepth: 22, lowpass: 2200,
  });
  giggle(host, t + 0.2, 0.9, j);
  // Sparkle on top.
  [NOTE.G6, NOTE.E6, NOTE.A6].forEach((f, i) => {
    host.tone({ freq: f, start: t + 0.55 + i * 0.06, dur: 0.22, type: 'sine', gain: 0.035 });
  });
}

/** Giggle-like series of short bouncy vowel-ish chirps (never negative). */
export function giggle(host, t, level = 1, pitch = 1) {
  const base = [700, 820, 740, 860, 760].map((f) => f * pitch);
  base.forEach((f, i) => {
    const st = t + i * 0.085;
    host.tone({
      freq: f, glideTo: f * 1.18, glideTime: 0.05, start: st, dur: 0.075,
      type: 'triangle', gain: 0.11 * level, vibratoHz: 30, vibratoDepth: 18, lowpass: 2600,
    });
  });
}

/** Distinctive orange-dog surprise: slide whistle up plus a bright bell. */
export function bonusAppearCue(host, t) {
  host.tone({
    freq: NOTE.C5, glideTo: NOTE.C6 * 1.5, glideTime: 0.28, start: t, dur: 0.32,
    type: 'sine', gain: 0.13, vibratoHz: 7, vibratoDepth: 12,
  });
  host.tone({ freq: NOTE.G6, start: t + 0.3, dur: 0.5, type: 'sine', gain: 0.07 });
  host.tone({ freq: NOTE.G6 * 2.01, start: t + 0.3, dur: 0.25, type: 'sine', gain: 0.02 });
  host.tone({ freq: NOTE.D6, start: t + 0.38, dur: 0.4, type: 'triangle', gain: 0.05 });
}

/** Bonus success: fast rising pentatonic sparkle cascade. */
export function bonusHitCue(host, t) {
  PENTATONIC.forEach((f, i) => {
    host.tone({ freq: f, start: t + i * 0.045, dur: 0.28, type: i % 2 ? 'sine' : 'triangle', gain: 0.075 });
  });
  host.tone({ freq: NOTE.C6 * 2, start: t + 0.38, dur: 0.6, type: 'sine', gain: 0.045 });
  host.tone({ freq: NOTE.G5, start: t + 0.38, dur: 0.6, type: 'triangle', gain: 0.05 });
  giggle(host, t + 0.15, 0.6, 1.3);
}

/** Short (≈2.6s) quiet celebration melody with a soft bass. */
export function celebrationCue(host, t) {
  const beat = 0.16;
  const melody = [
    [NOTE.C5, 1], [NOTE.E5, 1], [NOTE.G5, 1], [NOTE.C6, 2],
    [NOTE.A5, 1], [NOTE.C6, 1], [NOTE.G5, 2],
    [NOTE.F5, 1], [NOTE.A5, 1], [NOTE.G5, 1], [NOTE.E5, 1], [NOTE.D5, 1], [NOTE.E5, 1],
    [NOTE.C5, 3],
  ];
  let at = t;
  for (const [f, len] of melody) {
    host.tone({ freq: f, start: at, dur: Math.max(0.12, len * beat * 0.95), type: 'triangle', gain: 0.075 });
    at += len * beat;
  }
  const bass = [[NOTE.C3, 0], [NOTE.F3, 5], [NOTE.G3, 9], [NOTE.C3, 15]];
  for (const [f, b] of bass) {
    host.tone({ freq: f * 2, start: t + b * beat, dur: 0.55, type: 'sine', gain: 0.06 });
  }
  // Final soft bell.
  host.tone({ freq: NOTE.C6, start: at - 3 * beat, dur: 0.8, type: 'sine', gain: 0.04 });
}

/** Tiny "peep" hint from the hidden dog; slightly brighter at higher levels. */
export function hintCue(host, t, event) {
  const level = clamp(event.progress ?? event.level ?? 1, 0, 4);
  const f = 880 + level * 40;
  host.tone({ freq: f, glideTo: f * 1.25, glideTime: 0.07, start: t, dur: 0.11, type: 'sine', gain: 0.05 });
  host.tone({ freq: f * 1.12, glideTo: f * 1.4, glideTime: 0.07, start: t + 0.13, dur: 0.11, type: 'sine', gain: 0.045 });
}

/**
 * Play the cue for a (non-prop) event type at time t.
 * @returns {boolean} false for unknown types
 */
export function playEventCue(host, type, t, event) {
  switch (type) {
    case 'scene': sceneCue(host, t); break;
    case 'found': foundCue(host, t); break;
    case 'scratch': scratchCue(host, t); break;
    case 'bonusAppeared': bonusAppearCue(host, t); break;
    case 'bonusHit': bonusHitCue(host, t); break;
    case 'bonusMiss': giggle(host, t, 0.75, 1.15); break;
    case 'celebration': celebrationCue(host, t); break;
    case 'hint': hintCue(host, t, event); break;
    default: return false;
  }
  return true;
}

// ------------------------------------------------------------ prop families

function pickFrom(host, arr) {
  return arr[Math.floor(host.random() * arr.length) % arr.length];
}

function chimeProp(host, t, j) {
  for (let i = 0; i < 3; i++) {
    const f = pickFrom(host, PENTATONIC.slice(3)) * j;
    host.tone({ freq: f, start: t + i * 0.11, dur: 0.9, type: 'sine', gain: 0.04 });
    host.tone({ freq: f * 2.76, start: t + i * 0.11, dur: 0.3, type: 'sine', gain: 0.01 });
  }
}

function xylophoneProp(host, t) {
  const start = Math.floor(host.random() * 4);
  for (let i = 0; i < 3; i++) {
    const f = PENTATONIC[(start + i) % PENTATONIC.length];
    host.tone({ freq: f, start: t + i * 0.09, dur: 0.25, type: 'triangle', gain: 0.07 });
    host.tone({ freq: f * 4, start: t + i * 0.09, dur: 0.05, type: 'sine', gain: 0.015 });
  }
}

function bounceProp(host, t, j) {
  host.tone({ freq: 180 * j, glideTo: 360 * j, glideTime: 0.1, start: t, dur: 0.16, type: 'sine', gain: 0.1 });
  host.tone({ freq: 220 * j, glideTo: 420 * j, glideTime: 0.08, start: t + 0.18, dur: 0.12, type: 'sine', gain: 0.06 });
}

function waterProp(host, t, j) {
  for (let i = 0; i < 3; i++) {
    const f = (900 + host.random() * 500) * j;
    host.tone({ freq: f, glideTo: f * 0.55, glideTime: 0.06, start: t + i * 0.05, dur: 0.08, type: 'sine', gain: 0.05 });
  }
}

function rustleProp(host, t, j) {
  // Soft filtered low warble (no noise buffers).
  host.tone({ freq: 240 * j, glideTo: 300 * j, start: t, dur: 0.25, type: 'triangle', gain: 0.05, vibratoHz: 22, vibratoDepth: 30, lowpass: 900 });
}

function clickProp(host, t, j) {
  host.tone({ freq: 1500, start: t, dur: 0.035, type: 'square', gain: 0.03, lowpass: 3000 });
  host.tone({ freq: NOTE.E5 * j, start: t + 0.04, dur: 0.35, type: 'sine', gain: 0.05 });
}

function toyProp(host, t, j) {
  for (let i = 0; i < 4; i++) {
    const f = (i % 2 ? 620 : 520) * j;
    host.tone({ freq: f, start: t + i * 0.07, dur: 0.06, type: 'square', gain: 0.025, lowpass: 1800 });
  }
}

function squeakProp(host, t, j) {
  host.tone({ freq: 900 * j, glideTo: 1400 * j, start: t, dur: 0.14, type: 'triangle', gain: 0.06, lowpass: 2600 });
}

function defaultProp(host, t, j) {
  const f = pickFrom(host, [NOTE.E5, NOTE.G5, NOTE.A5, NOTE.C6]) * j;
  host.tone({ freq: f, start: t, dur: 0.4, type: 'sine', gain: 0.06 });
  host.tone({ freq: f * 2, start: t, dur: 0.12, type: 'sine', gain: 0.015 });
}

/** Quiet environmental prop notes chosen by prop kind, starting at time t. */
export function propCue(host, kind, t) {
  const j = host.jitter(25);
  switch (propFamily(kind)) {
    case 'chime': chimeProp(host, t, j); break;
    case 'xylophone': xylophoneProp(host, t); break;
    case 'bounce': bounceProp(host, t, j); break;
    case 'water': waterProp(host, t, j); break;
    case 'rustle': rustleProp(host, t, j); break;
    case 'click': clickProp(host, t, j); break;
    case 'toy': toyProp(host, t, j); break;
    case 'squeak': squeakProp(host, t, j); break;
    default: defaultProp(host, t, j);
  }
}
