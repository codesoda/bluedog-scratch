/**
 * Blue Dog Scratch core game state machine. Pure logic, no browser globals.
 *
 * Usage: const game = new Game({rng, scene}); game.start();
 *        each frame: game.update(dtMs, pointers); render(game.snapshot());
 *        audio/renderer consume game.drainEvents().
 */
import { SCENES, SCENE_IDS, isSceneId } from './scenes.js';
import { rectContains } from './gestures.js';
import { pick, pickAvoiding, clamp01 } from './random.js';
import { STATES, REACTIONS, EXITS, INTERACTIVE, PROP_STATES, clampNumber, sanitizePointers, rect, mergeConfig, resetGameState } from './game-state.js';
import * as events from './game-events.js';
import { buildSnapshot, cameoSnapshot, dogMode } from './game-snapshot.js';

export { STATES, REACTIONS, EXITS, DEFAULT_CONFIG } from './game-state.js';

export class Game {
  constructor({ rng = Math.random, scene = 'backyard', bonusRate = 0.24, cameoRate = 0.3, config = {} } = {}) {
    this.rng = typeof rng === 'function' ? rng : Math.random;
    this.config = mergeConfig(config);
    this.initialSceneId = isSceneId(scene) ? scene : 'backyard';
    this.bonusRate = clamp01(bonusRate);
    this.cameoRate = clamp01(cameoRate);
    this._reset();
  }

  _reset() {
    resetGameState(this);
  }

  get scene() {
    return SCENES[this.sceneId];
  }

  get scratchThresholdPx() {
    return this.config.scratchThresholdPx * this.adapt.scratchScale;
  }

  start() {
    this._reset();
    this.started = true;
    this.sceneNumber = 1;
    this._enterIntro(this.initialSceneId);
    return this.snapshot();
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  _emit(event) {
    this.events.push(event);
  }

  _setState(state) {
    this.state = state;
    this.stateElapsedMs = 0;
  }

  // ---------------------------------------------------------------- scenes

  _enterIntro(sceneId) {
    this.sceneId = sceneId;
    this.nextSceneId = null;
    this.paws = 0;
    this.spotHistory = [];
    this.props = new Map(this.scene.props.map((p) => [p.id, { armed: true, readyAt: 0 }]));
    this.propEffects = [];
    this.cameo = null;
    this.cameoPlan = null;
    this.celebrationCast = [];
    this.cameoScheduler.newScene();
    this._chooseSpot();
    this._setState(STATES.SCENE_INTRO);
    this._emit({ type: 'scene', kind: sceneId });
  }

  _chooseSpot() {
    const avoid = this.spotHistory.slice(-2);
    this.spot = pickAvoiding(this.rng, this.scene.spots, avoid, (s) => s.id);
    this.spotHistory.push(this.spot.id);
    if (this.spotHistory.length > 4) this.spotHistory.shift();
  }

  _startEncounter() {
    this.hiddenMs = 0;
    this.hintLevel = 0;
    this.scratchPx = 0;
    this.scratchActiveMs = 0;
    this.encounterActiveMs = 0;
    this.encounterHandLosses = 0;
    this.reaction = null;
    this.exit = null;
    this.gesture.reset();
    this._setState(STATES.HIDING);
    if (!this.bonusPlan) this.bonusPlan = this.bonusScheduler.plan(this.rng);
    if (!this.cameo && !this.cameoPlan) {
      const plan = this.cameoScheduler.plan(this.rng, this.scene.cameos);
      if (plan) this.cameoPlan = { entry: plan.entry, waitMs: plan.delayMs };
    }
  }

  // ------------------------------------------------------------ main loop

  update(dtMs, pointers = []) {
    if (!this.started) return this.snapshot();
    const dt = clampNumber(dtMs, 0, this.config.maxDtMs, 0);
    const list = sanitizePointers(pointers);
    const hadHand = this.hasHand;
    this.hasHand = list.length > 0;
    this.pointers = list;
    if (hadHand !== this.hasHand) {
      // Loss or reacquisition: never let a tracking jump become movement.
      this.gesture.reset();
      if (!this.hasHand && INTERACTIVE.has(this.state)) this.encounterHandLosses += 1;
    }
    const activeDt = this.hasHand ? dt : 0;
    this.elapsedMs += dt;
    this.activeMs += activeDt;

    this._updatePropEffects(dt);
    this._updateCameo(dt);
    this._updateBonus(activeDt, list);

    this._updateState(dt, activeDt, list);
    if (PROP_STATES.has(this.state)) this._updateProps(list);
    return this.snapshot();
  }

  _updateState(dt, activeDt, list) {
  switch (this.state) {
    case STATES.SCENE_INTRO:
      this._updateIntro(dt);
      break;
    case STATES.HIDING:
      this._updateHiding(activeDt, list);
      break;
    case STATES.REVEALED:
    case STATES.SCRATCHING:
      this._updateScratch(activeDt, list);
      break;
    case STATES.REACTION:
      this._updateReaction(dt);
      break;
    case STATES.CELEBRATION:
      this._updateCelebration(dt);
      break;
    case STATES.SCENE_TRANSITION:
      this._updateTransition(dt);
      break;
    default:
      break;
  }
  }

  _updateIntro(dt) {
    this.stateElapsedMs += dt;
    if (this.stateElapsedMs >= this.config.introMs) this._startEncounter();
  }

  _hintThresholds() {
    return this.config.hintThresholdsMs.map((t) => t * this.adapt.hintScale);
  }

  _revealRect() {
    const factor = this.adapt.generosity * (1 + this.config.hintRectGrowth * this.hintLevel);
    let size = this.config.revealSize;
    const occluder = this.spot.occluder;
    if (/under|peek|tail/i.test(this.spot.pose) && occluder) {
      const clueWidth = occluder.w + 2 * Math.abs(occluder.x - this.spot.x) + 0.16;
      size = { ...size, w: Math.max(size.w, clueWidth) };
      if (/peek/i.test(this.spot.pose)) {
        const headOffset = Math.min(170 / 900, Math.max(75 / 900, occluder.h * 0.32));
        const earTop = occluder.y - occluder.h / 2 + headOffset - 0.14;
        size.h = Math.max(size.h, 2 * (this.spot.y - earTop));
      }
    }
    if (occluder && /upside|ears|top|head/i.test(this.spot.pose)) {
      const clueTop = occluder.y - occluder.h / 2 - 0.12;
      size = { ...size, h: Math.max(size.h, 2 * (this.spot.y - clueTop)) };
    }
    return rect(this.spot, size, factor);
  }

  _scratchRect() {
    return rect(this.spot, this.config.scratchSize, this.adapt.generosity);
  }

  _updateHiding(activeDt, list) {
    this.stateElapsedMs += activeDt;
    this.hiddenMs += activeDt;
    this.encounterActiveMs += activeDt;
    const thresholds = this._hintThresholds();
    let level = 0;
    while (level < thresholds.length && this.hiddenMs >= thresholds[level]) level += 1;
    if (level > this.hintLevel) {
      this.hintLevel = level;
      this._emit({ type: 'hint', x: this.spot.x, y: this.spot.y, kind: this.spot.kind, progress: level / 4 });
    }
    this._maybeTriggerPlannedBonus('hiding');
    if (!this.hasHand) return;
    const revealRect = this._revealRect();
    const finder = list.find((p) => rectContains(revealRect, p.x, p.y));
    if (finder) {
      this._adaptOnFound(this.hiddenMs);
      this._setState(STATES.REVEALED);
      this.gesture.reset();
      this._emit({ type: 'found', x: this.spot.x, y: this.spot.y, kind: this.spot.kind });
    }
  }

  _updateScratch(activeDt, list) {
    this.stateElapsedMs += activeDt;
    this.encounterActiveMs += activeDt;
    if (this.state === STATES.REVEALED) {
      this._maybeTriggerPlannedBonus('hiding');
      if (this.stateElapsedMs < this.config.revealMs) {
        this.gesture.reset();
        return;
      }
    } else {
      this.scratchActiveMs += activeDt;
    }
    if (!this.hasHand) return;
    const { accepted } = this.gesture.update(list, this._scratchRect(), this.activeMs);
    if (accepted <= 0) return;
    if (this.state === STATES.REVEALED) {
      this._setState(STATES.SCRATCHING);
    }
    this.scratchPx += accepted;
    const progress = this._scratchProgress();
    if (progress >= 1) {
      this._completeScratch();
      return;
    }
    if (progress >= this.config.bonusMidScratchAt) this._maybeTriggerPlannedBonus('scratch');
  }

  _scratchProgress() {
    return Math.min(1, this.scratchPx / this.scratchThresholdPx);
  }

  _completeScratch() {
    this.scratchPx = this.scratchThresholdPx;
    this.paws = Math.min(this.config.pawsPerScene, this.paws + 1);
    this.encounters += 1;
    this.reaction = pickAvoiding(this.rng, REACTIONS, this.lastReaction ? [this.lastReaction] : []);
    this.lastReaction = this.reaction;
    this.exit = pick(this.rng, EXITS);
    this._adaptOnScratch(this.scratchActiveMs);
    // A fast find must not indefinitely defer a planned surprise.
    if (this.bonusPlan && !this._bonusThisEncounter) this.bonusPlan.mode = 'scratch';
    if (!this._bonusThisEncounter) this.bonusScheduler.recordEncounterWithoutBonus();
    this._bonusThisEncounter = false;
    this.gesture.reset();
    this._setState(STATES.REACTION);
    this._emit({
      type: 'scratch',
      x: this.spot.x,
      y: this.spot.y,
      kind: this.reaction,
      progress: this.paws / this.config.pawsPerScene,
    });
  }

  _updateReaction(dt) {
    this.stateElapsedMs += dt;
    if (this.stateElapsedMs < this.config.reactionMs) return;
    if (this.paws >= this.config.pawsPerScene) {
      this._enterCelebration();
    } else {
      this._chooseSpot();
      this._startEncounter();
    }
  }

  _enterCelebration() {
    if (this.bonus && this.bonus.active) this._resolveBonus(false);
    this.bonus = null;
    this.cameo = null;
    this.cameoPlan = null;
    const cast = ['blue'];
    if (this.bonusHits > 0 || this.rng() < this.config.celebrationOrangeChance) cast.push('orange');
    if (this.rng() < this.config.celebrationParentsChance) cast.push('parents');
    this.celebrationCast = cast;
    this._setState(STATES.CELEBRATION);
    this._emit({ type: 'celebration', kind: this.sceneId, progress: 1 });
  }

  _updateCelebration(dt) {
    this.stateElapsedMs += dt;
    if (this.stateElapsedMs >= this.config.celebrationMs) {
      this.nextSceneId = pickAvoiding(this.rng, SCENE_IDS, [this.sceneId]);
      this._setState(STATES.SCENE_TRANSITION);
    }
  }

  _updateTransition(dt) {
    this.stateElapsedMs += dt;
    if (this.stateElapsedMs >= this.config.transitionMs) {
      this.sceneNumber += 1;
      this._enterIntro(this.nextSceneId || pickAvoiding(this.rng, SCENE_IDS, [this.sceneId]));
    }
  }

  // ------------------------------------------- bonus/cameo/props/adapt

  _maybeTriggerPlannedBonus(mode) {
    events.maybeTriggerPlannedBonus(this, mode);
  }

  _spawnBonus() {
    events.spawnBonus(this);
  }

  _bonusRect() {
    return events.bonusRect(this);
  }

  _updateBonus(activeDt, list) {
    events.updateBonus(this, activeDt, list);
  }

  _resolveBonus(hit) {
    events.resolveBonus(this, hit);
  }

  _updateCameo(dt) {
    events.updateCameo(this, dt);
  }

  _dogBlockRect() {
    return events.dogBlockRect(this);
  }

  _updateProps(list) {
    events.updateProps(this, list);
  }

  _updatePropEffects(dt) {
    events.updatePropEffects(this, dt);
  }

  _adaptOnFound(findMs) {
    events.adaptOnFound(this, findMs);
  }

  _adaptOnScratch(scratchMs) {
    events.adaptOnScratch(this, scratchMs);
  }

  _adaptOnBonus(hit) {
    events.adaptOnBonus(this, hit);
  }

  // ------------------------------------------------------------- snapshot

  _cameoSnapshot() {
    return cameoSnapshot(this);
  }

  _dogMode() {
    return dogMode(this);
  }

  snapshot() {
    return buildSnapshot(this);
  }
}
