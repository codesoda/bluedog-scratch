import { el, createPaw, setTransform, setVisible } from './characters.js';

const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

export class HandSetupView {
  constructor(source) {
    this.source = source;
    this.panel = document.getElementById('hand-setup-view');
    this.preview = document.getElementById('hand-setup-preview');
    this.svg = document.getElementById('hand-setup-tracking');
    this.hands = Array.from({ length: 2 }, () => {
      const group = el('g', { display: 'none' }, this.svg);
      const bones = BONES.map(() => el('line', { stroke: '#7fd1c1', 'stroke-width': 4, 'stroke-linecap': 'round' }, group));
      const joints = Array.from({ length: 21 }, () => el('circle', { r: 4, fill: '#fff6df' }, group));
      return { group, bones, joints };
    });
    this.pointers = Array.from({ length: 2 }, () => {
      const group = el('g', { class: 'setup-paw-pointer', display: 'none' }, this.svg);
      el('circle', { r: 40, fill: '#8bc4ea', stroke: '#fff', 'stroke-width': 5, 'fill-opacity': 0.6 }, group);
      const paw = createPaw(group, { fill: '#fff4c2', strokeWidth: 4 });
      setTransform(paw, 'translate(0 2) scale(0.6)');
      return group;
    });
  }

  show() {
    this.panel.hidden = false;
    this.preview.srcObject = this.source.srcObject;
    void this.preview.play().catch(error => console.warn('Local hand preview could not play:', error));
  }

  hide() {
    this.panel.hidden = true;
    this.preview.pause();
    this.preview.srcObject = null;
    this.draw({ pointers: [], landmarks: [] });
  }

  draw({ pointers = [], landmarks = [] }) {
    const width = this.source.videoWidth || 640;
    const height = this.source.videoHeight || 480;
    this.panel.style.aspectRatio = `${width} / ${height}`;
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.hands.forEach((hand, index) => {
      const points = landmarks[index];
      const valid = Array.isArray(points) && points.length === 21
        && points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y));
      setVisible(hand.group, valid);
      if (!valid) return;
      hand.joints.forEach((joint, i) => {
        joint.setAttribute('cx', points[i].x * width);
        joint.setAttribute('cy', points[i].y * height);
      });
      hand.bones.forEach((bone, i) => {
        const [a, b] = BONES[i];
        for (const [name, value] of Object.entries({ x1: points[a].x * width, y1: points[a].y * height, x2: points[b].x * width, y2: points[b].y * height })) {
          bone.setAttribute(name, value);
        }
      });
    });
    this.pointers.forEach((group, index) => {
      const pointer = pointers[index];
      const visible = Boolean(pointer?.active && Number.isFinite(pointer.x) && Number.isFinite(pointer.y));
      setVisible(group, visible);
      if (visible) setTransform(group, `translate(${pointer.x * width} ${pointer.y * height}) scale(${width / 1000})`);
    });
  }
}
