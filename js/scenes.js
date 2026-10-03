/**
 * Scene data for Blue Dog Scratch. Pure data, no browser globals.
 *
 * GEOMETRY CONTRACT (shared with renderer/characters):
 * - All coordinates are normalized to the 1600 x 900 virtual stage.
 * - spot.x / spot.y is the CENTER of the REVEALED blue dog's body
 *   (approx DOG_SIZE wide/high). Hiding art places the dog at the same
 *   centre and covers it with spot.occluder.
 * - spot.occluder {x,y,w,h} is the CENTER + full size of the foreground
 *   object the dog hides behind/under. Renderer draws it in the foreground
 *   layer while hiding, and may keep it while the dog is revealed.
 * - spot.clue: which bit of the dog peeks out while hidden
 *   (ears | tail | nose | feet | head | eyes).
 * - spot.pose: hide pose (peekLeft | peekRight | earsOnly | tailOnly |
 *   underObject | upsideDown | topOfHead).
 * - spot.reveal: reveal animation (jumpOut | popUp | crawlOut | slideIn | rollIn).
 * - spot.facing: 'left' | 'right' default facing when revealed.
 * - props {id,kind,x,y,w,h}: centre + normalized full size of the touchable
 *   object. Props never overlap a spot centre.
 * - bonusSpots {id,x,y,pose}: centre of the orange dog's body when she pops up.
 * - cameos {id,kind,event,from,to,durationMs}: decorative background parent
 *   walks. kind is 'dad' | 'mum' | 'both' | 'rare'. Position is interpolated
 *   from->to and exposed in snapshot.cameo.{x,y,progress}.
 */
import { backyard } from './scene-data/backyard.js';
import { bedroom } from './scene-data/bedroom.js';
import { lounge } from './scene-data/lounge.js';
import { playground } from './scene-data/playground.js';

/** Revealed blue dog body size, normalized (≈ 208 x 243 virtual px). */
export const DOG_SIZE = Object.freeze({ w: 0.13, h: 0.27 });
/** Orange dog body size, normalized. */
export const BONUS_DOG_SIZE = Object.freeze({ w: 0.1, h: 0.21 });

/** Base generous hitbox sizes (full width/height, normalized, centered on spot). */
export const HITBOXES = Object.freeze({
  reveal: Object.freeze({ w: 0.24, h: 0.36 }),
  scratch: Object.freeze({ w: 0.2, h: 0.32 }),
  bonus: Object.freeze({ w: 0.2, h: 0.32 }),
});

function freezeDeep(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const value of Object.values(obj)) freezeDeep(value);
  }
  return obj;
}

export const SCENES = freezeDeep({ backyard, bedroom, lounge, playground });
export const SCENE_IDS = Object.freeze(Object.keys(SCENES));

export function getScene(id) {
  return SCENES[id] || null;
}

export function isSceneId(id) {
  return Object.prototype.hasOwnProperty.call(SCENES, id);
}
