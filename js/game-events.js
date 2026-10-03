/** Bonus, cameo, prop and adaptation operations on a Game instance. Pure logic. */
import { rectContains, virtualDistance } from './gestures.js';
import { pick } from './random.js';
import { STATES, clampNumber, rect } from './game-state.js';

// ---------------------------------------------------------------- bonus

export function maybeTriggerPlannedBonus(game, mode) {
  const plan = game.bonusPlan;
  if (!plan || game.bonus || plan.mode !== mode) return;
  if (mode === 'hiding' && !plan.forced && game.encounterActiveMs < plan.delayMs) return;
  game._spawnBonus();
}

function chooseBonusSpot(game) {
  const spots = game.scene.bonusSpots;
  const far = spots.filter(
    (s) => virtualDistance(s, game.spot) >= game.config.bonusMinDistancePx && s.id !== game.lastBonusSpotId,
  );
  const spot = pick(game.rng, far);
  if (spot) return spot;
  return [...spots].sort((a, b) => virtualDistance(b, game.spot) - virtualDistance(a, game.spot))[0];
}

export function spawnBonus(game) {
  const spot = chooseBonusSpot(game);
  game.lastBonusSpotId = spot.id;
  game.bonusPlan = null;
  game._bonusThisEncounter = true;
  game.bonusScheduler.recordAppearance();
  const totalMs = game.adapt.bonusDurationMs;
  game.bonus = {
    id: spot.id,
    x: spot.x,
    y: spot.y,
    pose: spot.pose,
    active: true,
    hit: false,
    remainingMs: totalMs,
    totalMs,
    ageMs: 0,
    lingerMs: 0,
    midScratch: game.state === STATES.SCRATCHING,
  };
  game._emit({ type: 'bonusAppeared', x: spot.x, y: spot.y, kind: spot.pose });
}

export function bonusRect(game) {
  return rect(game.bonus, game.config.bonusSize, game.adapt.generosity);
}

export function updateBonus(game, activeDt, list) {
  const bonus = game.bonus;
  if (!bonus) return;
  bonus.ageMs += activeDt;
  if (!bonus.active) {
    bonus.lingerMs -= activeDt;
    if (bonus.lingerMs <= 0) game.bonus = null;
    return;
  }
  const hitRect = game._bonusRect();
  if (list.some((p) => rectContains(hitRect, p.x, p.y))) {
    game._resolveBonus(true);
    return;
  }
  bonus.remainingMs = Math.max(0, bonus.remainingMs - activeDt);
  if (bonus.remainingMs <= 0) game._resolveBonus(false);
}

export function resolveBonus(game, hit) {
  const bonus = game.bonus;
  if (!bonus || !bonus.active) return;
  bonus.active = false;
  bonus.hit = hit;
  bonus.lingerMs = hit ? game.config.bonusHitLingerMs : game.config.bonusMissLingerMs;
  if (hit) game.bonusHits += 1;
  game._emit({ type: hit ? 'bonusHit' : 'bonusMiss', x: bonus.x, y: bonus.y, kind: bonus.pose });
  game._adaptOnBonus(hit);
}

// --------------------------------------------------------------- cameos

function advanceCameoPlan(game, dt) {
  if (game.state === STATES.CELEBRATION || game.state === STATES.SCENE_TRANSITION) {
    game.cameoPlan = null;
    return;
  }
  game.cameoPlan.waitMs -= dt;
  if (game.cameoPlan.waitMs <= 0) {
    game.cameo = { entry: game.cameoPlan.entry, ageMs: 0 };
    game.cameoPlan = null;
  }
}

export function updateCameo(game, dt) {
  if (game.cameoPlan) advanceCameoPlan(game, dt);
  if (game.cameo) {
    game.cameo.ageMs += dt;
    if (game.cameo.ageMs >= game.cameo.entry.durationMs) game.cameo = null;
  }
}

// ---------------------------------------------------------------- props

export function dogBlockRect(game) {
  if (!game.spot) return null;
  if (game.state === STATES.HIDING) return game._revealRect();
  if (game.state === STATES.REVEALED || game.state === STATES.SCRATCHING) return game._scratchRect();
  return null;
}

function triggerProp(game, prop, state) {
  state.armed = false;
  state.readyAt = game.elapsedMs + game.config.propCooldownMs;
  game.propEffects = game.propEffects.filter((e) => e.id !== prop.id);
  game.propEffects.push({ id: prop.id, kind: prop.kind, x: prop.x, y: prop.y, ageMs: 0, durationMs: game.config.propEffectMs });
  game._emit({ type: 'prop', x: prop.x, y: prop.y, kind: prop.kind });
}

export function updateProps(game, list) {
  const block = game._dogBlockRect();
  const blockedByBonus = game.bonus && game.bonus.active ? game._bonusRect() : null;
  const free = list.filter((p) => !rectContains(block, p.x, p.y) && !rectContains(blockedByBonus, p.x, p.y));
  for (const prop of game.scene.props) {
    const state = game.props.get(prop.id);
    if (!state) continue;
    const hitRect = rect(prop, prop, game.config.propHitScale);
    const touching = free.some((p) => rectContains(hitRect, p.x, p.y));
    if (!touching) {
      state.armed = true;
      continue;
    }
    if (!state.armed || game.elapsedMs < state.readyAt) continue;
    triggerProp(game, prop, state);
  }
}

export function updatePropEffects(game, dt) {
  if (!game.propEffects.length) return;
  for (const effect of game.propEffects) effect.ageMs += dt;
  game.propEffects = game.propEffects.filter((e) => e.ageMs < e.durationMs);
}

// ----------------------------------------------------------- adaptation

export function adaptOnFound(game, findMs) {
  const a = game.config.adaptation;
  const adapt = game.adapt;
  if (!a.enabled) return;
  if (findMs > a.slowFindMs) {
    adapt.hintScale = Math.max(a.minHintScale, adapt.hintScale * 0.85);
    adapt.generosity = Math.min(a.maxGenerosity, adapt.generosity + 0.05);
  } else if (findMs < a.quickFindMs) {
    adapt.hintScale = Math.min(1, adapt.hintScale + 0.05);
    adapt.generosity = Math.max(1, adapt.generosity - 0.02);
  }
  if (game.encounterHandLosses >= a.handLossesForGenerosity) {
    adapt.generosity = Math.min(a.maxGenerosity, adapt.generosity + 0.05);
  }
}

export function adaptOnScratch(game, scratchMs) {
  const a = game.config.adaptation;
  if (!a.enabled) return;
  if (scratchMs > a.slowScratchMs) {
    game.adapt.scratchScale = Math.max(a.minScratchScale, game.adapt.scratchScale - 0.05);
  } else if (scratchMs < a.quickScratchMs) {
    game.adapt.scratchScale = Math.min(1, game.adapt.scratchScale + 0.02);
  }
}

export function adaptOnBonus(game, hit) {
  const c = game.config;
  const a = c.adaptation;
  if (!a.enabled) return;
  const current = game.adapt.bonusDurationMs;
  const next = hit ? current - a.bonusHitStepMs : current + a.bonusMissStepMs;
  game.adapt.bonusDurationMs = clampNumber(next, c.bonusMinDurationMs, c.bonusMaxDurationMs, c.bonusDurationMs);
}
