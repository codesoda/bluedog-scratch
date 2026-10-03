/** Lounge scene data (see js/scenes.js for the geometry contract). */
import { scenePalette } from './palette.js';

export const lounge = {
  id: 'lounge',
  name: 'Lounge Room',
  palette: scenePalette({
    sky: ['#ffe2b8', '#fff1da'],
    ground: ['#c7a07a', '#a07b58'],
    accents: ['#4fb3a9', '#ffd35c', '#ff8f6b'],
    wall: '#f6c99b',
    wood: '#8f5b37',
  }),
  spots: [
    { id: 'armchair', kind: 'armchair', x: 0.16, y: 0.56, pose: 'peekRight', clue: 'ears', reveal: 'jumpOut', facing: 'right', occluder: { x: 0.16, y: 0.6, w: 0.16, h: 0.32 } },
    { id: 'behind-couch', kind: 'couch', x: 0.4, y: 0.5, pose: 'topOfHead', clue: 'head', reveal: 'popUp', facing: 'right', occluder: { x: 0.42, y: 0.6, w: 0.3, h: 0.24 } },
    { id: 'under-couch', kind: 'underCouch', x: 0.44, y: 0.76, pose: 'underObject', clue: 'feet', reveal: 'crawlOut', facing: 'left', occluder: { x: 0.42, y: 0.72, w: 0.3, h: 0.1 } },
    { id: 'cushions', kind: 'cushions', x: 0.24, y: 0.76, pose: 'earsOnly', clue: 'ears', reveal: 'popUp', facing: 'right', occluder: { x: 0.24, y: 0.8, w: 0.14, h: 0.16 } },
    { id: 'cabinet', kind: 'cabinet', x: 0.64, y: 0.42, pose: 'peekLeft', clue: 'nose', reveal: 'slideIn', facing: 'left', occluder: { x: 0.64, y: 0.44, w: 0.14, h: 0.34 } },
    { id: 'blanket-fort', kind: 'blanketFort', x: 0.66, y: 0.69, pose: 'peekRight', clue: 'eyes', reveal: 'crawlOut', facing: 'right', occluder: { x: 0.67, y: 0.7, w: 0.2, h: 0.24 } },
    { id: 'curtain', kind: 'curtain', x: 0.86, y: 0.46, pose: 'peekLeft', clue: 'tail', reveal: 'rollIn', facing: 'left', occluder: { x: 0.87, y: 0.42, w: 0.12, h: 0.56 } },
  ],
  props: [
    { id: 'floor-lamp', kind: 'lamp', x: 0.1, y: 0.84, w: 0.06, h: 0.16 },
    { id: 'cushion', kind: 'cushion', x: 0.55, y: 0.89, w: 0.08, h: 0.07 },
    { id: 'toy', kind: 'toy', x: 0.82, y: 0.87, w: 0.07, h: 0.08 },
    { id: 'decoration', kind: 'hangingDecoration', x: 0.5, y: 0.14, w: 0.07, h: 0.13 },
  ],
  bonusSpots: [
    { id: 'couch-arm', x: 0.28, y: 0.48, pose: 'peekRight' },
    { id: 'rug', x: 0.55, y: 0.62, pose: 'popUp' },
    { id: 'tv-side', x: 0.76, y: 0.5, pose: 'peekLeft' },
    { id: 'table', x: 0.34, y: 0.66, pose: 'popUp' },
    { id: 'corner', x: 0.8, y: 0.76, pose: 'peekLeft' },
  ],
  cameos: [
    { id: 'dad-reading', kind: 'dad', event: 'readPaper', from: { x: 0.3, y: 0.36 }, to: { x: 0.3, y: 0.36 }, durationMs: 6000 },
    { id: 'dad-look', kind: 'dad', event: 'lookAtBlueDog', from: { x: 0.52, y: 0.36 }, to: { x: 0.56, y: 0.36 }, durationMs: 4500 },
    { id: 'mum-pass', kind: 'mum', event: 'passBehindSofa', from: { x: 0.18, y: 0.38 }, to: { x: 0.72, y: 0.38 }, durationMs: 6000 },
    { id: 'both-dance', kind: 'both', event: 'danceAcross', from: { x: 0.74, y: 0.37 }, to: { x: 0.2, y: 0.37 }, durationMs: 6500 },
    { id: 'rare-chase', kind: 'rare', event: 'chasedByBalloons', from: { x: 0.04, y: 0.37 }, to: { x: 0.96, y: 0.37 }, durationMs: 6500 },
  ],
};
