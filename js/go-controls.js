import { normalizeStagesPerGo, STATES } from './game-state.js';

export function installGoControls({ game, onComplete, onPlayAgain }) {
  const byId = id => document.getElementById(id);
  const slider = byId('stages-per-go');
  const finish = byId('go-complete-overlay');
  const replay = byId('play-again-button');
  const progress = byId('go-progress');
  const label = byId('go-progress-label');
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
