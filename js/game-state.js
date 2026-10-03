/** Game configuration, constants and state initialization. Pure logic, no browser globals. */
import { HITBOXES } from './scenes.js';
import { ScratchGesture, isUsablePointer } from './gestures.js';
import { BonusScheduler, CameoScheduler } from './random.js';

export const STATES = Object.freeze({
  SCENE_INTRO: 'SCENE_INTRO',
  HIDING: 'HIDING',
  REVEALED: 'REVEALED',
  SCRATCHING: 'SCRATCHING',
  REACTION: 'REACTION',
  CELEBRATION: 'CELEBRATION',
  SCENE_TRANSITION: 'SCENE_TRANSITION',
  GO_COMPLETE: 'GO_COMPLETE',
});

export const REACTIONS = Object.freeze(['legKick', 'tailWag', 'rollOver', 'happyBounce', 'tongueOut', 'shake', 'laugh']);
export const EXITS = Object.freeze(['runLeft', 'runRight', 'dive', 'duckDown', 'bounceAway']);

export const DEFAULT_CONFIG = Object.freeze({
  pawsPerScene: 6,
  stagesPerGo: 6,
  maxDtMs: 100,
  introMs: 1600,
  revealMs: 450,
  reactionMs: 1800,
  exitFraction: 0.35, // last part of REACTION is the exit animation
  celebrationMs: 5600,
  transitionMs: 1200,
  hintThresholdsMs: [4000, 7000, 10000, 13000],
  hintRectGrowth: 0.06, // reveal rect grows per hint level
  scratchThresholdPx: 330,
  scratchGatePx: 18,
  scratchMaxJumpPx: 180,
  scratchMaxStepPx: 110,
  scratchAnchorWindowMs: 450,
  revealSize: HITBOXES.reveal,
  scratchSize: HITBOXES.scratch,
  bonusSize: HITBOXES.bonus,
  bonusDurationMs: 1500,
  bonusMinDurationMs: 1250,
  bonusMaxDurationMs: 2000,
  bonusMinGap: 2,
  bonusDroughtLimit: 5,
  bonusMidScratchChance: 0.2,
  bonusMidScratchAt: 0.3,
  bonusDelayMinMs: 900,
  bonusDelayMaxMs: 2600,
  bonusHitLingerMs: 800,
  bonusMissLingerMs: 650,
  bonusMinDistancePx: 330,
  cameoWeights: { dad: 15, mum: 10, both: 4, rare: 1 },
  cameoMaxPerScene: 3,
  cameoRareCooldownEncounters: 24,
  cameoDelayMinMs: 1200,
  cameoDelayMaxMs: 4000,
  propCooldownMs: 1200,
  propEffectMs: 1400,
  propHitScale: 1.25,
  celebrationOrangeChance: 0.5,
  celebrationParentsChance: 0.25,
  adaptation: {
    enabled: true,
    minHintScale: 0.55,
    maxGenerosity: 1.25,
    minScratchScale: 0.75,
    slowFindMs: 9000,
    quickFindMs: 3500,
    slowScratchMs: 6000,
    quickScratchMs: 2500,
    handLossesForGenerosity: 3,
    bonusHitStepMs: 60,
    bonusMissStepMs: 120,
  },
});

/** States where the player is actively looking for / scratching the dog. */
export const INTERACTIVE = new Set([STATES.HIDING, STATES.REVEALED, STATES.SCRATCHING]);
/** States where touchable scene props respond. */
export const PROP_STATES = new Set([STATES.HIDING, STATES.REVEALED, STATES.SCRATCHING, STATES.REACTION]);

export function mergeConfig(config = {}) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  merged.adaptation = { ...DEFAULT_CONFIG.adaptation, ...config.adaptation };
  merged.cameoWeights = { ...DEFAULT_CONFIG.cameoWeights, ...config.cameoWeights };
  return merged;
}

export function clampNumber(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeStagesPerGo(value) {
  if (value == null || typeof value === 'boolean' || String(value).trim() === '') return 6;
  return Math.round(clampNumber(value, 1, 15, 6));
}

export function sanitizePointers(pointers) {
  if (!Array.isArray(pointers)) return [];
  return pointers.filter(isUsablePointer).map((p) => ({
    id: String(p.id),
    x: clampNumber(p.x, 0, 1, 0.5),
    y: clampNumber(p.y, 0, 1, 0.5),
    active: true,
    sampleId: p.sampleId,
  }));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function rect(center, size, factor = 1) {
  return { x: center.x, y: center.y, w: size.w * factor, h: size.h * factor };
}

function resetProgress(game) {
  game.started = false;
  game.events = [];
  game.state = STATES.SCENE_INTRO;
  game.sceneId = game.initialSceneId;
  game.nextSceneId = null;
  game.sceneNumber = 0;
  game.completedStages = 0;
  game.stagesTarget = normalizeStagesPerGo(game.config.stagesPerGo);
  game.elapsedMs = 0;
  game.stateElapsedMs = 0;
  game.activeMs = 0;
  game.paws = 0;
  game.bonusHits = 0;
  game.hasHand = false;
  game.pointers = [];
  game.encounters = 0;
}

function resetEncounter(game) {
  game.spot = null;
  game.spotHistory = [];
  game.hiddenMs = 0;
  game.hintLevel = 0;
  game.scratchPx = 0;
  game.scratchActiveMs = 0;
  game.encounterActiveMs = 0;
  game.encounterHandLosses = 0;
  game.reaction = null;
  game.lastReaction = null;
  game.exit = null;
}

function resetExtras(game) {
  game.bonus = null;
  game.bonusPlan = null;
  game.lastBonusSpotId = null;
  game._bonusThisEncounter = false;
  game.cameo = null;
  game.cameoPlan = null;
  game.celebrationCast = [];
  game.props = new Map();
  game.propEffects = [];
}

function createHelpers(game) {
  const c = game.config;
  game.gesture = new ScratchGesture({
    gatePx: c.scratchGatePx,
    maxJumpPx: c.scratchMaxJumpPx,
    maxStepPx: c.scratchMaxStepPx,
    anchorWindowMs: c.scratchAnchorWindowMs,
  });
  game.bonusScheduler = new BonusScheduler({
    rate: game.bonusRate,
    minGap: c.bonusMinGap,
    droughtLimit: c.bonusDroughtLimit,
    midScratchChance: c.bonusMidScratchChance,
    delayMinMs: c.bonusDelayMinMs,
    delayMaxMs: c.bonusDelayMaxMs,
  });
  game.cameoScheduler = new CameoScheduler({
    rate: game.cameoRate,
    weights: c.cameoWeights,
    maxPerScene: c.cameoMaxPerScene,
    rareCooldownEncounters: c.cameoRareCooldownEncounters,
    delayMinMs: c.cameoDelayMinMs,
    delayMaxMs: c.cameoDelayMaxMs,
  });
  game.adapt = {
    hintScale: 1,
    generosity: 1,
    scratchScale: 1,
    bonusDurationMs: clampNumber(c.bonusDurationMs, c.bonusMinDurationMs, c.bonusMaxDurationMs, 1500),
  };
}

/** Reset every mutable Game field to its pre-start value. */
export function resetGameState(game) {
  resetProgress(game);
  resetEncounter(game);
  resetExtras(game);
  createHelpers(game);
}
