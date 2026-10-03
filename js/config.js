export function parseOptions(search, sceneIds) {
  const params = new URLSearchParams(search);
  const debug = params.get('debug') === 'true';
  const rate = (key, fallback) => {
    if (!params.has(key) || params.get(key).trim() === '') return fallback;
    const value = Number(params.get(key));
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
  };
  return {
    scene: sceneIds.includes(params.get('scene')) ? params.get('scene') : null,
    debug,
    mouse: debug && params.get('input') === 'mouse',
    camera: params.get('camera') === 'true',
    bonusRate: rate('bonusRate', 0.24),
    cameoRate: rate('cameoRate', 0.30),
    seed: params.get('seed'),
  };
}

export function createRng(seed) {
  if (seed === null || seed === undefined) return Math.random;
  let state = 2166136261;
  for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state |= 0;
    state = state + 0x6D2B79F5 | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function readMuted() {
  try { return localStorage.getItem('blue-dog-muted') === 'true'; }
  catch { return false; }
}

export function saveMuted(muted) {
  try { localStorage.setItem('blue-dog-muted', String(muted)); }
  catch { /* Sound still works when preference storage is blocked. */ }
}
