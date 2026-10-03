/** Bedroom scene data (see js/scenes.js for the geometry contract). */
import { scenePalette } from './palette.js';

export const bedroom = {
  id: 'bedroom',
  name: 'Bedroom',
  palette: scenePalette({
    sky: ['#c9b8f0', '#ece2ff'],
    ground: ['#e8b98a', '#c9935f'],
    accents: ['#ff9ab3', '#ffd35c', '#7fd1c1'],
    wall: '#b8c9f4',
    wood: '#a8683f',
  }),
  spots: [
    { id: 'curtain', kind: 'curtain', x: 0.16, y: 0.46, pose: 'peekRight', clue: 'nose', reveal: 'slideIn', facing: 'right', occluder: { x: 0.15, y: 0.42, w: 0.13, h: 0.56 } },
    { id: 'blanket', kind: 'blanket', x: 0.38, y: 0.5, pose: 'upsideDown', clue: 'tail', reveal: 'popUp', facing: 'right', occluder: { x: 0.38, y: 0.54, w: 0.22, h: 0.18 } },
    { id: 'under-bed', kind: 'underBed', x: 0.3, y: 0.75, pose: 'underObject', clue: 'eyes', reveal: 'crawlOut', facing: 'right', occluder: { x: 0.33, y: 0.7, w: 0.3, h: 0.16 } },
    { id: 'toy-box', kind: 'toyBox', x: 0.52, y: 0.72, pose: 'topOfHead', clue: 'ears', reveal: 'jumpOut', facing: 'left', occluder: { x: 0.52, y: 0.77, w: 0.14, h: 0.18 } },
    { id: 'stuffed-toy', kind: 'stuffedToy', x: 0.68, y: 0.62, pose: 'peekLeft', clue: 'ears', reveal: 'popUp', facing: 'left', occluder: { x: 0.68, y: 0.63, w: 0.14, h: 0.3 } },
    { id: 'wardrobe', kind: 'wardrobe', x: 0.84, y: 0.47, pose: 'peekLeft', clue: 'eyes', reveal: 'jumpOut', facing: 'left', occluder: { x: 0.86, y: 0.44, w: 0.16, h: 0.6 } },
    { id: 'laundry', kind: 'laundryBasket', x: 0.86, y: 0.76, pose: 'earsOnly', clue: 'ears', reveal: 'popUp', facing: 'left', occluder: { x: 0.86, y: 0.8, w: 0.12, h: 0.16 } },
  ],
  props: [
    { id: 'lamp', kind: 'lamp', x: 0.27, y: 0.24, w: 0.07, h: 0.14 },
    { id: 'xylophone', kind: 'xylophone', x: 0.12, y: 0.88, w: 0.1, h: 0.07 },
    { id: 'bouncy-ball', kind: 'ball', x: 0.42, y: 0.9, w: 0.06, h: 0.09 },
    { id: 'wind-up', kind: 'windUpToy', x: 0.66, y: 0.88, w: 0.07, h: 0.08 },
    { id: 'balloon', kind: 'balloon', x: 0.72, y: 0.2, w: 0.06, h: 0.14 },
  ],
  bonusSpots: [
    { id: 'bed-end', x: 0.22, y: 0.62, pose: 'popUp' },
    { id: 'rug', x: 0.46, y: 0.6, pose: 'peekRight' },
    { id: 'door-side', x: 0.72, y: 0.42, pose: 'peekLeft' },
    { id: 'floor-mid', x: 0.6, y: 0.8, pose: 'popUp' },
    { id: 'shelf', x: 0.5, y: 0.38, pose: 'overShelf' },
  ],
  cameos: [
    { id: 'dad-doorway', kind: 'dad', event: 'pokeHeadDoorway', from: { x: 0.6, y: 0.36 }, to: { x: 0.6, y: 0.36 }, durationMs: 4500 },
    { id: 'dad-walk', kind: 'dad', event: 'walkPastDoorway', from: { x: 0.53, y: 0.37 }, to: { x: 0.67, y: 0.37 }, durationMs: 4000 },
    { id: 'mum-washing', kind: 'mum', event: 'carryWashing', from: { x: 0.67, y: 0.37 }, to: { x: 0.53, y: 0.37 }, durationMs: 4500 },
    { id: 'both-peek', kind: 'both', event: 'peekTogether', from: { x: 0.6, y: 0.36 }, to: { x: 0.6, y: 0.36 }, durationMs: 4500 },
    { id: 'rare-costume', kind: 'rare', event: 'dinosaurCostume', from: { x: 0.53, y: 0.37 }, to: { x: 0.67, y: 0.37 }, durationMs: 5500 },
  ],
};
