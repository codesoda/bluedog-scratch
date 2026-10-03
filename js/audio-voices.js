// Oscillator voice scheduling, polyphony stealing and voice cleanup.
//
// A "voice host" is a plain object describing where voices go:
//   { ctx, master, voices: Set, enabled: boolean }
// The voices Set is owned by the AudioManager; these helpers add and remove
// entries in place so the manager's activeVoices count stays accurate.

import { MAX_PEAK, MAX_VOICES, MIN_GAIN, clamp, setParam } from './audio-constants.js';

function createEnvelopedOscillator(ctx, { freq, start, d, a, end, peak, type, glideTo, glideTime }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo && Number.isFinite(glideTo) && glideTo > 0) {
    osc.frequency.exponentialRampToValueAtTime(glideTo, start + clamp(glideTime ?? d, 0.01, d));
  }
  const env = ctx.createGain();
  env.gain.setValueAtTime(MIN_GAIN, start);
  env.gain.linearRampToValueAtTime(peak, start + a);
  env.gain.exponentialRampToValueAtTime(MIN_GAIN, end);
  return { osc, env };
}

/** Wire osc -> [lowpass] -> env -> [panner] -> master; returns extra nodes. */
function connectVoiceChain(ctx, master, osc, env, { lowpass, pan }) {
  const extra = [];
  let head = osc;
  if (lowpass > 0 && typeof ctx.createBiquadFilter === 'function') {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    setParam(f.frequency, lowpass);
    head.connect(f);
    head = f;
    extra.push(f);
  }
  head.connect(env);
  let out = env;
  if (pan !== null && typeof ctx.createStereoPanner === 'function') {
    const p = ctx.createStereoPanner();
    setParam(p.pan, clamp(pan, -0.6, 0.6));
    env.connect(p);
    out = p;
    extra.push(p);
  }
  out.connect(master);
  return extra;
}

function attachVibrato(ctx, osc, nodes, { vibratoHz, vibratoDepth, start, end }) {
  if (!(vibratoHz > 0 && vibratoDepth > 0)) return null;
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.type = 'sine';
  setParam(lfo.frequency, vibratoHz);
  setParam(lfoGain.gain, vibratoDepth);
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  nodes.push(lfo, lfoGain);
  lfo.start(start);
  lfo.stop(end + 0.02);
  return lfo;
}

function registerVoice(voices, { osc, env, nodes, lfo, start, end }) {
  const voice = { osc, env, nodes, lfo, startedAt: start, done: false };
  voice.cleanup = () => {
    if (voice.done) return;
    voice.done = true;
    voices.delete(voice);
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
  };
  osc.onended = voice.cleanup;
  voices.add(voice);
  osc.start(start);
  osc.stop(end + 0.02);
}

/**
 * Schedule one enveloped oscillator voice.
 * @param {{ctx: object, master: object, voices: Set, enabled: boolean}} host
 * @returns {boolean} whether scheduled
 */
export function scheduleTone(host, {
  freq,
  start,
  dur = 0.2,
  type = 'sine',
  gain = 0.15,
  attack = 0.012,
  glideTo = null,
  glideTime = null,
  vibratoHz = 0,
  vibratoDepth = 0,
  lowpass = 0,
  pan = null,
}) {
  const { ctx, master, voices } = host;
  if (!ctx || !host.enabled) return false;
  if (!Number.isFinite(freq) || freq <= 0) return false;
  if (voices.size >= MAX_VOICES) stealOldest(ctx, voices);
  const peak = clamp(gain, 0, MAX_PEAK);
  const d = clamp(dur, 0.03, 3);
  const a = clamp(attack, 0.003, d / 2);
  const end = start + d;

  const { osc, env } = createEnvelopedOscillator(ctx, { freq, start, d, a, end, peak, type, glideTo, glideTime });
  const nodes = [osc, env, ...connectVoiceChain(ctx, master, osc, env, { lowpass, pan })];
  const lfo = attachVibrato(ctx, osc, nodes, { vibratoHz, vibratoDepth, start, end });
  registerVoice(voices, { osc, env, nodes, lfo, start, end });
  return true;
}

export function killVoice(ctx, voice, fast = true) {
  if (!voice || voice.done) return;
  const t = ctx ? ctx.currentTime || 0 : 0;
  try {
    voice.env.gain.cancelScheduledValues?.(t);
    voice.env.gain.setValueAtTime(0, t);
  } catch {
    /* ignore */
  }
  try {
    voice.osc.stop(fast ? t : t + 0.02);
  } catch {
    /* ignore (already stopped) */
  }
  try {
    voice.lfo?.stop(t);
  } catch {
    /* ignore */
  }
  voice.cleanup();
}

export function stealOldest(ctx, voices) {
  let oldest = null;
  for (const v of voices) {
    if (!oldest || v.startedAt < oldest.startedAt) oldest = v;
  }
  if (oldest) killVoice(ctx, oldest, false);
}

export function stopAllVoices(ctx, voices) {
  for (const v of Array.from(voices)) killVoice(ctx, v, true);
  voices.clear();
}

/** Silent, extremely short oscillator that helps older Safari/iOS unlock output. */
export function primeOutput(ctx, master) {
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(g);
    g.connect(master);
    const t = ctx.currentTime || 0;
    osc.onended = () => {
      try {
        osc.disconnect();
        g.disconnect();
      } catch {
        /* ignore */
      }
    };
    osc.start(t);
    osc.stop(t + 0.01);
  } catch {
    /* ignore */
  }
}
