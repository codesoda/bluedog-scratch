/** Playground scene data (see js/scenes.js for the geometry contract). */
import { scenePalette } from './palette.js';

export const playground = {
  id: 'playground',
  name: 'Playground',
  palette: scenePalette({
    sky: ['#8fd3ff', '#e3f6ff'],
    ground: ['#9bd16b', '#6aac4c'],
    accents: ['#ff6f61', '#ffc93c', '#6f8cff'],
    wall: '#f7e2a8',
    wood: '#b07a4f',
  }),
  spots: [
    { id: 'slide', kind: 'slide', x: 0.2, y: 0.5, pose: 'peekRight', clue: 'ears', reveal: 'slideIn', facing: 'right', occluder: { x: 0.2, y: 0.52, w: 0.16, h: 0.42 } },
    { id: 'hill', kind: 'hill', x: 0.34, y: 0.4, pose: 'topOfHead', clue: 'head', reveal: 'popUp', facing: 'right', occluder: { x: 0.34, y: 0.47, w: 0.18, h: 0.14 } },
    { id: 'climbing-frame', kind: 'climbingFrame', x: 0.53, y: 0.45, pose: 'upsideDown', clue: 'tail', reveal: 'jumpOut', facing: 'left', occluder: { x: 0.53, y: 0.46, w: 0.18, h: 0.38 } },
    { id: 'playhouse', kind: 'playhouse', x: 0.82, y: 0.48, pose: 'peekLeft', clue: 'eyes', reveal: 'crawlOut', facing: 'left', occluder: { x: 0.83, y: 0.47, w: 0.16, h: 0.36 } },
    { id: 'tunnel', kind: 'tunnel', x: 0.4, y: 0.72, pose: 'peekLeft', clue: 'nose', reveal: 'crawlOut', facing: 'left', occluder: { x: 0.42, y: 0.74, w: 0.22, h: 0.18 } },
    { id: 'picnic-table', kind: 'picnicTable', x: 0.66, y: 0.72, pose: 'underObject', clue: 'feet', reveal: 'rollIn', facing: 'right', occluder: { x: 0.66, y: 0.7, w: 0.2, h: 0.18 } },
    { id: 'bushes', kind: 'bush', x: 0.14, y: 0.75, pose: 'earsOnly', clue: 'ears', reveal: 'popUp', facing: 'right', occluder: { x: 0.14, y: 0.79, w: 0.18, h: 0.2 } },
  ],
  props: [
    { id: 'puddle', kind: 'puddle', x: 0.28, y: 0.9, w: 0.11, h: 0.06 },
    { id: 'ball', kind: 'ball', x: 0.54, y: 0.89, w: 0.06, h: 0.09 },
    { id: 'flowers', kind: 'flower', x: 0.84, y: 0.87, w: 0.08, h: 0.1 },
    { id: 'butterfly', kind: 'butterfly', x: 0.66, y: 0.2, w: 0.06, h: 0.08 },
    { id: 'leaves', kind: 'leaves', x: 0.1, y: 0.22, w: 0.08, h: 0.1 },
  ],
  bonusSpots: [
    { id: 'swing', x: 0.68, y: 0.52, pose: 'popUp' },
    { id: 'path', x: 0.26, y: 0.64, pose: 'peekRight' },
    { id: 'sandpit', x: 0.52, y: 0.7, pose: 'popUp' },
    { id: 'fence', x: 0.86, y: 0.72, pose: 'peekLeft' },
    { id: 'tree-top', x: 0.42, y: 0.38, pose: 'overShelf' },
  ],
  cameos: [
    { id: 'dad-picnic', kind: 'dad', event: 'carryPicnic', from: { x: 0.92, y: 0.33 }, to: { x: 0.3, y: 0.33 }, durationMs: 7000 },
    { id: 'mum-path', kind: 'mum', event: 'walkPath', from: { x: 0.08, y: 0.33 }, to: { x: 0.7, y: 0.33 }, durationMs: 7000 },
    { id: 'mum-sit', kind: 'mum', event: 'sitAtTable', from: { x: 0.72, y: 0.34 }, to: { x: 0.72, y: 0.34 }, durationMs: 5500 },
    { id: 'both-wave', kind: 'both', event: 'waveAtCamera', from: { x: 0.45, y: 0.32 }, to: { x: 0.5, y: 0.32 }, durationMs: 5000 },
    { id: 'rare-kite', kind: 'rare', event: 'giantKite', from: { x: 0.04, y: 0.3 }, to: { x: 0.96, y: 0.3 }, durationMs: 7000 },
  ],
};
