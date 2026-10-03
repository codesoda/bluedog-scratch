/** Immutable render snapshot construction for a Game instance. Pure logic. */
import { STATES, INTERACTIVE, lerp } from './game-state.js';

const NO_SPOT = Object.freeze({ x: 0.5, y: 0.6, kind: 'none', pose: 'peekLeft' });

function emptyRect() {
  return { x: 0.5, y: 0.6, w: 0, h: 0 };
}

export function dogMode(game) {
  const c = game.config;
  switch (game.state) {
    case STATES.SCENE_INTRO:
      return 'hidden';
    case STATES.HIDING:
      return 'hiding';
    case STATES.REVEALED:
      return game.stateElapsedMs < c.revealMs ? 'revealing' : 'waiting';
    case STATES.SCRATCHING:
      return 'scratching';
    case STATES.REACTION:
      return game.stateElapsedMs < c.reactionMs * (1 - c.exitFraction) ? 'reaction' : 'exit';
    case STATES.CELEBRATION:
      return 'celebrate';
    default:
      return 'away';
  }
}

export function cameoSnapshot(game) {
  if (!game.cameo) return null;
  const { entry, ageMs } = game.cameo;
  const progress = Math.min(1, ageMs / entry.durationMs);
  return {
    id: entry.id,
    kind: entry.kind,
    event: entry.event,
    x: lerp(entry.from.x, entry.to.x, progress),
    y: lerp(entry.from.y, entry.to.y, progress),
    progress,
  };
}

function bonusSnapshot(game) {
  const b = game.bonus;
  if (!b) return null;
  return {
    id: b.id,
    x: b.x,
    y: b.y,
    pose: b.pose,
    active: b.active,
    hit: b.hit,
    remainingMs: b.remainingMs,
    totalMs: b.totalMs,
    ageMs: b.ageMs,
    midScratch: b.midScratch,
  };
}

function dogSnapshot(game, bonus) {
  const spot = game.spot || NO_SPOT;
  const celebrating = game.state === STATES.CELEBRATION;
  let progress = 0;
  if (game.state === STATES.REACTION) progress = 1;
  else if (game.spot) progress = game._scratchProgress();
  return {
    x: celebrating ? 0.5 : spot.x,
    y: celebrating ? 0.66 : spot.y,
    mode: game._dogMode(),
    progress,
    reaction: game.reaction,
    exit: game.exit,
    pose: spot.pose,
    kind: spot.kind,
    clue: spot.clue,
    reveal: spot.reveal,
    facing: spot.facing,
    hintLevel: game.hintLevel,
    lookAt: bonus && bonus.active ? { x: bonus.x, y: bonus.y } : null,
    revealRect: game.spot ? game._revealRect() : emptyRect(),
    scratchRect: game.spot ? game._scratchRect() : emptyRect(),
  };
}

function debugSnapshot(game) {
  return {
    scratchPx: game.scratchPx,
    scratchThresholdPx: game.scratchThresholdPx,
    hiddenMs: game.hiddenMs,
    activeMs: game.activeMs,
    encounters: game.encounters,
    bonusRate: game.bonusRate,
    cameoRate: game.cameoRate,
    bonusPlan: game.bonusPlan ? { ...game.bonusPlan } : null,
    encountersSinceBonus: game.bonusScheduler.encountersSince,
    bonusHitRect: game.bonus && game.bonus.active ? game._bonusRect() : null,
    adapt: { ...game.adapt },
  };
}

export function buildSnapshot(game) {
  const bonus = bonusSnapshot(game);
  const bonusActive = Boolean(bonus && bonus.active);
  const paused = !game.hasHand && game.started && (INTERACTIVE.has(game.state) || bonusActive);
  return {
    state: game.state,
    sceneId: game.sceneId,
    nextSceneId: game.nextSceneId,
    spotId: game.spot ? game.spot.id : null,
    sceneNumber: game.sceneNumber,
    elapsedMs: game.elapsedMs,
    stateElapsedMs: game.stateElapsedMs,
    paws: game.paws,
    pawsTarget: game.config.pawsPerScene,
    bonusHits: game.bonusHits,
    hasHand: game.hasHand,
    paused,
    dog: dogSnapshot(game, bonus),
    bonus,
    cameo: game._cameoSnapshot(),
    propEffects: game.propEffects.map((e) => ({ ...e })),
    celebrationCast: [...game.celebrationCast],
    debug: debugSnapshot(game),
  };
}
