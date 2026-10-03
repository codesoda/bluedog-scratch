import { normalizeStagesPerGo, STATES } from './game-state.js';

function createStarProgress(container) {
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const starPath = 'M20 3 L25.2 13.3 L36.6 15 L28.3 23.1 L30.3 34.5 L20 29.1 L9.7 34.5 L11.7 23.1 L3.4 15 L14.8 13.3 Z';
  let target = 0;
  let earned = -1;
  let stars = [];
  return (count, completed) => {
    if (target !== count) {
      container.replaceChildren();
      stars = [];
      target = count;
      earned = -1;
      const perRow = Math.ceil(count / Math.ceil(count / 8));
      for (let index = 0; index < count; index++) {
        if (index % perRow === 0) {
          const row = document.createElement('div');
          row.className = 'go-star-row';
          container.appendChild(row);
        }
        const star = document.createElementNS(svgNamespace, 'svg');
        star.setAttribute('viewBox', '0 0 40 40');
        star.setAttribute('focusable', 'false');
        star.classList.add('go-star');
        const path = document.createElementNS(svgNamespace, 'path');
        path.setAttribute('d', starPath);
        star.appendChild(path);
        container.lastElementChild.appendChild(star);
        stars.push(star);
      }
    }
    if (earned === completed) return;
    earned = completed;
    stars.forEach((star, index) => star.classList.toggle('is-earned', index < completed));
  };
}

export function installGoControls({ game, onComplete, onPlayAgain }) {
  const byId = id => document.getElementById(id);
  const slider = byId('stages-per-go');
  const finish = byId('go-complete-overlay');
  const replay = byId('play-again-button');
  const progress = byId('go-progress');
  const label = byId('go-progress-label');
  const renderStars = createStarProgress(byId('go-star-slots'));
  const syncSetting = () => {
    const count = normalizeStagesPerGo(slider.value);
    slider.value = String(count);
    game.config.stagesPerGo = count;
    byId('stage-count').textContent = `${count} ${count === 1 ? 'stage' : 'stages'}`;
    slider.setAttribute('aria-valuetext', `${count} complete ${count === 1 ? 'scene' : 'scenes'}`);
  };
  slider.addEventListener('input', syncSetting);
  slider.addEventListener('change', syncSetting);
  syncSetting();
  replay.addEventListener('click', () => {
    finish.hidden = true;
    onPlayAgain();
  });
  return {
    update(snapshot, playing) {
      const complete = snapshot.state === STATES.GO_COMPLETE;
      progress.hidden = !playing || complete;
      renderStars(snapshot.stagesTarget, snapshot.completedStages);
      const text = `${snapshot.completedStages} of ${snapshot.stagesTarget} stars`;
      if (label.textContent !== text) label.textContent = text;
      if (!complete || !finish.hidden) return;
      onComplete();
      byId('go-complete-message').textContent = `You earned ${snapshot.completedStages} ${snapshot.completedStages === 1 ? 'star' : 'stars'}!`;
      finish.hidden = false;
      replay.focus({ preventScroll: true });
    },
  };
}
