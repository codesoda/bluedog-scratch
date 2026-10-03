import test from 'node:test';
import assert from 'node:assert/strict';
import * as audio from '../../js/audio.js';
import * as constants from '../../js/audio-constants.js';
import { playEventCue, propCue } from '../../js/audio-cues.js';
import { scheduleTone, stopAllVoices } from '../../js/audio-voices.js';

test('audio.js re-exports the shared constants module bindings', () => {
  assert.equal(typeof audio.AudioManager, 'function');
  assert.equal(audio.AUDIO_LIMITS, constants.AUDIO_LIMITS);
  assert.equal(audio.propFamily, constants.propFamily);
  assert.ok(Object.isFrozen(audio.AUDIO_LIMITS));
  assert.ok(Object.isFrozen(audio.AUDIO_LIMITS.THROTTLE_MS));
});

function recordingHost() {
  const tones = [];
  return { tones, tone: (o) => { tones.push(o); return true; }, jitter: () => 1, random: () => 0.5 };
}

test('event cues return false for unknown types and schedule notes otherwise', () => {
  const host = recordingHost();
  assert.equal(playEventCue(host, 'nope', 0, {}), false);
  assert.equal(host.tones.length, 0);
  for (const type of ['scene', 'found', 'scratch', 'bonusAppeared', 'bonusHit', 'bonusMiss', 'celebration', 'hint']) {
    const h = recordingHost();
    assert.equal(playEventCue(h, type, 1, { progress: 1 }), true);
    assert.ok(h.tones.length > 0, `${type} schedules tones`);
    for (const t of h.tones) assert.ok(t.start >= 1, `${type} tones start at or after t`);
  }
});

test('every prop family schedules at least one tone', () => {
  for (const kind of ['chime', 'xylo', 'ball', 'puddle', 'bush', 'lamp', 'robot', 'duck', 'mystery']) {
    const host = recordingHost();
    propCue(host, kind, 2);
    assert.ok(host.tones.length > 0, `${kind} schedules tones`);
  }
});

function fakeCtx() {
  const param = () => ({
    value: 0,
    setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {},
  });
  const node = () => ({
    gain: param(), frequency: param(), pan: param(), disconnected: false,
    connect() {}, disconnect() { this.disconnected = true; },
    start() {}, stop() {},
  });
  return { currentTime: 0, createOscillator: node, createGain: node, createBiquadFilter: node, createStereoPanner: node };
}

test('scheduleTone respects enabled flag, rejects bad freq and cleans up', () => {
  const ctx = fakeCtx();
  const voices = new Set();
  const host = { ctx, master: {}, voices, enabled: false };
  assert.equal(scheduleTone(host, { freq: 440, start: 0 }), false);
  host.enabled = true;
  assert.equal(scheduleTone(host, { freq: NaN, start: 0 }), false);
  assert.equal(scheduleTone(host, { freq: 440, start: 0, lowpass: 900, pan: 0.2, vibratoHz: 5, vibratoDepth: 3 }), true);
  assert.equal(voices.size, 1);
  const [voice] = voices;
  voice.osc.onended();
  assert.equal(voices.size, 0);
  assert.ok(voice.nodes.every((n) => n.disconnected));
});

test('scheduleTone steals the oldest voice at the polyphony cap', () => {
  const ctx = fakeCtx();
  const voices = new Set();
  const host = { ctx, master: {}, voices, enabled: true };
  for (let i = 0; i < constants.MAX_VOICES + 5; i++) scheduleTone(host, { freq: 440, start: i });
  assert.equal(voices.size, constants.MAX_VOICES);
  assert.equal(Math.min(...Array.from(voices, (v) => v.startedAt)), 5);
  stopAllVoices(ctx, voices);
  assert.equal(voices.size, 0);
});
