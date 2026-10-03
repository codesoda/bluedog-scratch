/** Backyard scene data (see js/scenes.js for the geometry contract). */
import { scenePalette } from './palette.js';

export const backyard = {
  id: 'backyard',
  name: 'Backyard',
  palette: scenePalette({
    sky: ['#9fd8f2', '#d7f0f6'],
    ground: ['#8dcb63', '#5fa646'],
    accents: ['#ff8f6b', '#ffd35c', '#b9a2e8'],
    wall: '#f3d9a4',
    wood: '#b9774a',
  }),
  spots: [
    { id: 'tree', kind: 'tree', x: 0.15, y: 0.52, pose: 'peekRight', clue: 'ears', reveal: 'jumpOut', facing: 'right', occluder: { x: 0.15, y: 0.5, w: 0.12, h: 0.62 } },
    { id: 'bush', kind: 'bush', x: 0.33, y: 0.7, pose: 'earsOnly', clue: 'ears', reveal: 'popUp', facing: 'right', occluder: { x: 0.33, y: 0.74, w: 0.2, h: 0.22 } },
    { id: 'cubby', kind: 'cubby', x: 0.5, y: 0.47, pose: 'peekLeft', clue: 'nose', reveal: 'crawlOut', facing: 'left', occluder: { x: 0.5, y: 0.46, w: 0.16, h: 0.3 } },
    { id: 'washing-line', kind: 'washingLine', x: 0.7, y: 0.4, pose: 'tailOnly', clue: 'tail', reveal: 'slideIn', facing: 'left', occluder: { x: 0.7, y: 0.38, w: 0.18, h: 0.26 } },
    { id: 'shed', kind: 'shed', x: 0.84, y: 0.53, pose: 'peekLeft', clue: 'eyes', reveal: 'jumpOut', facing: 'left', occluder: { x: 0.85, y: 0.5, w: 0.15, h: 0.4 } },
    { id: 'trampoline', kind: 'trampoline', x: 0.66, y: 0.7, pose: 'underObject', clue: 'feet', reveal: 'rollIn', facing: 'right', occluder: { x: 0.66, y: 0.7, w: 0.22, h: 0.18 } },
    { id: 'box', kind: 'box', x: 0.5, y: 0.75, pose: 'topOfHead', clue: 'head', reveal: 'popUp', facing: 'right', occluder: { x: 0.5, y: 0.79, w: 0.13, h: 0.18 } },
  ],
  props: [
    { id: 'flower', kind: 'flower', x: 0.22, y: 0.88, w: 0.07, h: 0.1 },
    { id: 'ball', kind: 'ball', x: 0.4, y: 0.9, w: 0.06, h: 0.09 },
    { id: 'sprinkler', kind: 'sprinkler', x: 0.6, y: 0.89, w: 0.07, h: 0.08 },
    { id: 'puddle', kind: 'puddle', x: 0.8, y: 0.89, w: 0.11, h: 0.06 },
    { id: 'wind-chime', kind: 'windChime', x: 0.3, y: 0.2, w: 0.05, h: 0.13 },
  ],
  bonusSpots: [
    { id: 'fence-left', x: 0.27, y: 0.42, pose: 'overFence' },
    { id: 'garden-mid', x: 0.42, y: 0.6, pose: 'popUp' },
    { id: 'pot-right', x: 0.78, y: 0.74, pose: 'peekLeft' },
    { id: 'table', x: 0.6, y: 0.55, pose: 'peekRight' },
    { id: 'corner', x: 0.2, y: 0.72, pose: 'popUp' },
  ],
  cameos: [
    { id: 'dad-rake', kind: 'dad', event: 'rakeLeaves', from: { x: 0.18, y: 0.34 }, to: { x: 0.4, y: 0.34 }, durationMs: 6500 },
    { id: 'dad-fence', kind: 'dad', event: 'peerOverFence', from: { x: 0.9, y: 0.33 }, to: { x: 0.78, y: 0.33 }, durationMs: 5000 },
    { id: 'mum-washing', kind: 'mum', event: 'hangWashing', from: { x: 0.56, y: 0.33 }, to: { x: 0.64, y: 0.33 }, durationMs: 6000 },
    { id: 'mum-window', kind: 'mum', event: 'atWindow', from: { x: 0.36, y: 0.28 }, to: { x: 0.36, y: 0.28 }, durationMs: 4500 },
    { id: 'both-walk', kind: 'both', event: 'walkTogether', from: { x: 0.04, y: 0.35 }, to: { x: 0.96, y: 0.35 }, durationMs: 7500 },
    { id: 'rare-flamingo', kind: 'rare', event: 'inflatableFlamingo', from: { x: 0.96, y: 0.35 }, to: { x: 0.04, y: 0.35 }, durationMs: 7000 },
  ],
};
