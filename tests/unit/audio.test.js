import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioManager, AUDIO_LIMITS, propFamily } from '../../js/audio.js';

// ------------------------------------------------------------ fake Web Audio

class FakeParam {
  constructor(value = 0) {
    this.value = value;
    this.calls = [];
  }
  setValueAtTime(v, t) { this.calls.push(['set', v, t]); this.value = v; return this; }
  linearRampToValueAtTime(v, t) { this.calls.push(['lin', v, t]); return this; }
  exponentialRampToValueAtTime(v, t) {
    if (!(v > 0)) throw new RangeError('exponential ramp target must be positive');
    this.calls.push(['exp', v, t]);
    return this;
  }
  setTargetAtTime(v, t) { this.calls.push(['target', v, t]); return this; }
  cancelScheduledValues(t) { this.calls.push(['cancel', t]); return this; }
}

class FakeNode {
  constructor(ctx, kind) {
    this.ctx = ctx;
    this.kind = kind;
    this.outputs = [];
    this.disconnected = false;
    ctx.nodes.push(this);
  }
  connect(dest) { this.outputs.push(dest); return dest; }
  disconnect() { this.disconnected = true; this.outputs = []; }
}

class FakeOscillator extends FakeNode {
  constructor(ctx) {
    super(ctx, 'osc');
    this.type = 'sine';
    this.frequency = new FakeParam(440);
    this.detune = new FakeParam(0);
    this.startAt = null;
    this.stopAt = null;
    this.onended = null;
  }
  start(t = 0) {
    if (this.startAt !== null) throw new Error('start twice');
    this.startAt = t;
    this.ctx.started.push(this);
  }
  stop(t = 0) {
    if (this.startAt === null) throw new Error('stop before start');
    this.stopAt = t;
  }
}

class FakeContext {
  constructor({ state = 'suspended', resumeFails = false } = {}) {
    this.state = state;
    this.currentTime = 1;
    this.nodes = [];
    this.started = [];
    this.destination = { kind: 'destination' };
    this.resumeCalls = 0;
    this.suspendCalls = 0;
    this.closeCalls = 0;
    this.resumeFails = resumeFails;
  }
  createOscillator() { return new FakeOscillator(this); }
  createGain() { const n = new FakeNode(this, 'gain'); n.gain = new FakeParam(1); return n; }
  createBiquadFilter() {
    const n = new FakeNode(this, 'filter');
    n.frequency = new FakeParam(350); n.Q = new FakeParam(1); n.type = 'lowpass';
    return n;
  }
  createDynamicsCompressor() {
    const n = new FakeNode(this, 'comp');
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new FakeParam(0);
    return n;
  }
  createStereoPanner() { const n = new FakeNode(this, 'pan'); n.pan = new FakeParam(0); return n; }
  resume() {
    this.resumeCalls += 1;
    if (this.resumeFails) return Promise.reject(new Error('nope'));
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() { this.suspendCalls += 1; this.state = 'suspended'; return Promise.resolve(); }
  close() { this.closeCalls += 1; this.state = 'closed'; return Promise.resolve(); }
  /** Fire onended for every oscillator whose stop time has passed. */
  advance(seconds) {
    this.currentTime += seconds;
    for (const o of this.started) {
      if (o.stopAt !== null && o.stopAt <= this.currentTime && o.onended && !o.ended) {
        o.ended = true;
        o.onended();
      }
    }
  }
  audibleOscillators() {
    return this.started.filter((o) => !o.ended && o.outputs.length > 0);
  }
}

function setup(opts = {}) {
  const ctx = new FakeContext(opts.ctx);
  let clock = 0;
  const audio = new AudioManager({
    contextFactory: () => { audio.factoryCalls = (audio.factoryCalls || 0) + 1; return ctx; },
    now: () => clock,
    random: () => 0.5,
    ...opts.manager,
  });
  return { ctx, audio, tick: (ms) => { clock += ms; } };
}

const ALL_EVENTS = [
  { type: 'scene' },
  { type: 'found', x: 0.5, y: 0.5 },
  { type: 'scratch', progress: 1 },
  { type: 'bonusAppeared', x: 0.3, y: 0.6 },
  { type: 'bonusHit' },
  { type: 'bonusMiss' },
  { type: 'prop', kind: 'windchime' },
  { type: 'celebration' },
  { type: 'hint', progress: 2 },
];

// ------------------------------------------------------------------- tests

test('unlock creates context synchronously and resumes it', async () => {
  const { ctx, audio } = setup();
  const p = audio.unlock();
  assert.equal(audio.factoryCalls, 1, 'context created inside the gesture call stack');
  assert.equal(ctx.resumeCalls, 1, 'resume requested synchronously');
  assert.equal(await p, true);
  assert.equal(audio.ready, true);
  assert.equal(await audio.unlock(), true);
  assert.equal(audio.factoryCalls, 1, 'context reused');
});

test('unsupported browser is a harmless no-op', async () => {
  const audio = new AudioManager({ contextFactory: () => null });
  assert.equal(await audio.unlock(), false);
  audio.handleEvents(ALL_EVENTS);
  audio.setMuted(true);
  audio.setMuted(false);
  audio.destroy();
  assert.equal(audio.muted, false);

  const throwing = new AudioManager({ contextFactory: () => { throw new Error('no audio'); } });
  assert.equal(await throwing.unlock(), false);
  throwing.handleEvents(ALL_EVENTS);
  throwing.destroy();
});

test('default factory without AudioContext global does not throw', async () => {
  const audio = new AudioManager();
  assert.equal(await audio.unlock(), false);
  audio.handleEvents([{ type: 'found' }]);
  audio.destroy();
});

test('rejected resume resolves false and never throws', async () => {
  const { audio } = setup({ ctx: { resumeFails: true } });
  assert.equal(await audio.unlock(), false);
  audio.handleEvents(ALL_EVENTS);
});

test('every event type produces bounded sound', async () => {
  for (const ev of ALL_EVENTS) {
    const { ctx, audio } = setup();
    await audio.unlock();
    const before = ctx.started.length;
    audio.handleEvents([ev]);
    const voices = ctx.started.slice(before).filter((o) => o.outputs.length > 0 && o.stopAt - o.startAt > 0.02);
    assert.ok(voices.length > 0, `${ev.type} should schedule sound`);
    for (const o of ctx.started.slice(before)) {
      assert.ok(o.stopAt !== null, 'every oscillator is stopped (no endless loop)');
      assert.ok(o.stopAt - o.startAt <= 3.1, `${ev.type} voice must be short`);
    }
    for (const n of ctx.nodes) {
      if (n.kind === 'gain' && n.gain) {
        for (const c of n.gain.calls) {
          if (c[0] !== 'cancel') assert.ok(c[1] <= AUDIO_LIMITS.MAX_MASTER + 1e-9, 'gain bounded');
        }
      }
    }
    assert.ok(audio.activeVoices <= AUDIO_LIMITS.MAX_VOICES);
  }
});

test('master gain is clamped even for absurd volumes', async () => {
  const { ctx, audio } = setup({ manager: { volume: 50 } });
  await audio.unlock();
  const master = ctx.nodes.find((n) => n.kind === 'gain');
  assert.ok(master.gain.value <= AUDIO_LIMITS.MAX_MASTER);
  audio.setVolume(Infinity);
  assert.ok(master.gain.value <= AUDIO_LIMITS.MAX_MASTER);
  audio.setVolume(-3);
  assert.equal(master.gain.value, 0);
});

test('master routes through a compressor to destination', async () => {
  const { ctx, audio } = setup();
  await audio.unlock();
  const comp = ctx.nodes.find((n) => n.kind === 'comp');
  assert.ok(comp);
  assert.ok(comp.outputs.includes(ctx.destination));
});

test('bonus cue is distinct from found cue', async () => {
  const sig = async (type) => {
    const { ctx, audio } = setup();
    await audio.unlock();
    const before = ctx.started.length;
    audio.handleEvents([{ type }]);
    return ctx.started.slice(before).map((o) => `${o.type}:${Math.round(o.frequency.calls[0]?.[1] ?? 0)}`).join(',');
  };
  assert.notEqual(await sig('bonusAppeared'), await sig('found'));
  assert.notEqual(await sig('bonusHit'), await sig('scratch'));
});

test('repeated events are throttled', async () => {
  const { ctx, audio, tick } = setup();
  await audio.unlock();
  audio.handleEvents([{ type: 'hint' }]);
  const n1 = ctx.started.length;
  audio.handleEvents([{ type: 'hint' }]);
  assert.equal(ctx.started.length, n1, 'throttled');
  tick(AUDIO_LIMITS.THROTTLE_MS.hint + 1);
  audio.handleEvents([{ type: 'hint' }]);
  assert.ok(ctx.started.length > n1, 'plays again after throttle window');
});

test('prop throttle is per kind and kinds map to families', async () => {
  const { ctx, audio, tick } = setup();
  await audio.unlock();
  audio.handleEvents([{ type: 'prop', kind: 'ball' }]);
  const n1 = ctx.started.length;
  tick(100);
  audio.handleEvents([{ type: 'prop', kind: 'ball' }]);
  assert.equal(ctx.started.length, n1);
  audio.handleEvents([{ type: 'prop', kind: 'lamp' }]);
  assert.ok(ctx.started.length > n1);
  audio.handleEvents([{ type: 'prop' }]); // missing kind still fine (after propAny gap)
  assert.equal(propFamily('wind-chime'), 'chime');
  assert.equal(propFamily('Toy Xylophone'), 'xylophone');
  assert.equal(propFamily('puddle'), 'water');
  assert.equal(propFamily(undefined), 'default');
});

test('a flood of events is capped per batch and by polyphony', async () => {
  const { ctx, audio, tick } = setup();
  await audio.unlock();
  for (let i = 0; i < 50; i++) {
    audio.handleEvents([...ALL_EVENTS, ...ALL_EVENTS]);
    tick(5000);
    assert.ok(audio.activeVoices <= AUDIO_LIMITS.MAX_VOICES, 'polyphony cap respected');
  }
  assert.ok(ctx.started.length > 0);
});

test('batch prefers important events', async () => {
  const { ctx, audio } = setup();
  await audio.unlock();
  const many = Array.from({ length: 10 }, (_, i) => ({ type: 'prop', kind: `k${i}` }));
  audio.handleEvents([...many, { type: 'celebration' }]);
  // Celebration's long melody must be present: >= 10 triangle notes.
  const tri = ctx.started.filter((o) => o.type === 'triangle');
  assert.ok(tri.length >= 10);
});

test('voices clean up after ending', async () => {
  const { ctx, audio } = setup();
  await audio.unlock();
  audio.handleEvents([{ type: 'scratch' }]);
  assert.ok(audio.activeVoices > 0);
  ctx.advance(5);
  assert.equal(audio.activeVoices, 0);
  const disconnected = ctx.started.filter((o) => o.ended).every((o) => o.disconnected);
  assert.ok(disconnected);
});

test('mute kills playing tails immediately and skips future work', async () => {
  const { ctx, audio, tick } = setup();
  await audio.unlock();
  audio.handleEvents([{ type: 'celebration' }]);
  const playing = ctx.audibleOscillators().filter((o) => o.stopAt - o.startAt > 0.02);
  assert.ok(playing.length > 0);
  audio.setMuted(true);
  assert.equal(audio.muted, true);
  assert.equal(audio.activeVoices, 0);
  const master = ctx.nodes.find((n) => n.kind === 'gain');
  assert.equal(master.gain.value, 0);
  for (const o of playing) assert.ok(o.stopAt <= ctx.currentTime + 1e-9, 'stopped now');
  assert.equal(ctx.state, 'suspended');
  const count = ctx.started.length;
  tick(10000);
  audio.handleEvents(ALL_EVENTS);
  assert.equal(ctx.started.length, count, 'no work while muted');
});

test('unlock while muted does not resume; unmute resumes', async () => {
  const { ctx, audio, tick } = setup({ manager: { muted: true } });
  assert.equal(await audio.unlock(), false);
  assert.equal(ctx.resumeCalls, 0);
  assert.notEqual(ctx.state, 'running');
  audio.setMuted(false);
  await Promise.resolve();
  assert.equal(ctx.state, 'running');
  tick(1);
  audio.handleEvents([{ type: 'found' }]);
  assert.ok(audio.activeVoices > 0);
  const master = ctx.nodes.find((n) => n.kind === 'gain');
  assert.ok(master.gain.value > 0);
});

test('muting during pending unlock leaves context suspended', async () => {
  const { ctx, audio } = setup();
  const p = audio.unlock();
  audio.setMuted(true);
  assert.equal(await p, false);
  assert.equal(ctx.state, 'suspended');
});

test('suspended context (not yet running) does not queue sounds', () => {
  const ctx = new FakeContext();
  ctx.resume = () => new Promise(() => {}); // never resolves
  const audio = new AudioManager({ contextFactory: () => ctx });
  audio.unlock();
  audio.handleEvents(ALL_EVENTS);
  assert.equal(ctx.started.filter((o) => o.outputs.length && o.stopAt - o.startAt > 0.02).length, 0);
});

test('malformed events are ignored', async () => {
  const { audio } = setup();
  await audio.unlock();
  assert.doesNotThrow(() => {
    audio.handleEvents(null);
    audio.handleEvents(undefined);
    audio.handleEvents('scratch');
    audio.handleEvents([null, 5, {}, { type: 'unknown' }, { type: 'hint', progress: NaN }]);
  });
});

test('destroy stops sound, closes context and is idempotent', async () => {
  const { ctx, audio } = setup();
  await audio.unlock();
  audio.handleEvents([{ type: 'celebration' }]);
  audio.destroy();
  assert.equal(audio.activeVoices, 0);
  assert.equal(ctx.closeCalls, 1);
  assert.equal(ctx.state, 'closed');
  audio.destroy();
  assert.equal(ctx.closeCalls, 1);
  const count = ctx.started.length;
  audio.handleEvents(ALL_EVENTS);
  audio.setMuted(false);
  assert.equal(await audio.unlock(), false);
  assert.equal(ctx.started.length, count);
});
