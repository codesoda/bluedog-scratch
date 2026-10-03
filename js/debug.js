export function installDebug({ game, renderer, world, options, getPointers, setPointers, start, render, setManual, getTrackingStatus }) {
  if (!options.debug) return;
  const panel = document.getElementById('debug-panel');
  const text = document.getElementById('debug-text');
  panel.hidden = false;
  window.__BLUE_DOG__ = {
    game, renderer,
    trackingStatus: getTrackingStatus,
    start: () => { setManual(true); start(); render(); },
    setPointers: pointers => {
      setManual(true);
      setPointers(pointers.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
    },
    step: dt => {
      setManual(true);
      game.update(Math.max(0, Math.min(100, dt)), getPointers());
      render();
      return game.snapshot();
    },
    snapshot: () => game.snapshot(),
  };
  let sampleId = 0;
  if (options.mouse) {
    world.addEventListener('pointermove', event => {
      const rect = world.getBoundingClientRect();
      const scale = Math.min(rect.width / 1600, rect.height / 900);
      const left = rect.left + (rect.width - 1600 * scale) / 2;
      const top = rect.top + (rect.height - 900 * scale) / 2;
      const x = (event.clientX - left) / (1600 * scale);
      const y = (event.clientY - top) / (900 * scale);
      setPointers(x >= 0 && x <= 1 && y >= 0 && y <= 1
        ? [{ id: 'debug-mouse', x, y, active: true, sampleId: ++sampleId }] : []);
    });
    world.addEventListener('pointerleave', () => setPointers([]));
  }
  return snapshot => {
    text.textContent = JSON.stringify({
      mode: options.mouse ? 'DEBUG MOUSE — no camera' : 'DEBUG CAMERA',
      state: snapshot.state, scene: snapshot.sceneId, spot: snapshot.spotId,
      paws: snapshot.paws, scratchProgress: snapshot.dog.progress,
      hint: snapshot.dog.hintLevel, paused: snapshot.paused,
      bonus: snapshot.bonus, pointers: getPointers(),
      bonusRate: options.bonusRate, cameoRate: options.cameoRate,
    }, null, 2);
  };
}
