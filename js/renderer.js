// SVG renderer for Blue Dog Scratch.
// Builds cached layers once, rebuilds scene geometry only on scene change, and
// per frame only mutates transforms/attributes. All gameplay geometry comes
// from SCENES (js/scenes.js) and the game snapshot; nothing here invents
// hit targets.

import { SCENES, DOG_SIZE, BONUS_DOG_SIZE } from './scenes.js';
import {
  el, setAttr, setTransform, setVisible, createDogRig, createPaw, createPointingHand,
  createRainbowBadge, createCameoProp, starPath, HEART_PATH, INK, KID_EXTENTS,
} from './characters.js';
import { createScratchHand } from './scratch-hand.js';
import { W, H, buildBackground, paintOccluder, paintProp, CAMEO_CLIPS } from '../assets/art/scene-art.js';

const DOG_VISUAL_H = KID_EXTENTS.feetY - KID_EXTENTS.earTop; // local units
const DOG_CENTER_Y = (KID_EXTENTS.feetY + KID_EXTENTS.earTop) / 2; // local y of bbox centre
const DOG_SCALE = (DOG_SIZE.h * H) / DOG_VISUAL_H;
const BONUS_SCALE = (BONUS_DOG_SIZE.h * H) / DOG_VISUAL_H;
const HIDE_BAND = 420;
const MAX_PARTICLES = 220;
const HAND_SPEED_THRESH = 8; // px/sample: real wiggle vs stationary jitter
const HAND_HOLD_MS = 260; // keeps the last wiggle pose briefly to avoid flicker

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r2 = (n) => Math.round(n * 100) / 100;
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeOutBack = (k) => { const c = 1.7; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; };

let instanceCounter = 0;

const CAMEO_STAGING = {
  backyard: { scale: 0.5, dy: 0 },
  bedroom: { scale: 0.78, dy: 84 },
  lounge: { scale: 0.62, dy: 50 },
  playground: { scale: 0.45, dy: 80 },
};

const PARTICLE_SHAPES = ['heart', 'star', 'sparkle', 'confetti', 'dust', 'leaf', 'bubble', 'drop', 'note'];
const CONFETTI = ['#ff8f9e', '#ffd35c', '#9be08f', '#8fd0f5', '#b9a2f5', '#ff9f6b'];

export class Renderer {
  constructor(svgElement, { reducedMotion = false } = {}) {
    if (!svgElement) throw new Error('Renderer needs an SVG element');
    this.svg = svgElement;
    this.reducedMotion = Boolean(reducedMotion);
    this.uid = `bd${(instanceCounter += 1)}`;
    this.sceneId = null;
    this.spotId = null;
    this.prevState = null;
    this.prevMode = null;
    this.prevProgress = 0;
    this.prevPaws = 0;
    this.prevBonusHits = 0;
    this.lastProgressAt = 0;
    this.gameNow = 0;
    this.lastDogPos = { x: W * 0.5, y: H * 0.62 };
    this.irisClosed = false;
    this.lastNow = 0;
    this.clock = 0;
    this.particles = [];
    this.pointerEls = new Map();
    this.pointerHistory = new Map();
    this.ambient = [];
    this.propUpdaters = new Map();
    this.occluders = new Map();
    this.pendingFx = [];
    this.debugGroup = null;
    this._build();
  }

  /* ------------------------------------------------------------ setup */

  _build() {
    const svg = this.svg;
    // keep <title>/<desc> for accessibility; remove anything else we own
    for (const child of Array.from(svg.childNodes)) {
      const tag = child.nodeName && child.nodeName.toLowerCase();
      if (tag !== 'title' && tag !== 'desc') svg.removeChild(child);
    }
    if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.classList.add('world-svg');
    if (this.reducedMotion) svg.classList.add('reduced-motion');

    const root = el('g', { class: 'bd-root' }, svg);
    this.root = root;
    this.defs = el('defs', {}, root);
    this.sceneDefs = el('g', {}, this.defs);
    this._buildDefs();

    this.layers = {};
    for (const name of ['bgFar', 'cameo', 'bgNear', 'occluders', 'props', 'hidden', 'front', 'celebration', 'fx', 'hud', 'iris', 'pointers', 'debug']) {
      this.layers[name] = el('g', { class: `layer layer-${name}` }, root);
    }
    setAttr(this.layers.cameo, 'pointer-events', 'none');
    this.cameoInner = el('g', {}, this.layers.cameo);

    // hidden-dog stack: clipped dog + clipped copy of its own occluder on top
    this.hideClip = el('clipPath', { id: `${this.uid}-hide-clip` }, this.defs);
    this.hideClipOwn = el('rect', { x: 0, y: 0, width: 0, height: 0 }, this.hideClip);
    this.hideClipBand = el('rect', { x: 0, y: 0, width: 0, height: 0 }, this.hideClip);
    this.ownClip = el('clipPath', { id: `${this.uid}-own-clip` }, this.defs);
    this.ownClipRect = el('rect', { x: 0, y: 0, width: 0, height: 0 }, this.ownClip);
    this.hiddenDogHolder = el('g', { 'clip-path': `url(#${this.uid}-hide-clip)` }, this.layers.hidden);
    this.ownOccluderUse = el('use', { 'clip-path': `url(#${this.uid}-own-clip)` }, this.layers.hidden);
    // nearer occluders overlapping the hiding box are redrawn on top to keep painter's order
    this.overUses = el('g', { 'clip-path': `url(#${this.uid}-own-clip)` }, this.layers.hidden);

    this.cameoClip = el('clipPath', { id: `${this.uid}-cameo-clip` }, this.defs);
    this.cameoClipRect = el('rect', { x: 0, y: 0, width: W, height: H }, this.cameoClip);

    // Blue dog
    this.blue = createDogRig('blue', { className: 'blue-dog' });
    this.blueWrap = el('g', { class: 'blue-dog-wrap' }, this.layers.front);
    this.blueWrap.appendChild(this.blue.root);
    this.dogShadow = el('ellipse', { class: 'dog-shadow', rx: 70, ry: 14, fill: INK, opacity: 0.16 }, this.layers.front);
    this.layers.front.insertBefore(this.dogShadow, this.blueWrap);

    // Orange dog (bonus)
    this.bonusWrap = el('g', { class: 'bonus-wrap', display: 'none' }, this.layers.front);
    this.bonusGlow = el('circle', { r: 120, fill: `url(#${this.uid}-bonus-glow)` }, this.bonusWrap);
    this.bonusDogPos = el('g', {}, this.bonusWrap);
    this.orange = createDogRig('orange', { className: 'orange-dog' });
    this.bonusDogPos.appendChild(this.orange.root);
    this.bonusRing = createRainbowBadge(this.bonusWrap);
    setAttr(this.bonusRing, 'opacity', 0);

    // Celebration cast (blue reuses main rig)
    this.celebOrange = createDogRig('orange');
    this.celebOrangeWrap = el('g', { display: 'none' }, this.layers.celebration);
    this.celebOrangeWrap.appendChild(this.celebOrange.root);
    this.celebDad = createDogRig('dad');
    this.celebMum = createDogRig('mum');
    this.celebParentsWrap = el('g', { display: 'none' }, this.layers.celebration);
    this.celebDadWrap = el('g', {}, this.celebParentsWrap);
    this.celebDadWrap.appendChild(this.celebDad.root);
    this.celebMumWrap = el('g', {}, this.celebParentsWrap);
    this.celebMumWrap.appendChild(this.celebMum.root);
    this.layers.celebration.insertBefore(this.celebParentsWrap, this.celebOrangeWrap);

    // Cameo rigs
    this.cameoDad = createDogRig('dad');
    this.cameoMum = createDogRig('mum');
    this.cameoDadWrap = el('g', { display: 'none' }, this.cameoInner);
    this.cameoDadWrap.appendChild(this.cameoDad.root);
    this.cameoMumWrap = el('g', { display: 'none' }, this.cameoInner);
    this.cameoMumWrap.appendChild(this.cameoMum.root);
    this.cameoProps = {};
    this.cameoPropHolder = el('g', {}, this.cameoInner);
    for (const kind of ['rake', 'washing', 'book', 'flamingo', 'picnic', 'box']) {
      const g = createCameoProp(this.cameoPropHolder, kind);
      setVisible(g, false);
      this.cameoProps[kind] = g;
    }
    this.cameoProps.kite = this._buildKite(this.cameoPropHolder);
    this.cameoProps.balloons = this._buildBalloonBunch(this.cameoPropHolder);
    this.cameoProps.dino = this._buildDinoHood(this.cameoPropHolder);
    for (const k of ['kite', 'balloons', 'dino']) setVisible(this.cameoProps[k], false);

    // FX: hint beacon, scratch meter, tutorial hand, particles
    this.beacon = el('g', { class: 'hint-beacon', display: 'none' }, this.layers.fx);
    el('circle', { r: 60, fill: 'none', stroke: '#fff6c8', 'stroke-width': 8, opacity: 0.9 }, this.beacon);
    el('circle', { r: 86, fill: 'none', stroke: '#ffd35c', 'stroke-width': 5, opacity: 0.6, 'stroke-dasharray': '10 14' }, this.beacon);
    this.meter = this._buildMeter(this.layers.fx);
    this.handGroup = el('g', { class: 'tutorial-hand-wrap', display: 'none' }, this.layers.fx);
    this.handMotion = el('path', { d: 'M-70 -30 Q -90 0 -70 30 M70 -30 Q 90 0 70 30', fill: 'none', stroke: '#fff', 'stroke-width': 7, 'stroke-linecap': 'round', opacity: 0.85 }, this.handGroup);
    this.handInner = el('g', {}, this.handGroup);
    createPointingHand(this.handInner);
    this.particleLayer = el('g', { class: 'particles' }, this.layers.fx);
    this.burstLayer = el('g', { class: 'bursts' }, this.layers.fx);
    this.bursts = [];

    this._buildHud();
    this._buildIris();
  }

  _buildDefs() {
    const d = this.defs;
    const u = this.uid;
    const glow = el('radialGradient', { id: `${u}-pointer-glow` }, d);
    el('stop', { offset: 0, 'stop-color': '#fffbe0', 'stop-opacity': 0.95 }, glow);
    el('stop', { offset: 0.45, 'stop-color': '#ffe58a', 'stop-opacity': 0.55 }, glow);
    el('stop', { offset: 1, 'stop-color': '#ffd35c', 'stop-opacity': 0 }, glow);
    const glow2 = el('radialGradient', { id: `${u}-pointer-glow-2` }, d);
    el('stop', { offset: 0, 'stop-color': '#fff0f6', 'stop-opacity': 0.95 }, glow2);
    el('stop', { offset: 0.45, 'stop-color': '#ffb3c8', 'stop-opacity': 0.55 }, glow2);
    el('stop', { offset: 1, 'stop-color': '#ff8fab', 'stop-opacity': 0 }, glow2);
    const bglow = el('radialGradient', { id: `${u}-bonus-glow` }, d);
    el('stop', { offset: 0, 'stop-color': '#fff6c8', 'stop-opacity': 0.9 }, bglow);
    el('stop', { offset: 1, 'stop-color': '#ffcf7a', 'stop-opacity': 0 }, bglow);
    // particle symbols: shapes inherit fill from the <use>
    const sym = (name) => el('g', { id: `${u}-p-${name}` }, d);
    el('path', { d: HEART_PATH, stroke: INK, 'stroke-width': 2.5 }, sym('heart'));
    el('path', { d: starPath(14), stroke: INK, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, sym('star'));
    el('path', { d: 'M0 -14 Q 2 -2 14 0 Q 2 2 0 14 Q -2 2 -14 0 Q -2 -2 0 -14 Z' }, sym('sparkle'));
    el('rect', { x: -6, y: -3.5, width: 12, height: 7, rx: 2 }, sym('confetti'));
    el('circle', { r: 11, opacity: 0.75 }, sym('dust'));
    el('path', { d: 'M0 -10 Q 10 0 0 10 Q -10 0 0 -10 Z', stroke: INK, 'stroke-width': 2 }, sym('leaf'));
    const bub = sym('bubble');
    el('circle', { r: 11, 'fill-opacity': 0.35, stroke: '#fff', 'stroke-width': 3 }, bub);
    el('circle', { cx: -4, cy: -4, r: 3, fill: '#fff' }, bub);
    el('path', { d: 'M0 -10 Q 7 0 0 8 Q -7 0 0 -10 Z', stroke: INK, 'stroke-width': 1.5 }, sym('drop'));
    const note = sym('note');
    el('path', { d: 'M-2 6 L-2 -12 L10 -15 L10 3', fill: 'none', stroke: INK, 'stroke-width': 3 }, note);
    el('ellipse', { cx: -6, cy: 7, rx: 5, ry: 4, stroke: INK, 'stroke-width': 2 }, note);
    el('ellipse', { cx: 6, cy: 4, rx: 5, ry: 4, stroke: INK, 'stroke-width': 2 }, note);
  }

  _buildMeter(parent) {
    const g = el('g', { class: 'scratch-meter', display: 'none' }, parent);
    el('rect', { x: -94, y: -17, width: 188, height: 34, rx: 17, fill: '#fff8ea', stroke: INK, 'stroke-width': 5 }, g);
    const fillClip = el('clipPath', { id: `${this.uid}-meter-clip` }, this.defs);
    el('rect', { x: -88, y: -11, width: 176, height: 22, rx: 11 }, fillClip);
    const fillG = el('g', { 'clip-path': `url(#${this.uid}-meter-clip)` }, g);
    const fill = el('rect', { x: -88, y: -11, width: 0, height: 22, fill: '#ff8fab' }, fillG);
    const shine = el('rect', { x: -88, y: -9, width: 0, height: 6, rx: 3, fill: '#fff', opacity: 0.5 }, fillG);
    const heart = el('path', { d: HEART_PATH, fill: '#ff6f8a', stroke: INK, 'stroke-width': 3.5, transform: 'translate(-100 2) scale(1.3)' }, g);
    return { g, fill, shine, heart };
  }

  _buildHud() {
    const hud = this.layers.hud;
    this.hudGroup = el('g', { class: 'paw-progress', transform: `translate(${W / 2} 58)` }, hud);
    this.hudBg = el('rect', { x: -250, y: -40, width: 500, height: 80, rx: 40, fill: '#fff8ea', stroke: INK, 'stroke-width': 5, opacity: 0.92 }, this.hudGroup);
    this.pawSlots = [];
    for (let i = 0; i < 6; i += 1) {
      const slot = el('g', {}, this.hudGroup);
      el('circle', { r: 28, fill: '#efe3ff', stroke: '#c9b8f0', 'stroke-width': 4, 'stroke-dasharray': '6 6' }, slot);
      const paw = createPaw(slot, { fill: '#7fb2ea', strokeWidth: 4 });
      this.pawSlots.push({ slot, paw, filledAt: -1 });
    }
    this.badgeGroup = el('g', {}, this.hudGroup);
    this.badges = [];
    this._layoutHud(6);
  }

  _layoutHud(n) {
    const count = clamp(Math.round(n) || 6, 1, 12);
    while (this.pawSlots.length < count) {
      const slot = el('g', {}, this.hudGroup);
      el('circle', { r: 28, fill: '#efe3ff', stroke: '#c9b8f0', 'stroke-width': 4, 'stroke-dasharray': '6 6' }, slot);
      const paw = createPaw(slot, { fill: '#7fb2ea', strokeWidth: 4 });
      this.pawSlots.push({ slot, paw, filledAt: -1 });
    }
    const gap = 74;
    const width = count * gap;
    this.pawSlots.forEach((s, i) => {
      setVisible(s.slot, i < count);
      setTransform(s.slot, `translate(${r2(-width / 2 + gap / 2 + i * gap)} 0)`);
    });
    setAttr(this.hudBg, 'x', -width / 2 - 20);
    setAttr(this.hudBg, 'width', width + 40);
    this.hudWidth = width;
    this.hudCount = count;
  }

  _buildIris() {
    const g = this.layers.iris;
    this.iris = el('circle', { cx: W / 2, cy: H / 2, r: 2000, fill: 'none', stroke: '#c9b8f0', 'stroke-width': 2400 }, g);
    this.irisRim = el('circle', { cx: W / 2, cy: H / 2, r: 900, fill: 'none', stroke: INK, 'stroke-width': 10 }, g);
    this.irisPaw = createPaw(g, { fill: '#7fb2ea', strokeWidth: 6 });
    setVisible(this.iris, false);
    setVisible(this.irisRim, false);
    setVisible(this.irisPaw, false);
  }

  _buildKite(parent) {
    const g = el('g', {}, parent);
    el('path', { d: 'M0 -60 Q 60 -160 120 -260', fill: 'none', stroke: INK, 'stroke-width': 2.5 }, g);
    el('path', { d: 'M120 -330 L170 -260 L120 -190 L70 -260 Z', fill: '#ff6f61', stroke: INK, 'stroke-width': 5 }, g);
    el('path', { d: 'M120 -330 L120 -190 M70 -260 L170 -260', stroke: '#ffd35c', 'stroke-width': 5 }, g);
    el('path', { d: 'M120 -190 q -14 20 0 40 q 14 20 0 40', fill: 'none', stroke: INK, 'stroke-width': 3 }, g);
    return g;
  }

  _buildBalloonBunch(parent) {
    const g = el('g', {}, parent);
    [[-40, -230, '#ff8f9e'], [10, -260, '#ffd35c'], [55, -220, '#8fd0f5'], [-5, -200, '#9be08f']].forEach(([x, y, c]) => {
      el('path', { d: `M0 -40 Q ${x / 2} ${(y - 40) / 2} ${x} ${y + 32}`, fill: 'none', stroke: INK, 'stroke-width': 2.5 }, g);
      el('ellipse', { cx: x, cy: y, rx: 30, ry: 36, fill: c, stroke: INK, 'stroke-width': 5 }, g);
    });
    return g;
  }

  _buildDinoHood(parent) {
    const g = el('g', {}, parent);
    el('path', { d: 'M-70 -170 Q 0 -260 70 -170 L60 -120 L-60 -120 Z', fill: '#7fcf6a', stroke: INK, 'stroke-width': 6 }, g);
    for (let i = 0; i < 5; i += 1) el('path', { d: `M${-48 + i * 24} ${-196 - (i === 2 ? 26 : i % 2 ? 18 : 6)} l12 -26 l12 26 Z`, fill: '#ffd35c', stroke: INK, 'stroke-width': 4 }, g);
    el('path', { d: 'M50 40 Q 130 60 150 0 Q 120 30 60 10 Z', fill: '#7fcf6a', stroke: INK, 'stroke-width': 6 }, g);
    return g;
  }

  /* ------------------------------------------------------- scene build */

  _buildScene(sceneId) {
    const scene = SCENES[sceneId] || SCENES.backyard;
    this.scene = scene;
    this.sceneId = sceneId;
    for (const key of ['bgFar', 'bgNear', 'props', 'occluders']) {
      const layer = this.layers[key];
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    }
    while (this.sceneDefs.firstChild) this.sceneDefs.removeChild(this.sceneDefs.firstChild);
    this.svg.setAttribute('data-scene', scene.id);
    this.ambient = buildBackground(scene.id, scene.palette, { far: this.layers.bgFar, near: this.layers.bgNear, defs: this.sceneDefs }) || [];
    this.ambient.forEach((a) => a.update(0));

    // props
    this.propUpdaters.clear();
    for (const prop of scene.props) {
      const g = el('g', { class: `prop prop-${prop.kind}`, 'data-prop': prop.id, transform: `translate(${r2(prop.x * W)} ${r2(prop.y * H)})` }, this.layers.props);
      const inner = el('g', {}, g);
      const update = paintProp(prop.kind, inner, prop.w * W, prop.h * H);
      this.propUpdaters.set(prop.id, { update, g: inner, prop });
      update(0, null);
    }

    // occluders, painter's order by bottom edge (farther first)
    this.occluders.clear();
    this.occluderOrder = [];
    const ordered = [...scene.spots].sort((a, b) => (a.occluder.y + a.occluder.h / 2) - (b.occluder.y + b.occluder.h / 2));
    for (const spot of ordered) {
      const o = spot.occluder;
      const rect = { x: o.x * W, y: o.y * H, w: o.w * W, h: o.h * H };
      const id = `${this.uid}-occ-${spot.id}`;
      const g = el('g', { id, class: `occluder occluder-${spot.kind}`, 'data-spot': spot.id, transform: `translate(${r2(rect.x)} ${r2(rect.y)})` }, this.layers.occluders);
      const shake = el('g', {}, g);
      paintOccluder(spot.kind, shake, rect.w, rect.h, scene.id);
      this.occluders.set(spot.id, { g, shake, rect, spot, id });
      this.occluderOrder.push(spot.id);
    }
    this.spotId = null;
    this.hidePlacementCache = new Map();
  }

  _spot(snapshot) {
    if (!this.scene || !snapshot.spotId) return null;
    return this.scene.spots.find((s) => s.id === snapshot.spotId) || null;
  }

  /* ---------------------------------------------------- public API */

  handleEvents(events) {
    if (!Array.isArray(events)) return;
    for (const ev of events) {
      if (!ev || typeof ev.type !== 'string') continue;
      const x = Number.isFinite(ev.x) ? ev.x * W : null;
      const y = Number.isFinite(ev.y) ? ev.y * H : null;
      switch (ev.type) {
        case 'found':
          if (x !== null) { this._burst(x, y, 'star', 12, { speed: 420, colors: ['#ffd35c', '#fff3a0'] }); this._ring(x, y, '#ffd35c'); }
          break;
        case 'scratch':
          if (x !== null) { this._burst(x, y - 60, 'heart', 14, { speed: 360, colors: ['#ff6f8a', '#ff9ab3'], up: true }); this._burst(x, y, 'sparkle', 10, { speed: 300, colors: ['#fff', '#ffe58a'] }); }
          break;
        case 'bonusAppeared':
          if (x !== null) { this._burst(x, y, 'sparkle', 14, { speed: 320, colors: ['#ffd35c', '#ffb36b', '#fff'] }); this._ring(x, y, '#ffb36b'); }
          break;
        case 'bonusHit':
          if (x !== null) { this._burst(x, y, 'star', 18, { speed: 520, colors: CONFETTI }); this._burst(x, y, 'confetti', 20, { speed: 480, colors: CONFETTI }); this._ring(x, y, '#b9a2f5', 1.6); }
          break;
        case 'bonusMiss':
          if (x !== null) this._burst(x, y - 40, 'note', 5, { speed: 160, colors: ['#ffb36b', '#ff9ab3'], up: true });
          break;
        case 'prop':
          if (x !== null) this._propBurst(ev.kind, x, y);
          break;
        case 'celebration':
          this._burst(W / 2, H * 0.3, 'confetti', 50, { speed: 700, colors: CONFETTI, spread: W * 0.6 });
          this._burst(W / 2, H * 0.55, 'heart', 10, { speed: 420, colors: ['#ff6f8a', '#ff9ab3'], up: true });
          break;
        case 'hint':
          if (x !== null) this._burst(x, y + 30, this.sceneId === 'bedroom' || this.sceneId === 'lounge' ? 'sparkle' : 'leaf', 6, { speed: 180, colors: ['#7cc76a', '#e9a23b', '#ffd35c'] });
          break;
        default:
          break;
      }
    }
  }

  render(snapshot, pointers = [], { debug = false, fps = 60, landmarks = [] } = {}) {
    if (!snapshot) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = this.lastNow ? clamp(now - this.lastNow, 0, 100) : 16;
    this.lastNow = now;
    this.clock += dt;
    const t = this.clock;
    this.gameNow = Number.isFinite(snapshot.elapsedMs) ? snapshot.elapsedMs : this.clock;
    const pts = Array.isArray(pointers) ? pointers.filter((p) => p && p.active && Number.isFinite(p.x) && Number.isFinite(p.y)) : [];

    if (snapshot.sceneId !== this.sceneId && SCENES[snapshot.sceneId]) this._buildScene(snapshot.sceneId);
    if (!this.scene) this._buildScene('backyard');

    const state = snapshot.state;
    if (state !== this.prevState) this._onStateChange(this.prevState, state, snapshot);

    if (!this.reducedMotion) this.ambient.forEach((a) => a.update(t));
    this._renderProps(snapshot, t);
    this._renderCameo(snapshot, pts, t);
    this._renderBlue(snapshot, pts, t);
    this._renderBonus(snapshot, pts, t);
    this._renderCelebration(snapshot, t);
    this._renderGuidance(snapshot, pts, t);
    this._renderHud(snapshot, t);
    this._renderIris(snapshot, t);
    this._renderPointers(pts, snapshot, t);
    this._updateParticles(dt);
    this._renderDebug(debug, snapshot, pts, fps, landmarks);

    this.prevState = state;
    this.prevProgress = snapshot.dog ? snapshot.dog.progress || 0 : 0;
    this.prevPaws = snapshot.paws || 0;
  }

  destroy() {
    if (this.root.parentNode === this.svg) this.svg.removeChild(this.root);
    this.particles = [];
    this.pointerEls.clear();
    this.occluders.clear();
    this.propUpdaters.clear();
  }

  /* -------------------------------------------------- state changes */

  _onStateChange(prev, state, snap) {
    if (state === 'SCENE_TRANSITION') this.irisClosing = true;
    if (prev === 'SCENE_TRANSITION' && state !== 'SCENE_TRANSITION') { this.irisClosing = false; this.irisOpening = true; this.irisOpenStart = this.clock; }
    if (state === 'CELEBRATION') {
      // parents leave the background and join the party in front
      this.layers.celebration.insertBefore(this.celebParentsWrap, this.layers.celebration.firstChild);
      this.celebStart = this.clock;
      this.celebFrom = { ...this.lastDogPos };
    }
    if (state === 'HIDING') this.hideStart = this.clock;
    if (state === 'REVEALED') this.lastProgressAt = this.gameNow;
    if (prev === 'CELEBRATION') { setVisible(this.celebOrangeWrap, false); setVisible(this.celebParentsWrap, false); }
    void snap;
  }

  /* ------------------------------------------------------ blue dog */

  _hidePlacement(spot, hint, extra) {
    // Returns {x,y,rot,flip, own, band} in stage px for the hidden dog.
    const occ = this.occluders.get(spot.id);
    const r = occ.rect;
    const left = r.x - r.w / 2;
    const right = r.x + r.w / 2;
    const top = r.y - r.h / 2;
    const bottom = r.y + r.h / 2;
    const s = DOG_SCALE;
    const pose = String(spot.pose || 'earsOnly');
    const lvl = clamp(hint || 0, 0, 4);
    let x = r.x;
    let y = r.y;
    let rot = 0;
    let flip = 1;
    let band;
    let e;
    const side = this._freeSide(spot, pose);
    if (/peek/i.test(pose)) {
      e = [18, 26, 42, 56, 82][lvl] + extra;
      const headY = top + clamp(r.h * 0.32, 75, 170);
      if (side < 0) {
        x = left - e + 66;
        rot = -18;
        band = { x: left - HIDE_BAND, y: top - HIDE_BAND, w: HIDE_BAND, h: r.h + HIDE_BAND };
      } else {
        x = right + e - 66;
        rot = 18;
        band = { x: right, y: top - HIDE_BAND, w: HIDE_BAND, h: r.h + HIDE_BAND };
      }
      y = headY + 92 * s;
    } else if (/tail/i.test(pose)) {
      e = [12, 20, 36, 52, 76][lvl] + extra;
      flip = side;
      x = side > 0 ? right - 66 + e : left + 66 - e;
      y = clamp(r.y + 10, top + 120 * s, bottom - 40 * s);
      band = side > 0 ? { x: right, y: top - 40, w: HIDE_BAND, h: r.h + 40 } : { x: left - HIDE_BAND, y: top - 40, w: HIDE_BAND, h: r.h + 40 };
    } else if (/under/i.test(pose)) {
      e = [16, 24, 40, 54, 80][lvl] + extra;
      rot = side > 0 ? 90 : -90;
      x = side > 0 ? right - 56 + e - 96 * s : left + 56 - e + 96 * s;
      y = Math.max(r.y, bottom - 44 * s * 1.0 - 8);
      band = side > 0 ? { x: right, y: top - 60, w: HIDE_BAND, h: r.h + 64 } : { x: left - HIDE_BAND, y: top - 60, w: HIDE_BAND, h: r.h + 64 };
    } else if (/upside/i.test(pose)) {
      e = [20, 28, 44, 62, 92][lvl] + extra;
      rot = 180;
      y = top - e + KID_EXTENTS.feetY * s;
      x = clamp(spot.x * W, left + 60, right - 60);
      band = { x: left, y: top - HIDE_BAND, w: r.w, h: HIDE_BAND };
    } else {
      const base = /top|head/i.test(pose) ? [40, 48, 64, 80, 104] : [30, 38, 54, 70, 92];
      e = base[lvl] + extra;
      x = clamp(spot.x * W, left + 70 * s, right - 70 * s);
      y = top - e - KID_EXTENTS.earTop * s;
      band = { x: left - 20, y: top - HIDE_BAND, w: r.w + 40, h: HIDE_BAND };
    }
    return { x, y, rot, flip, own: r, band };
  }

  _freeSide(spot, pose) {
    // choose the side with the least overlap from neighbouring occluders
    const key = `${spot.id}:${pose}`;
    if (this.hidePlacementCache.has(key)) return this.hidePlacementCache.get(key);
    let pref = /left/i.test(pose) ? -1 : /right/i.test(pose) ? 1 : (spot.facing === 'left' ? -1 : 1);
    if (/under|tail/i.test(pose)) {
      const r = this.occluders.get(spot.id).rect;
      const probe = (dir) => {
        const box = { x: dir > 0 ? r.x + r.w / 2 + 50 : r.x - r.w / 2 - 50, y: r.y + r.h * 0.2, w: 100, h: 100 };
        let area = 0;
        if (box.x - 50 < 40 || box.x + 50 > W - 40) area += 1e6;
        for (const other of this.occluders.values()) {
          if (other.spot.id === spot.id) continue;
          const o = other.rect;
          const ox = Math.max(0, Math.min(box.x + 50, o.x + o.w / 2) - Math.max(box.x - 50, o.x - o.w / 2));
          const oy = Math.max(0, Math.min(box.y + 50, o.y + o.h / 2) - Math.max(box.y - 50, o.y - o.h / 2));
          area += ox * oy;
        }
        return area;
      };
      const a = probe(pref);
      const b = probe(-pref);
      if (b < a * 0.6) pref = -pref;
    }
    this.hidePlacementCache.set(key, pref);
    return pref;
  }

  _lookFrom(x, y, pts, lookAt) {
    let target = null;
    if (lookAt && Number.isFinite(lookAt.x)) target = { x: lookAt.x * W, y: lookAt.y * H };
    else if (pts.length) {
      let best = Infinity;
      for (const p of pts) {
        const d = (p.x * W - x) ** 2 + (p.y * H - y) ** 2;
        if (d < best) { best = d; target = { x: p.x * W, y: p.y * H }; }
      }
    }
    if (!target) return { x: Math.sin(this.clock / 1700) * 0.4, y: 0.1, dist: Infinity, target: null };
    const dx = target.x - x;
    const dy = target.y - y;
    return { x: clamp(dx / 260, -1, 1), y: clamp(dy / 260, -1, 1), dist: Math.hypot(dx, dy), target };
  }

  _placeBlue(holder, x, y, { rot = 0, scale = DOG_SCALE, flip = 1, opacity = 1 } = {}) {
    if (this.blueWrap.parentNode !== holder) holder.appendChild(this.blueWrap);
    setTransform(this.blueWrap, `translate(${r2(x)} ${r2(y)}) rotate(${r2(rot)}) scale(${r2(scale * flip)} ${r2(scale)})`);
    setAttr(this.blueWrap, 'opacity', r2(opacity));
    setVisible(this.blueWrap, opacity > 0.01);
  }

  _shadow(x, y, scale, visible) {
    setVisible(this.dogShadow, visible);
    if (!visible) return;
    setTransform(this.dogShadow, `translate(${r2(x)} ${r2(y)}) scale(${r2(scale)} 1)`);
  }

  _renderBlue(snap, pts, t) {
    const dog = snap.dog || {};
    const spot = this._spot(snap);
    const mode = dog.mode || 'hidden';
    const state = snap.state;
    const rm = this.reducedMotion ? 0.35 : 1;
    const s = DOG_SCALE;
    const standX = (dog.x ?? 0.5) * W;
    const standY = (dog.y ?? 0.6) * H - DOG_CENTER_Y * s; // rig origin so visual centre = dog.x,y
    const feetY = standY + KID_EXTENTS.feetY * s;
    const look = this._lookFrom(standX, standY - 96 * s, pts, dog.lookAt);
    const facingFlip = 1;
    const progress = clamp(dog.progress || 0, 0, 1);
    if (progress > this.prevProgress + 0.001) {
      this.lastProgressAt = this.gameNow;
      this._scratchSparkles(standX, standY, progress - this.prevProgress, look.target);
    }
    if (mode !== this.prevMode) this._onModeChange(this.prevMode, mode, snap, spot);
    this.prevMode = mode;

    // hide occluder stack by default
    let hiding = false;
    const occForHint = spot ? this.occluders.get(spot.id) : null;
    this.occluders.forEach((o) => setTransform(o.shake, ''));

    if (state === 'CELEBRATION') {
      this._shadow(0, 0, 1, false);
      this._setHiddenStack(null);
      return; // handled by _renderCelebration
    }

    if ((mode === 'hidden' || state === 'SCENE_INTRO') && state !== 'HIDING') {
      this._setHiddenStack(null);
      // attract / intro: wave from the front, then scamper to the hiding spot
      const centerX = W * 0.5;
      const centerY = H * 0.6 - DOG_CENTER_Y * s;
      const elapsed = snap.stateElapsedMs || 0;
      const started = Boolean(spot) && elapsed > 0;
      const runK = started ? clamp((elapsed - 950) / 600, 0, 1) : 0;
      if (started && runK > 0 && spot) {
        const p = this._hidePlacement(spot, 0, 0);
        const k = easeOut(runK);
        const x = lerp(centerX, p.x, k);
        const y = lerp(centerY, p.y, k) - Math.sin(k * Math.PI) * 80 * rm;
        this._placeBlue(this.layers.front, x, y, { scale: s * (1 - 0.35 * k), opacity: 1 - clamp((runK - 0.75) * 4, 0, 1), flip: p.x < centerX ? -1 : 1 });
        this.blue.pose({ t, run: 1, wag: 0.8, look: { x: p.x < centerX ? -1 : 1, y: 0 }, mouth: 'open', earPerk: 1 });
        this._shadow(x, centerY + KID_EXTENTS.feetY * s, 1 - 0.35 * k, runK < 0.8);
        this.lastDogPos = { x, y };
      } else {
        const hop = this.reducedMotion ? 0 : Math.abs(Math.sin(t / 380)) * 14;
        this._placeBlue(this.layers.front, centerX, centerY, { scale: s });
        this.blue.pose({ t, wave: 1, wag: 0.8, lift: hop, look, mouth: 'open', happy: 0, earPerk: 0.8 });
        this._shadow(centerX, centerY + KID_EXTENTS.feetY * s, 1 - hop / 80, true);
        this.lastDogPos = { x: centerX, y: centerY };
      }
      this._setOccluderHint(occForHint, 0, t);
      return;
    }

    if (state === 'HIDING' && spot && this.occluders.has(spot.id)) {
      hiding = true;
      const sinceHide = this.clock - (this.hideStart || 0);
      const duck = clamp(sinceHide / 450, 0, 1);
      const hint = dog.hintLevel || 0;
      // periodic peek-out bob makes the clue noticeable without text
      const period = Math.max(1400, 3200 - hint * 450);
      const ph = (t % period) / period;
      const bob = this.reducedMotion ? 0 : (ph > 0.8 ? Math.sin(((ph - 0.8) / 0.2) * Math.PI) * (10 + hint * 6) : 0);
      const extra = -70 * (1 - easeOut(duck)) + bob;
      const p = this._hidePlacement(spot, hint, extra);
      this._setHiddenStack(spot, p);
      this._placeBlue(this.hiddenDogHolder, p.x, p.y, { rot: p.rot, flip: p.flip });
      const hiddenLook = this._lookFrom(p.x, p.y - 96 * s, pts, null);
      const lx = p.rot === 180 ? -hiddenLook.x : hiddenLook.x;
      this.blue.pose({
        t, look: { x: lx * p.flip, y: hiddenLook.y }, wag: 0.5 + hint * 0.12, earPerk: 0.6,
        kick: /upside/i.test(spot.pose) ? 0.5 + hint * 0.1 : 0, tailAngle: /tail/i.test(spot.pose) ? 45 : 0, mouth: hint >= 3 ? 'o' : 'smile', wide: hint >= 2,
        headTilt: Math.sin(t / 500) * 6,
      });
      this._shadow(0, 0, 1, false);
      this._setOccluderHint(occForHint, hint, t);
      this.lastDogPos = { x: standX, y: standY };
      return;
    }
    if (!hiding) this._setHiddenStack(null);

    // revealed / scratching / reaction
    let x = standX;
    let y = standY;
    let rot = 0;
    let sc = s;
    let opacity = 1;
    const params = { t, look: { x: look.x * facingFlip, y: look.y }, wag: 0.35, earPerk: 0.6 };
    const elapsed = snap.stateElapsedMs || 0;

    if (mode === 'revealing' && spot && this.occluders.has(spot.id)) {
      const k = clamp(elapsed / 450, 0, 1);
      const from = this._hidePlacement(spot, dog.hintLevel || 0, 0);
      const style = String(dog.reveal || spot.reveal || 'popUp');
      const e = easeOutBack(k);
      if (/jump/i.test(style)) {
        x = lerp(from.x, standX, easeOut(k));
        y = lerp(from.y, standY, k) - Math.sin(k * Math.PI) * 110 * rm;
        params.armsUp = 1 - k;
        params.squash = k > 0.85 ? 0.85 : 1.08;
      } else if (/crawl/i.test(style)) {
        x = lerp(from.x, standX, easeOut(k));
        y = standY + (1 - k) * 40;
        rot = (1 - k) * (from.x < standX ? 40 : -40) * rm;
        params.run = 1 - k;
      } else if (/slide/i.test(style)) {
        const dir = from.x < standX ? -1 : 1;
        x = standX + dir * (1 - easeOut(k)) * 180 * rm;
        rot = dir * (1 - k) * 18;
        params.armsUp = 1 - k;
      } else if (/roll/i.test(style)) {
        const dir = from.x < standX ? -1 : 1;
        x = standX + dir * (1 - easeOut(k)) * 200 * rm;
        rot = -dir * (1 - easeOut(k)) * 360 * rm;
      } else {
        y = standY + (1 - e) * 120 * rm;
        params.squash = 1 + Math.sin(k * Math.PI) * 0.15;
      }
      params.wide = true;
      params.mouth = 'open';
      params.earPerk = 1;
      params.wag = 1;
    } else if (mode === 'waiting' || mode === 'scratching' || state === 'REVEALED' || state === 'SCRATCHING') {
      const near = look.dist < 260;
      const sincePet = this.gameNow - this.lastProgressAt;
      const active = mode === 'scratching' && sincePet < 400;
      params.wag = 0.35 + progress * 0.65 + (near ? 0.2 : 0);
      params.kick = progress > 0.45 && active ? (progress - 0.45) * 1.8 : 0;
      params.happy = active && progress > 0.25 ? 1 : 0;
      params.mouth = active ? (progress > 0.6 ? 'open' : 'tongue') : near ? 'o' : 'smile';
      params.wide = near && !active;
      params.earPerk = active ? -0.6 : 1;
      params.headTilt = active ? Math.sin(t / 140) * 8 * rm : 0;
      params.squash = active ? 1 + Math.sin(t / 55) * 0.04 * (0.5 + progress) * rm : 1;
      params.tilt = active ? Math.sin(t / 90) * 4 * progress * rm : 0;
      if (!near && !active && sincePet > 2200) params.wave = 1; // invite the child back
      if (snap.paused) { params.wave = 0; params.look = { x: Math.sin(t / 600), y: -0.2 }; params.mouth = 'o'; }
    } else if (mode === 'reaction') {
      this._reactionPose(String(dog.reaction || 'happyBounce'), elapsed, t, params, rm);
      y -= params.lift || 0;
      rot = params.rot || 0;
      params.lift = 0;
    } else if (mode === 'exit') {
      const exitMs = 630;
      const start = 1800 - exitMs;
      const k = clamp((elapsed - start) / exitMs, 0, 1);
      const ex = String(dog.exit || 'runRight');
      params.wag = 1;
      params.mouth = 'open';
      if (/runLeft|runRight/i.test(ex)) {
        const dir = /left/i.test(ex) ? -1 : 1;
        x = standX + dir * easeOut(k) * 520 * (0.4 + 0.6 * rm);
        params.run = 1;
        params.look = { x: dir, y: 0 };
        params.lift = Math.abs(Math.sin(t / 70)) * 8;
        opacity = 1 - clamp((k - 0.55) / 0.45, 0, 1);
      } else if (/dive/i.test(ex)) {
        y = standY - Math.sin(k * Math.PI) * 140 * rm + k * 120;
        rot = k * 160 * rm;
        sc = s * (1 - 0.5 * k);
        opacity = 1 - clamp((k - 0.6) / 0.4, 0, 1);
        params.armsUp = 1;
      } else if (/duck/i.test(ex)) {
        params.squash = 1 - 0.35 * Math.min(1, k * 3);
        y = standY + easeOut(k) * 160;
        opacity = 1 - clamp((k - 0.5) / 0.5, 0, 1);
        params.happy = 1;
      } else {
        const dir = standX < W / 2 ? 1 : -1;
        x = standX + dir * k * 420;
        y = standY - Math.abs(Math.sin(k * Math.PI * 3)) * 120 * rm;
        sc = s * (1 - 0.3 * k);
        opacity = 1 - clamp((k - 0.6) / 0.4, 0, 1);
        params.armsUp = 0.6;
        params.happy = 1;
      }
    }
    this._placeBlue(this.layers.front, x, y, { rot, scale: sc, opacity });
    this.blue.pose(params);
    this._shadow(x, feetY + 4, (sc / s) * (1 - clamp((standY - y) / 400, 0, 0.5)), opacity > 0.3 && mode !== 'exit');
    this._setOccluderHint(occForHint, 0, t);
    this.lastDogPos = { x, y };
  }

  _reactionPose(reaction, elapsed, t, p, rm) {
    const k = clamp(elapsed / 1170, 0, 1);
    p.happy = 1;
    p.wag = 1;
    p.earPerk = 0.4;
    switch (reaction) {
      case 'legKick':
        p.kick = 1;
        p.mouth = 'tongue';
        p.tilt = -6;
        p.headTilt = -10;
        break;
      case 'tailWag':
        p.wag = 1;
        p.lift = Math.abs(Math.sin(t / 120)) * 14 * rm;
        p.tilt = Math.sin(t / 90) * 6 * rm;
        p.mouth = 'open';
        p.happy = 0;
        p.wide = true;
        break;
      case 'rollOver':
        p.rot = easeOut(k) * 360 * (rm > 0.5 ? 1 : 0);
        p.lift = Math.sin(k * Math.PI) * 40 * rm;
        p.armsUp = 1;
        p.kick = 0.6;
        p.mouth = 'open';
        break;
      case 'happyBounce': {
        const b = Math.abs(Math.sin(k * Math.PI * 3));
        p.lift = b * 70 * rm;
        p.squash = b < 0.15 ? 0.82 : 1.06;
        p.armsUp = b;
        p.mouth = 'open';
        break;
      }
      case 'tongueOut':
        p.mouth = 'tongue';
        p.headTilt = Math.sin(t / 200) * 16 * rm;
        p.earWiggle = 1;
        break;
      case 'shake':
        p.tilt = Math.sin(t / 30) * 10 * rm * (1 - k * 0.5);
        p.earWiggle = 2;
        p.headTilt = Math.sin(t / 25) * 10 * rm;
        p.mouth = 'o';
        p.happy = 0;
        p.wide = true;
        break;
      case 'laugh':
      default:
        p.mouth = 'open';
        p.headTilt = -14;
        p.tilt = Math.sin(t / 60) * 3 * rm;
        p.lift = Math.abs(Math.sin(t / 90)) * 6 * rm;
        p.armSwing = Math.sin(t / 80) * 20;
        break;
    }
  }

  _onModeChange(prev, mode, snap) {
    const dog = snap.dog || {};
    const x = (dog.x ?? 0.5) * W;
    const y = (dog.y ?? 0.6) * H;
    if (mode === 'exit') this._burst(x, y + 90, 'dust', 8, { speed: 240, colors: ['#fff', '#efe3c8'] });
    if (mode === 'revealing') this._burst(x, y + 40, 'dust', 6, { speed: 200, colors: ['#fff', '#efe3c8'] });
    void prev;
  }

  _setHiddenStack(spot, placement) {
    if (!spot) {
      setVisible(this.layers.hidden, false);
      this.spotId = null;
      return;
    }
    setVisible(this.layers.hidden, true);
    const occ = this.occluders.get(spot.id);
    if (this.spotId !== spot.id) {
      this.spotId = spot.id;
      this.ownOccluderUse.setAttribute('href', `#${occ.id}`);
      while (this.overUses.firstChild) this.overUses.removeChild(this.overUses.firstChild);
      const idx = this.occluderOrder.indexOf(spot.id);
      for (const otherId of this.occluderOrder.slice(idx + 1)) {
        const other = this.occluders.get(otherId);
        const a = occ.rect;
        const b = other.rect;
        const overlap = Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
        if (overlap) el('use', { href: `#${other.id}` }, this.overUses);
      }
    }
    const r = placement.own;
    const inset = Math.min(r.w, r.h) * 0.08;
    setAttr(this.hideClipOwn, 'x', r2(r.x - r.w / 2 + inset));
    setAttr(this.hideClipOwn, 'y', r2(r.y - r.h / 2 + inset));
    setAttr(this.hideClipOwn, 'width', r2(r.w - inset * 2));
    setAttr(this.hideClipOwn, 'height', r2(r.h - inset * 2));
    setAttr(this.hideClipOwn, 'rx', r2(Math.min(r.w, r.h) * 0.2));
    const b = placement.band;
    setAttr(this.hideClipBand, 'x', r2(b.x));
    setAttr(this.hideClipBand, 'y', r2(b.y));
    setAttr(this.hideClipBand, 'width', r2(b.w));
    setAttr(this.hideClipBand, 'height', r2(b.h));
    // copy of the own occluder drawn above the dog, limited to its own box
    setAttr(this.ownClipRect, 'x', r2(r.x - r.w / 2 - 4));
    setAttr(this.ownClipRect, 'y', r2(r.y - r.h / 2 - 4));
    setAttr(this.ownClipRect, 'width', r2(r.w + 8));
    setAttr(this.ownClipRect, 'height', r2(r.h + 8));
  }

  _setOccluderHint(occ, hint, t) {
    if (!occ) { setVisible(this.beacon, false); return; }
    const rm = this.reducedMotion ? 0.25 : 1;
    let a = 0;
    if (hint >= 1) {
      // rustle bursts every ~1.6s, stronger at higher levels
      const burst = (t % 1600) / 1600;
      const amp = hint >= 4 ? 5 : hint >= 3 ? 3 : 1.8;
      a = burst < 0.25 ? Math.sin(burst * 4 * Math.PI * 6) * amp * rm : 0;
      if (hint >= 4) a += Math.sin(t / 70) * 1.2 * rm;
    }
    const h = occ.rect.h;
    setTransform(occ.shake, a ? `rotate(${r2(a)} 0 ${r2(h / 2)})` : '');
    const showBeacon = hint >= 3 && this.prevState === 'HIDING';
    setVisible(this.beacon, showBeacon);
    if (showBeacon) {
      const pulse = this.reducedMotion ? 1 : 1 + Math.sin(t / 260) * 0.12;
      setTransform(this.beacon, `translate(${r2(occ.rect.x)} ${r2(occ.rect.y)}) scale(${r2(pulse * Math.max(occ.rect.w, occ.rect.h * 0.6) / 160)})`);
      setAttr(this.beacon, 'opacity', hint >= 4 ? 0.95 : 0.6);
    }
  }

  /* --------------------------------------------------------- bonus */

  _renderBonus(snap, pts, t) {
    const b = snap.bonus;
    if (!b || snap.state === 'CELEBRATION') { setVisible(this.bonusWrap, false); return; }
    setVisible(this.bonusWrap, true);
    const rm = this.reducedMotion ? 0.35 : 1;
    const s = BONUS_SCALE;
    const x = b.x * W;
    const y = b.y * H - DOG_CENTER_Y * s;
    const age = b.ageMs || 0;
    const pose = String(b.pose || 'popUp');
    const look = this._lookFrom(x, y - 96 * s, pts, null);
    const params = { t, look, wag: 1, earPerk: 1, mouth: 'open', wide: true };
    let dx = 0;
    let dy = 0;
    let rot = 0;
    let opacity = 1;
    let scale = s;
    const appear = clamp(age / 280, 0, 1);
    if (b.active) {
      const e = easeOutBack(appear);
      if (/left/i.test(pose)) { dx = (1 - e) * 120 * rm; rot = -14 * (1 - appear) - 6; }
      else if (/right/i.test(pose)) { dx = -(1 - e) * 120 * rm; rot = 14 * (1 - appear) + 6; }
      else dy = (1 - e) * 150 * rm;
      scale = s * (0.4 + 0.6 * e);
      params.lift = Math.abs(Math.sin(t / 150)) * 16 * rm;
      params.wave = 1;
      params.headTilt = Math.sin(t / 180) * 8;
      setAttr(this.bonusGlow, 'opacity', r2(0.65 + Math.sin(t / 120) * 0.2));
      setAttr(this.bonusRing, 'opacity', 0);
    } else if (b.hit) {
      const k = clamp((age - (b.totalMs - (b.remainingMs || 0))) / 800, 0, 1);
      params.happy = 1;
      params.armsUp = 1;
      params.lift = Math.abs(Math.sin(t / 110)) * 40 * rm;
      params.squash = 1.05;
      opacity = 1 - clamp((k - 0.6) / 0.4, 0, 1);
      setAttr(this.bonusGlow, 'opacity', 0.9);
      setAttr(this.bonusRing, 'opacity', r2(opacity));
      setTransform(this.bonusRing, `translate(0 ${r2(-170 * s - 30)}) scale(${r2(1.2 + Math.sin(t / 100) * 0.1)}) rotate(${r2(t / 8 % 360)})`);
    } else {
      // missed: giggle and pop away, never sad
      const k = clamp((age - (b.totalMs || 1500)) / 650, 0, 1);
      params.happy = 1;
      params.mouth = 'open';
      params.tilt = Math.sin(t / 50) * 6 * rm;
      params.headTilt = -12;
      dy = easeOut(k) * 140 * rm;
      scale = s * (1 - 0.5 * k);
      opacity = 1 - k;
      setAttr(this.bonusGlow, 'opacity', r2(0.4 * (1 - k)));
      setAttr(this.bonusRing, 'opacity', 0);
    }
    setTransform(this.bonusWrap, `translate(${r2(x + dx)} ${r2(y + dy)})`);
    setTransform(this.bonusGlow, `translate(0 ${r2(DOG_CENTER_Y * s)}) scale(${r2(scale / s)})`);
    setTransform(this.bonusDogPos, `rotate(${r2(rot)}) scale(${r2(scale)})`);
    setAttr(this.bonusWrap, 'opacity', r2(opacity));
    this.orange.pose(params);
    if (b.active && !this.reducedMotion && Math.random() < 0.18) this._spawn('sparkle', x + (Math.random() - 0.5) * 160, y + (Math.random() - 0.7) * 160, { vx: 0, vy: -40, life: 600, color: '#ffd35c', scale: 0.8 });
  }

  /* -------------------------------------------------------- cameos */

  _renderCameo(snap, pts, t) {
    const c = snap.cameo;
    const celebrating = snap.state === 'CELEBRATION';
    if (!c || celebrating) {
      setVisible(this.cameoDadWrap, false);
      setVisible(this.cameoMumWrap, false);
      Object.values(this.cameoProps).forEach((g) => setVisible(g, false));
      this.cameoKey = null;
      return;
    }
    const staging = CAMEO_STAGING[this.sceneId] || CAMEO_STAGING.backyard;
    const ev = String(c.event || '');
    const key = `${c.id || c.kind}:${ev}`;
    if (key !== this.cameoKey) {
      this.cameoKey = key;
      this.cameoPrevX = c.x;
      const clips = CAMEO_CLIPS[this.sceneId] || {};
      const clip = clips[ev] || clips['*'];
      if (clip) {
        setAttr(this.cameoClipRect, 'x', r2(clip.x * W));
        setAttr(this.cameoClipRect, 'y', r2(clip.y * H));
        setAttr(this.cameoClipRect, 'width', r2(clip.w * W));
        setAttr(this.cameoClipRect, 'height', r2(clip.h * H));
        setAttr(this.cameoInner, 'clip-path', `url(#${this.uid}-cameo-clip)`);
      } else this.cameoInner.removeAttribute('clip-path');
      if (this.cameoDadWrap.parentNode !== this.cameoInner) { this.cameoInner.insertBefore(this.cameoDadWrap, this.cameoPropHolder); this.cameoInner.insertBefore(this.cameoMumWrap, this.cameoPropHolder); }
    }
    const moving = Math.abs(c.x - (this.cameoPrevX ?? c.x)) > 0.00001;
    const dirX = c.x >= (this.cameoPrevX ?? c.x) ? 1 : -1;
    this.cameoPrevX = c.x;
    const progress = clamp(c.progress || 0, 0, 1);
    const fade = Math.min(1, progress / 0.08, (1 - progress) / 0.08);
    const sc = staging.scale;
    const baseX = c.x * W;
    const baseY = c.y * H + staging.dy + (ev === 'atWindow' ? 60 : 0);
    const kind = String(c.kind);
    const both = kind === 'both';
    const showDad = both || kind === 'dad' || kind === 'rare' ? true : false;
    const showMum = both || kind === 'mum' || (kind === 'rare' && /balloon/i.test(ev));
    const rare = kind === 'rare';
    const pointerNear = pts.find((p) => Math.hypot(p.x * W - baseX, p.y * H - baseY) < 170);
    // peek-in events slide in from the side of the window/doorway
    let peekDx = 0;
    if (/peek|poke|peer|atWindow/i.test(ev)) peekDx = (1 - Math.min(1, progress / 0.15, (1 - progress) / 0.15)) * 140;

    const place = (wrap, rig, x, delay) => {
      setVisible(wrap, true);
      const walkBob = moving && !this.reducedMotion ? Math.abs(Math.sin(t / 160 + delay)) * 8 : 0;
      setTransform(wrap, `translate(${r2(x + peekDx * (x < baseX ? -1 : 1))} ${r2(baseY - walkBob)}) scale(${r2(sc * (moving ? dirX : 1))} ${r2(sc)})`);
      setAttr(wrap, 'opacity', r2(clamp(fade, 0, 1)));
      const look = pointerNear ? this._lookFrom(x, baseY - 120 * sc, [pointerNear], null) : { x: moving ? 0.6 : Math.sin(t / 1300) * 0.6, y: 0 };
      if (moving) look.x *= dirX; // keep eyes forward relative to mirrored body
      rig.pose({
        t: t + delay * 300, look, run: moving && !pointerNear ? 0.45 : 0, wag: 0.3,
        wave: /wave|look/i.test(ev) || pointerNear ? 1 : 0, mouth: pointerNear ? 'o' : 'smile', wide: Boolean(pointerNear),
        armsUp: /dance/i.test(ev) ? Math.abs(Math.sin(t / 300)) : 0, tilt: /dance/i.test(ev) ? Math.sin(t / 250) * 8 : 0,
      });
    };
    if (showDad) place(this.cameoDadWrap, this.cameoDad, both ? baseX - 50 : baseX, 0); else setVisible(this.cameoDadWrap, false);
    if (showMum) place(this.cameoMumWrap, this.cameoMum, both || rare ? baseX + 60 : baseX, 1.3); else setVisible(this.cameoMumWrap, false);

    // event props
    let prop = null;
    if (/rake/i.test(ev)) prop = 'rake';
    else if (/washing/i.test(ev)) prop = 'washing';
    else if (/read|paper/i.test(ev)) prop = 'book';
    else if (/flamingo/i.test(ev)) prop = 'flamingo';
    else if (/picnic/i.test(ev)) prop = 'picnic';
    else if (/kite/i.test(ev)) prop = 'kite';
    else if (/balloon/i.test(ev)) prop = 'balloons';
    else if (/dino|costume/i.test(ev)) prop = 'dino';
    else if (/carry/i.test(ev)) prop = 'box';
    Object.entries(this.cameoProps).forEach(([k, g]) => setVisible(g, k === prop));
    if (prop) {
      const g = this.cameoProps[prop];
      const holderX = showDad ? (both ? baseX - 50 : baseX) : baseX;
      const sway = this.reducedMotion ? 0 : Math.sin(t / 300) * 6;
      const yOff = { rake: -10, washing: 20, book: -30, flamingo: -40, picnic: 10, kite: -60, balloons: -40, dino: 0, box: -10 }[prop] || 0;
      const fx = { flamingo: 0, kite: 0, balloons: 0, dino: 0 }[prop] ?? 40;
      setTransform(g, `translate(${r2(holderX + fx * sc * (moving ? dirX : 1))} ${r2(baseY + yOff * sc)}) scale(${r2(sc * (moving ? dirX : 1))} ${r2(sc)}) rotate(${r2(prop === 'rake' ? sway * 2 : sway * 0.5)})`);
      setAttr(g, 'opacity', r2(clamp(fade, 0, 1)));
    }
  }

  /* --------------------------------------------------- celebration */

  _renderCelebration(snap, t) {
    if (snap.state !== 'CELEBRATION') return;
    const cast = Array.isArray(snap.celebrationCast) ? snap.celebrationCast : ['blue'];
    const rm = this.reducedMotion ? 0.35 : 1;
    const since = this.clock - (this.celebStart || this.clock);
    const runK = clamp(since / 600, 0, 1);
    const s = DOG_SCALE * 1.15;
    const cx = (snap.dog?.x ?? 0.5) * W;
    const cy = (snap.dog?.y ?? 0.66) * H - DOG_CENTER_Y * s;
    const from = this.celebFrom || { x: cx, y: cy };
    const beat = (t / 420) * Math.PI;
    const hop = Math.abs(Math.sin(beat)) * 46 * rm;
    const x = lerp(from.x, cx, easeOut(runK));
    const y = lerp(from.y, cy, easeOut(runK)) - (runK < 1 ? Math.sin(runK * Math.PI) * 120 * rm : hop);
    this._placeBlue(this.layers.celebration, x, y, { scale: s, rot: runK < 1 ? 0 : Math.sin(beat) * 8 * rm });
    this.blue.pose({
      t, run: runK < 1 ? 1 : 0, happy: runK >= 1 ? 1 : 0, mouth: 'open', wag: 1, earPerk: 1,
      armsUp: runK >= 1 ? 0.5 + Math.sin(beat) * 0.5 : 0, squash: Math.abs(Math.sin(beat)) < 0.15 ? 0.88 : 1.03,
      look: { x: 0, y: 0.2 },
    });
    if (this.blueWrap.parentNode === this.layers.celebration) this.layers.celebration.appendChild(this.blueWrap);
    const withOrange = cast.includes('orange');
    setVisible(this.celebOrangeWrap, withOrange);
    if (withOrange) {
      const so = s * 0.85;
      const k = clamp((since - 500) / 600, 0, 1);
      const ox = lerp(W + 150, cx + 220, easeOut(k));
      const ohop = Math.abs(Math.sin(beat + 1.4)) * 40 * rm;
      setTransform(this.celebOrangeWrap, `translate(${r2(ox)} ${r2(cy + 20 - (k < 1 ? 0 : ohop))}) scale(${r2(so)})`);
      this.celebOrange.pose({ t, run: k < 1 ? 1 : 0, happy: 1, mouth: 'open', wag: 1, wave: k >= 1 ? 1 : 0, look: { x: -0.6, y: 0 } });
    }
    const withParents = cast.includes('parents');
    setVisible(this.celebParentsWrap, withParents);
    if (withParents) {
      const sp = s * 0.85;
      const k = clamp((since - 900) / 700, 0, 1);
      const sway = Math.sin(beat / 2) * 10 * rm;
      setTransform(this.celebDadWrap, `translate(${r2(lerp(-200, cx - 300, easeOut(k)))} ${r2(cy - 10)}) scale(${r2(sp)}) rotate(${r2(sway)})`);
      setTransform(this.celebMumWrap, `translate(${r2(lerp(-320, cx - 470, easeOut(k)))} ${r2(cy - 4)}) scale(${r2(sp)}) rotate(${r2(-sway)})`);
      this.celebDad.pose({ t, run: k < 1 ? 1 : 0, happy: 1, mouth: 'open', armsUp: k >= 1 ? 1 : 0, wag: 1, look: { x: 0.5, y: 0 } });
      this.celebMum.pose({ t: t + 200, run: k < 1 ? 1 : 0, happy: 1, mouth: 'smile', wave: k >= 1 ? 1 : 0, wag: 1, look: { x: 0.5, y: 0 } });
    }
    // continuous gentle confetti
    if (!this.reducedMotion && Math.random() < 0.35) {
      this._spawn('confetti', Math.random() * W, -20, { vx: (Math.random() - 0.5) * 80, vy: 160 + Math.random() * 120, life: 4200, color: CONFETTI[Math.floor(Math.random() * CONFETTI.length)], vr: (Math.random() - 0.5) * 600, scale: 1.2, gravity: 30 });
    }
    if (Math.random() < (this.reducedMotion ? 0.03 : 0.08)) this._spawn('heart', x + (Math.random() - 0.5) * 160, y - 120, { vx: (Math.random() - 0.5) * 60, vy: -120, life: 1400, color: '#ff6f8a', scale: 1.1 });
  }

  /* ----------------------------------------- guidance: hand, meter */

  _renderGuidance(snap, pts, t) {
    const dog = snap.dog || {};
    const state = snap.state;
    const progress = clamp(dog.progress || 0, 0, 1);
    const showMeter = (state === 'REVEALED' && dog.mode !== 'revealing') || state === 'SCRATCHING';
    setVisible(this.meter.g, showMeter);
    const dx = (dog.x ?? 0.5) * W;
    const dy = (dog.y ?? 0.6) * H;
    if (showMeter) {
      const top = dy - (DOG_SIZE.h * H) / 2 - 34;
      setTransform(this.meter.g, `translate(${r2(dx)} ${r2(Math.max(40, top))})`);
      setAttr(this.meter.fill, 'width', r2(176 * progress));
      setAttr(this.meter.shine, 'width', r2(Math.max(0, 176 * progress - 12)));
      const beat = 1 + (progress > 0 && !this.reducedMotion ? Math.abs(Math.sin(t / 160)) * 0.25 * progress : 0);
      setTransform(this.meter.heart, `translate(-100 2) scale(${r2(1.3 * beat)})`);
    }
    // tutorial hand: rub over the tummy until scratching takes hold
    let handMode = null;
    const sincePet = this.gameNow - this.lastProgressAt;
    if (showMeter && !snap.paused && (snap.stateElapsedMs || 0) > 1100 && sincePet > 1300) handMode = 'rub';
    if (state === 'HIDING' && (dog.hintLevel || 0) >= 4 && !snap.paused) handMode = 'point';
    setVisible(this.handGroup, Boolean(handMode));
    if (handMode === 'rub') {
      const r = dog.scratchRect || { x: dog.x, y: dog.y };
      const cx = r.x * W;
      const cy = r.y * H + 20;
      const sway = this.reducedMotion ? 0 : Math.sin(t / 180) * 50;
      setTransform(this.handGroup, `translate(${r2(cx)} ${r2(cy)})`);
      setTransform(this.handInner, `translate(${r2(sway)} ${r2(Math.abs(Math.cos(t / 180)) * -10)}) rotate(${r2(sway / 5)})`);
      setVisible(this.handMotion, true);
      setAttr(this.handGroup, 'opacity', r2(clamp((sincePet - 1300) / 400, 0, 0.92)));
    } else if (handMode === 'point') {
      const spot = this._spot(snap);
      const occ = spot && this.occluders.get(spot.id);
      if (occ) {
        const bob = this.reducedMotion ? 0 : Math.abs(Math.sin(t / 260)) * 24;
        const tx = occ.rect.x;
        const ty = occ.rect.y + occ.rect.h * 0.1;
        setTransform(this.handGroup, `translate(${r2(tx)} ${r2(ty + 40 + bob)})`);
        setTransform(this.handInner, 'rotate(0)');
        setVisible(this.handMotion, false);
        setAttr(this.handGroup, 'opacity', 0.9);
      }
    }
  }

  /* ----------------------------------------------------------- hud */

  _renderHud(snap, t) {
    const target = snap.pawsTarget || 6;
    if (target !== this.hudCount) this._layoutHud(target);
    const paws = clamp(snap.paws || 0, 0, this.hudCount);
    this.pawSlots.forEach((s, i) => {
      const filled = i < paws;
      if (filled && s.filledAt < 0) {
        s.filledAt = this.clock;
        const pos = this._hudPos(i);
        this._burst(pos.x, pos.y, 'star', 8, { speed: 220, colors: ['#ffd35c', '#fff3a0'] });
      }
      if (!filled) s.filledAt = -1;
      setVisible(s.paw, filled);
      const age = filled ? this.clock - s.filledAt : 1e9;
      const pop = age < 500 && !this.reducedMotion ? 1 + Math.sin((age / 500) * Math.PI) * 0.45 : 1;
      const celebrate = snap.state === 'CELEBRATION' && !this.reducedMotion ? Math.sin(t / 200 + i) * 0.08 : 0;
      setTransform(s.paw, `scale(${r2(0.62 * (pop + celebrate))})`);
    });
    // decorative rainbow-star badges for orange dog catches
    const hits = clamp(snap.bonusHits || 0, 0, 8);
    while (this.badges.length < hits) {
      const b = createRainbowBadge(this.badgeGroup);
      this.badges.push({ g: b, at: this.clock });
    }
    this.badges.forEach((b, i) => {
      setVisible(b.g, i < hits);
      const age = this.clock - b.at;
      const pop = age < 600 && !this.reducedMotion ? 1 + Math.sin((age / 600) * Math.PI) * 0.6 : 1;
      setTransform(b.g, `translate(${r2(this.hudWidth / 2 + 58 + i * 52)} 0) scale(${r2(0.78 * pop)}) rotate(${this.reducedMotion ? 0 : r2(Math.sin(t / 900 + i) * 8)})`);
    });
    if (hits < this.badges.length) this.badges.slice(hits).forEach((b) => { b.at = this.clock; });
    if (hits > this.prevBonusHits) this.badges.slice(this.prevBonusHits, hits).forEach((b) => { b.at = this.clock; });
    this.prevBonusHits = hits;
  }

  _hudPos(i) {
    const gap = 74;
    return { x: W / 2 - this.hudWidth / 2 + gap / 2 + i * gap, y: 58 };
  }

  /* ---------------------------------------------------------- iris */

  _renderIris(snap, t) {
    const state = snap.state;
    let inner = null;
    if (state === 'SCENE_TRANSITION') {
      const k = clamp((snap.stateElapsedMs || 0) / 550, 0, 1);
      inner = lerp(1000, 0, easeOut(k));
    } else if (this.irisOpening) {
      const k = clamp((this.clock - this.irisOpenStart) / 650, 0, 1);
      inner = lerp(0, 1000, easeOut(k));
      if (k >= 1) this.irisOpening = false;
    }
    const show = inner !== null && inner < 999;
    setVisible(this.iris, show);
    setVisible(this.irisRim, show);
    setVisible(this.irisPaw, show && inner < 200);
    if (!show) return;
    setAttr(this.iris, 'r', r2(inner + 1200));
    setAttr(this.irisRim, 'r', r2(Math.max(0, inner)));
    const bounce = this.reducedMotion ? 0 : Math.abs(Math.sin(t / 200)) * 20;
    setTransform(this.irisPaw, `translate(${W / 2} ${r2(H / 2 - bounce)}) scale(2.4)`);
  }

  /* ------------------------------------------------------ pointers */

  _renderPointers(pts, snap, t) {
    const seen = new Set();
    pts.slice(0, 4).forEach((p, idx) => {
      const id = String(p.id ?? idx);
      seen.add(id);
      let ptr = this.pointerEls.get(id);
      if (!ptr) {
        const g = el('g', { class: 'paw-pointer', 'data-pointer': id }, this.layers.pointers);
        const second = this.pointerEls.size % 2 === 1;
        const glow = el('circle', { class: 'pointer-glow', r: 64, fill: `url(#${this.uid}-pointer-glow${second ? '-2' : ''})` }, g);
        const ring = el('circle', { class: 'pointer-ring', r: 40, fill: 'none', stroke: '#fff', 'stroke-width': 5, opacity: 0.85 }, g);
        const paw = createPaw(g, { fill: second ? '#ffd0dd' : '#fff4c2', strokeWidth: 4 });
        setTransform(paw, 'translate(0 2) scale(0.6)');
        ptr = { g, glow, ring, paw, hand: null, handOpenness: 0.5, handPhase: false, handLastMoveAt: -Infinity };
        this.pointerEls.set(id, ptr);
      }
      setVisible(ptr.g, true);
      const x = p.x * W;
      const y = p.y * H;
      const prev = this.pointerHistory.get(id);
      const speed = prev ? Math.hypot(x - prev.x, y - prev.y) : 0;
      this.pointerHistory.set(id, { x, y });
      const overDog = this._overRect(p, snap.dog && (snap.state === 'HIDING' ? snap.dog.revealRect : snap.dog.scratchRect));
      const inScratchZone = snap.state === 'SCRATCHING' && overDog;
      const pulse = this.reducedMotion ? 1 : 1 + Math.sin(t / 160) * 0.06 + (overDog ? 0.12 : 0);
      setTransform(ptr.g, `translate(${r2(x)} ${r2(y)})`);
      setTransform(ptr.glow, `scale(${r2(pulse * (overDog ? 1.25 : 1))})`);
      setAttr(ptr.ring, 'stroke', overDog ? '#ffd35c' : '#fff');
      setAttr(ptr.ring, 'stroke-dasharray', overDog ? '10 8' : 'none');
      setTransform(ptr.ring, overDog && !this.reducedMotion ? `rotate(${r2((t / 6) % 360)})` : '');
      if (!this.reducedMotion && speed > 14 && Math.random() < 0.5) {
        this._spawn('sparkle', x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 20, { vx: 0, vy: 20, life: 420, color: idx % 2 ? '#ffb3c8' : '#ffe58a', scale: 0.6 });
      }
      if (inScratchZone) {
        if (!ptr.hand) ptr.hand = createScratchHand(ptr.g);
        setVisible(ptr.glow, false);
        setVisible(ptr.ring, false);
        setVisible(ptr.paw, false);
        const dogX = snap.dog.x * W;
        const dogY = snap.dog.y * H;
        setTransform(ptr.hand.g, `translate(${r2(dogX - x)} ${r2(dogY - y)})`);
        if (this.reducedMotion) {
          ptr.handOpenness = 0.5;
        } else {
          if (speed > HAND_SPEED_THRESH) { ptr.handLastMoveAt = t; ptr.handPhase = !ptr.handPhase; }
          const wiggling = (t - ptr.handLastMoveAt) < HAND_HOLD_MS;
          const target = wiggling ? (ptr.handPhase ? 1 : 0.15) : 0.5;
          ptr.handOpenness = lerp(ptr.handOpenness, target, 0.35);
        }
        ptr.hand.setOpenness(ptr.handOpenness);
        ptr.hand.setHandVisible(true);
        ptr.hand.setPromptVisible(true);
      } else {
        setVisible(ptr.glow, true);
        setVisible(ptr.ring, true);
        setVisible(ptr.paw, true);
        if (ptr.hand) { ptr.hand.setHandVisible(false); ptr.hand.setPromptVisible(false); }
      }
    });
    for (const [id, ptr] of this.pointerEls) {
      if (!seen.has(id)) {
        setVisible(ptr.g, false);
        this.pointerHistory.delete(id);
        if (ptr.hand) { ptr.hand.setHandVisible(false); ptr.hand.setPromptVisible(false); }
      }
    }
  }

  _overRect(p, r) {
    if (!r || !r.w) return false;
    return Math.abs(p.x - r.x) <= r.w / 2 && Math.abs(p.y - r.y) <= r.h / 2;
  }

  /* --------------------------------------------------------- props */

  _renderProps(snap, t) {
    const effects = new Map();
    for (const fx of snap.propEffects || []) effects.set(fx.id, fx);
    for (const [id, p] of this.propUpdaters) {
      const fx = effects.get(id) || null;
      p.update(this.reducedMotion ? (fx ? t : 0) : t, fx);
    }
  }

  _propBurst(kind, x, y) {
    const k = String(kind || '');
    if (/puddle/i.test(k)) this._burst(x, y, 'drop', 12, { speed: 340, colors: ['#8fd0f5', '#bfe6fb'], up: true });
    else if (/sprinkler/i.test(k)) this._burst(x, y - 30, 'drop', 14, { speed: 380, colors: ['#7fd4ff'], up: true });
    else if (/xylo|chime/i.test(k)) this._burst(x, y - 30, 'note', 5, { speed: 200, colors: ['#b9a2e8', '#ff8f9e', '#7fd1c1'], up: true });
    else if (/flower|butterfly/i.test(k)) this._burst(x, y - 30, 'sparkle', 8, { speed: 220, colors: ['#ff9ab3', '#ffd35c'] });
    else if (/leaves/i.test(k)) this._burst(x, y, 'leaf', 8, { speed: 220, colors: ['#e9a23b', '#ff8f6b', '#c8d65a'] });
    else if (/cushion/i.test(k)) this._burst(x, y - 10, 'dust', 6, { speed: 180, colors: ['#fff'] });
    else if (/balloon/i.test(k)) this._burst(x, y, 'heart', 4, { speed: 160, colors: ['#ff8f9e'], up: true });
    else if (/lamp/i.test(k)) this._burst(x, y - 20, 'star', 6, { speed: 200, colors: ['#fff3a0'] });
    else this._burst(x, y - 10, 'star', 6, { speed: 220, colors: ['#ffd35c', '#9be08f'] });
  }

  /* ----------------------------------------------------- particles */

  _scratchSparkles(x, y, delta, target) {
    const n = this.reducedMotion ? (Math.random() < 0.15 ? 1 : 0) : Math.min(3, 1 + Math.floor(delta * 40));
    for (let i = 0; i < n; i += 1) {
      const px = target ? target.x : x + (Math.random() - 0.5) * 100;
      const py = target ? target.y : y;
      const type = Math.random() < 0.55 ? 'heart' : 'sparkle';
      this._spawn(type, px + (Math.random() - 0.5) * 50, py + (Math.random() - 0.5) * 40, {
        vx: (Math.random() - 0.5) * 120, vy: -120 - Math.random() * 120, life: 900,
        color: type === 'heart' ? '#ff6f8a' : '#fff3a0', scale: 0.8 + Math.random() * 0.5,
      });
    }
  }

  _burst(x, y, type, count, { speed = 300, colors = ['#fff'], up = false, spread = 0 } = {}) {
    const n = this.reducedMotion ? Math.max(1, Math.round(count * 0.25)) : count;
    const sp = this.reducedMotion ? speed * 0.3 : speed;
    for (let i = 0; i < n; i += 1) {
      const a = up ? -Math.PI / 2 + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2;
      const v = sp * (0.45 + Math.random() * 0.55);
      this._spawn(type, x + (spread ? (Math.random() - 0.5) * spread : 0), y, {
        vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 900 + Math.random() * 600,
        color: colors[i % colors.length], vr: (Math.random() - 0.5) * 400,
        gravity: type === 'confetti' ? 260 : type === 'drop' ? 900 : type === 'heart' || type === 'note' || type === 'bubble' ? -40 : 300,
        scale: 0.9 + Math.random() * 0.6,
      });
    }
  }

  _ring(x, y, color, scale = 1) {
    if (this.bursts.length > 6) return;
    const c = el('circle', { cx: x, cy: y, r: 20, fill: 'none', stroke: color, 'stroke-width': 10, opacity: 0.9 }, this.burstLayer);
    this.bursts.push({ el: c, age: 0, life: 520, max: 150 * scale });
  }

  _spawn(type, x, y, { vx = 0, vy = 0, life = 1000, color = '#fff', vr = 0, gravity = 0, scale = 1 } = {}) {
    if (!PARTICLE_SHAPES.includes(type)) return;
    let p = this.particles.find((q) => !q.alive);
    if (!p) {
      if (this.particles.length >= MAX_PARTICLES) return;
      const node = el('use', { display: 'none' }, this.particleLayer);
      p = { node, alive: false };
      this.particles.push(p);
    }
    Object.assign(p, { alive: true, type, x, y, vx, vy, life, age: 0, rot: Math.random() * 360, vr, gravity, scale });
    setAttr(p.node, 'href', `#${this.uid}-p-${type}`);
    setAttr(p.node, 'fill', color);
    setAttr(p.node, 'display', 'inline');
  }

  _updateParticles(dt) {
    const s = dt / 1000;
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) { p.alive = false; setAttr(p.node, 'display', 'none'); continue; }
      p.vy += p.gravity * s;
      p.vx *= 0.985;
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.rot += p.vr * s;
      const k = p.age / p.life;
      const grow = k < 0.15 ? k / 0.15 : 1;
      setTransform(p.node, `translate(${r2(p.x)} ${r2(p.y)}) rotate(${r2(p.rot)}) scale(${r2(p.scale * grow)})`);
      setAttr(p.node, 'opacity', r2(k > 0.65 ? (1 - k) / 0.35 : 1));
    }
    this.bursts = this.bursts.filter((b) => {
      b.age += dt;
      const k = b.age / b.life;
      if (k >= 1) { b.el.remove(); return false; }
      setAttr(b.el, 'r', r2(20 + easeOut(k) * b.max));
      setAttr(b.el, 'opacity', r2(0.9 * (1 - k)));
      setAttr(b.el, 'stroke-width', r2(10 * (1 - k) + 1));
      return true;
    });
  }

  /* --------------------------------------------------------- debug */

  _renderDebug(debug, snap, pts, fps, landmarks) {
    if (!debug) {
      if (this.debugGroup) { this.debugGroup.remove(); this.debugGroup = null; }
      return;
    }
    if (!this.debugGroup) {
      this.debugGroup = el('g', { class: 'debug-overlay', 'pointer-events': 'none' }, this.layers.debug);
      this.debugStatic = el('g', {}, this.debugGroup);
      this.debugDynamic = el('g', {}, this.debugGroup);
      this.debugSceneId = null;
    }
    if (this.debugSceneId !== this.sceneId) {
      while (this.debugStatic.firstChild) this.debugStatic.removeChild(this.debugStatic.firstChild);
      this.debugSceneId = this.sceneId;
      for (const spot of this.scene.spots) {
        const o = spot.occluder;
        el('rect', { x: (o.x - o.w / 2) * W, y: (o.y - o.h / 2) * H, width: o.w * W, height: o.h * H, fill: 'none', stroke: '#7a5cff', 'stroke-width': 2, 'stroke-dasharray': '6 6' }, this.debugStatic);
        el('circle', { cx: spot.x * W, cy: spot.y * H, r: 6, fill: '#7a5cff' }, this.debugStatic);
        const label = el('text', { x: spot.x * W + 8, y: spot.y * H - 8, 'font-size': 16, fill: '#3b2a99', 'font-family': 'ui-monospace, monospace' }, this.debugStatic);
        label.textContent = spot.id;
      }
      for (const prop of this.scene.props) {
        el('rect', { x: (prop.x - prop.w / 2) * W, y: (prop.y - prop.h / 2) * H, width: prop.w * W, height: prop.h * H, fill: 'none', stroke: '#00a37a', 'stroke-width': 2 }, this.debugStatic);
      }
    }
    const dyn = this.debugDynamic;
    while (dyn.firstChild) dyn.removeChild(dyn.firstChild);
    const rect = (r, color, name) => {
      if (!r || !r.w) return;
      el('rect', { class: `debug-${name}`, x: (r.x - r.w / 2) * W, y: (r.y - r.h / 2) * H, width: r.w * W, height: r.h * H, fill: color, 'fill-opacity': 0.12, stroke: color, 'stroke-width': 3 }, dyn);
    };
    const dog = snap.dog || {};
    rect(dog.revealRect, '#ff3b6b', 'reveal');
    rect(dog.scratchRect, '#ff9b00', 'scratch');
    if (snap.bonus && snap.bonus.active) rect(snap.debug?.bonusHitRect || { x: snap.bonus.x, y: snap.bonus.y, w: 0.2, h: 0.32 }, '#ffcc00', 'bonus');
    for (const hand of Array.isArray(landmarks) ? landmarks : []) {
      for (const lm of Array.isArray(hand) ? hand : []) {
        if (lm && Number.isFinite(lm.x)) el('circle', { cx: lm.x * W, cy: lm.y * H, r: 4, fill: '#00c2ff' }, dyn);
      }
    }
    for (const p of pts) el('circle', { cx: p.x * W, cy: p.y * H, r: 8, fill: 'none', stroke: '#00c2ff', 'stroke-width': 3 }, dyn);
    const lines = [
      `${snap.state} · ${snap.sceneId} · ${snap.spotId || '-'} · mode ${dog.mode || '-'}`,
      `paws ${snap.paws} · bonus ${snap.bonusHits} · hint ${dog.hintLevel} · paused ${snap.paused}`,
      `scratch ${Math.round(snap.debug?.scratchPx ?? (dog.progress || 0) * 330)} / ${Math.round(snap.debug?.scratchThresholdPx ?? 330)} px (${Math.round((dog.progress || 0) * 100)}%)`,
      `bonus ${snap.bonus ? `${Math.round(snap.bonus.remainingMs || 0)}ms` : '-'} · fps ${Math.round(fps || 0)}`,
    ];
    el('rect', { x: 12, y: H - 20 - lines.length * 22, width: 560, height: lines.length * 22 + 10, rx: 8, fill: '#000', 'fill-opacity': 0.55 }, dyn);
    lines.forEach((line, i) => {
      const tx = el('text', { x: 22, y: H - 14 - (lines.length - 1 - i) * 22 - 6, 'font-size': 16, fill: '#fff', 'font-family': 'ui-monospace, monospace' }, dyn);
      tx.textContent = line;
    });
  }
}
