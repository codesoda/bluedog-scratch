/**
 * Constrained-randomness helpers. Pure, deterministic when given a seeded rng.
 */

/** Hash any string/number into a 32-bit unsigned seed. */
export function hashSeed(value) {
  const str = String(value);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 PRNG returning floats in [0, 1). */
export function createRng(seed = 1) {
  let a = (typeof seed === 'number' && Number.isFinite(seed) ? seed : hashSeed(seed)) >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function draw(rng) {
  const v = Number(rng());
  if (!Number.isFinite(v)) return 0;
  return Math.min(Math.max(v, 0), 0.999999999);
}

export function randomFloat(rng, min, max) {
  return min + (max - min) * draw(rng);
}

export function randomInt(rng, n) {
  return Math.floor(draw(rng) * n);
}

export function pick(rng, items) {
  if (!items || items.length === 0) return undefined;
  return items[randomInt(rng, items.length)];
}

/**
 * Pick an item whose key is not in `avoid`. Falls back to progressively
 * shorter avoid lists (most recent last) so a valid choice always exists.
 */
export function pickAvoiding(rng, items, avoid = [], key = (item) => item) {
  if (!items || items.length === 0) return undefined;
  let list = [...avoid];
  for (;;) {
    const blocked = new Set(list);
    const pool = items.filter((item) => !blocked.has(key(item)));
    if (pool.length > 0) return pick(rng, pool);
    if (list.length === 0) break;
    list = list.slice(1); // drop the oldest restriction
  }
  return pick(rng, items);
}

/** entries: [{value, weight}] */
export function weightedPick(rng, entries) {
  const valid = entries.filter((e) => e && e.weight > 0);
  const total = valid.reduce((sum, e) => sum + e.weight, 0);
  if (total <= 0) return undefined;
  let roll = draw(rng) * total;
  for (const entry of valid) {
    roll -= entry.weight;
    if (roll < 0) return entry.value;
  }
  return valid[valid.length - 1].value;
}

/**
 * Orange-dog bonus scheduler: probability + cooldown + drought protection.
 * `encountersSince` counts completed blue-dog encounters since the last
 * appearance (or since the session started).
 */
export class BonusScheduler {
  constructor({ rate = 0.24, minGap = 2, droughtLimit = 5, midScratchChance = 0.2, delayMinMs = 900, delayMaxMs = 2600 } = {}) {
    this.rate = clamp01(rate);
    this.minGap = Math.max(0, Math.floor(minGap));
    this.droughtLimit = Math.max(this.minGap, Math.floor(droughtLimit));
    this.midScratchChance = clamp01(midScratchChance);
    this.delayMinMs = delayMinMs;
    this.delayMaxMs = Math.max(delayMinMs, delayMaxMs);
    this.encountersSince = 0;
    this.appearances = 0;
  }

  /** Effective cooldown; a rate of 1 is a testing mode with no cooldown. */
  get effectiveMinGap() {
    return this.rate >= 1 ? 0 : this.minGap;
  }

  /** Returns null or a plan {mode:'hiding'|'scratch', delayMs, forced}. */
  plan(rng) {
    if (this.rate <= 0) return null;
    if (this.encountersSince < this.effectiveMinGap) return null;
    const forced = this.encountersSince >= this.droughtLimit;
    if (!forced && !(draw(rng) < this.rate)) return null;
    const mode = draw(rng) < this.midScratchChance ? 'scratch' : 'hiding';
    return { mode, delayMs: Math.round(randomFloat(rng, this.delayMinMs, this.delayMaxMs)), forced };
  }

  recordAppearance() {
    this.encountersSince = 0;
    this.appearances += 1;
  }

  recordEncounterWithoutBonus() {
    this.encountersSince += 1;
  }
}

/**
 * Decorative parent cameo scheduler. Low probability, no back-to-back
 * cameos (unless rate >= 1 testing mode), per-scene cap, rare cooldown.
 */
export class CameoScheduler {
  constructor({ rate = 0.3, weights = { dad: 15, mum: 10, both: 4, rare: 1 }, maxPerScene = 3, rareCooldownEncounters = 24, delayMinMs = 1200, delayMaxMs = 4000 } = {}) {
    this.rate = clamp01(rate);
    this.weights = { ...weights };
    this.maxPerScene = maxPerScene;
    this.rareCooldownEncounters = rareCooldownEncounters;
    this.delayMinMs = delayMinMs;
    this.delayMaxMs = Math.max(delayMinMs, delayMaxMs);
    this.sceneCount = 0;
    this.lastWasCameo = false;
    this.encountersSinceRare = rareCooldownEncounters; // allow rare from the start, still 1-in-many
    this.lastId = null;
  }

  newScene() {
    this.sceneCount = 0;
  }

  /** Returns null or {entry, delayMs}. */
  plan(rng, sceneCameos) {
    this.encountersSinceRare += 1;
    const blockedByStreak = this.lastWasCameo && this.rate < 1;
    if (this.rate <= 0 || blockedByStreak || this.sceneCount >= this.maxPerScene || !sceneCameos?.length) {
      this.lastWasCameo = false;
      return null;
    }
    if (!(draw(rng) < this.rate)) {
      this.lastWasCameo = false;
      return null;
    }
    const rareAllowed = this.encountersSinceRare > this.rareCooldownEncounters;
    const entries = Object.entries(this.weights)
      .filter(([kind]) => kind !== 'rare' || rareAllowed)
      .filter(([kind]) => sceneCameos.some((c) => c.kind === kind))
      .map(([kind, weight]) => ({ value: kind, weight }));
    const kind = weightedPick(rng, entries);
    if (!kind) {
      this.lastWasCameo = false;
      return null;
    }
    const options = sceneCameos.filter((c) => c.kind === kind);
    const entry = pickAvoiding(rng, options, this.lastId ? [this.lastId] : [], (c) => c.id);
    this.lastId = entry.id;
    this.lastWasCameo = true;
    this.sceneCount += 1;
    if (kind === 'rare') this.encountersSinceRare = 0;
    return { entry, delayMs: Math.round(randomFloat(rng, this.delayMinMs, this.delayMaxMs)) };
  }
}

export function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
