# Implementation contract

Read `docs/prd.md` for product requirements. This document fixes module boundaries for parallel implementation. The initial scope is full V1, a private family prototype, animated code-native SVG art, desktop Chrome first, no backend, and no analytics. The owner later approved public Pages deployment and the follow-up contract below. Do not edit the PRD or downloaded reference files. The reference `docs/reference/balloon-pop-app.js.txt` uses mirrored landmark 8 and two independent pointers. We use modern MediaPipe Tasks Vision, hosted locally. The sections below record the original parallel module boundaries.

## Shared coordinates and input

Use a 1600 × 900 virtual stage, SVG viewBox, contain/letterbox rather than crop. All game data and pointers use normalized x/y in [0,1]; rendering multiplies by 1600/900. Each pointer is `{id: string, x: number, y: number, active: boolean, sampleId: number}`. sampleId increases only on a new tracking result. Real coordinates already mirrored in tracking. Never accumulate movement twice from one sample. Reset motion baselines on loss, leaving a region, resume, or changing owner. Single stable active hand is enough; two pointers are allowed, but cannot award duplicate progress. Main integration owns `index.html`, `js/main.js`, package/config files, scripts, browser tests, README.

## Core owner

Own ONLY `js/game.js`, `js/scenes.js`, `js/gestures.js`, `js/random.js`, and `tests/unit/core*.test.js`. No browser globals in core. Use Node test runner.

`scenes.js` exports `SCENES` object (keys backyard, bedroom, lounge, playground), `SCENE_IDS` array. Each scene has `{id,name,palette,spots,props,bonusSpots,cameos}`. spots each `{id,x,y,kind,pose}` with x,y = center of REVEALED dog's body (not the occluder's center). 6+ spots each scene, well-spaced and safely within stage (roughly x .12-.88, y .35-.78). kind names may vary; document chosen geometry to visual owner. Props each `{id,kind,x,y,w,h}` center coordinates and normalized sizes; 3-5 per scene. Hiding visuals and occluders must align with the same spot data.

`game.js` exports `Game`. Constructor `new Game({rng=Math.random,scene='backyard',bonusRate=0.24,cameoRate=0.30,config={}}={})`. `start()` starts SCENE_INTRO. `update(dtMs,pointers)` advances, with dt clamped for suspension safety. `snapshot()` returns render state. `drainEvents()` returns and clears events. Use active interaction clock; no-hand pauses encounter timers, scratch, bonus deadlines, and dwell. Reaction, celebration and scene transition may continue automatically without hand. Resume cannot scratch via a tracking jump. Blue dog never times out. Six normal scratches per scene; bonus hit is decorative and never reduces required scratches. Choose new scene without repeating, new spot avoids prior two, reactions do not immediately repeat. Bonus scheduler has cooldown + drought protection, can overlay scratching rarely, cannot lose core state. Missing bonus is harmless. Cameos decorative and limited. Adaptive generosity bounded and configurable.

Snapshot minimum fields:
```
{
 state: 'SCENE_INTRO'|'HIDING'|'REVEALED'|'SCRATCHING'|'REACTION'|'CELEBRATION'|'SCENE_TRANSITION',
 sceneId, spotId, sceneNumber, elapsedMs, stateElapsedMs, paws:0..6, bonusHits:0..,
 hasHand:boolean, paused:boolean,
 dog:{x,y,mode,progress:0..1,reaction,pose,hintLevel:0..4,
      revealRect:{x,y,w,h},scratchRect:{x,y,w,h}},
 bonus:null|{x,y,active,hit,remainingMs,totalMs,ageMs},
 cameo:null|{kind,event,x,y,progress:0..1},
 propEffects:[{id,kind,x,y,ageMs,durationMs}]
}
```
Rect x/y are CENTER, w/h full sizes. Events `{type,x?,y?,kind?,progress?}` with types `scene`, `found`, `scratch`, `bonusAppeared`, `bonusHit`, `bonusMiss`, `prop`, `celebration`, `hint`. scratch = completion only; renderer uses progress for progressive wiggle. Initialization and transitions have configurable durations to make tests fast. State exposes current spot immediately after start.

Scratch measures virtual-pixel movement (threshold default about 330px). Ignore jitter using a meaningful displacement gate / anchor rather than summing all tiny noise; reject implausible jumps; preserve accepted partial progress while temporarily leaving/losing hand. Deliberate rough wiggling must succeed. Props use touch with leave-to-rearm / cooldown, cannot obstruct dog interactions.

## Visual owner

Own ONLY `js/renderer.js`, `js/characters.js`, `css/game.css`, `assets/art/*` if needed. Use SVG rendering; no external art/font dependency. Build richly composed warm cartoon scenes with thick outlines, flat colors, distinct suburban backyard/bedroom/lounge/park, foreground occluders, responsive 16:9 stage and expressive blue/orange/parent dogs. No Bluey name/logo in UI. Expressive per-part animated characters (eyes track, ears/tail/leg move, squash/stretch), hiding clue shapes/peeks, reveal, 5+ scratch reactions, exits, celebration. Characters resemble the familiar blue/orange heelers for private use. Generous targets and actual visible objects must match. Use SCENES import as sole coordinate source. Read core files when available, but do not change them. Asset coordinates cannot drift from target data.

`renderer.js` exports `Renderer` with `new Renderer(svgElement,{reducedMotion=false}={})`, `render(snapshot,pointers,{debug=false,fps=60,landmarks=[]}={})`, `handleEvents(events)`, optional `destroy()`. Mutate cached SVG elements rather than rebuilding the complete scene each frame. Change scene geometry only at scene transitions. Draw paw progress, decorative bonus rewards, scratch meter, intuitive animated hand rub/point affordance for child learning, hints, particles, decorative cameos, prop effects, two luminous paw pointers. Do not put startup/error/adult controls in renderer. Debug draws normalized hitboxes, states, threshold/progress, FPS; all absent if debug false. All XML/DOM nodes safe. Main passes regular SVG root `#world`, with `role=img` and title. Main owns overlays outside SVG.

CSS style the HTML IDs/classes below. Calm premium playful game: warm cream page, deep ink blue outlines, lavender/coral/sunshine accents, rounded panels, huge start button, camera status, small adult controls. Prefer system rounded fonts. Controls have visible focus. Reduced motion preference suppresses major animations/particles without hiding feedback. At small screens show stage contained; no cropping targets. Style debug panel only when unhidden.

HTML layout contract: `.app-shell`; header `.masthead` with `.brand-mark`, `.brand-name`, `.brand-subtitle`; `.adult-controls` buttons `#sound-toggle`, `#fullscreen-toggle`, `#settings-toggle`; main `.game-frame` contains SVG `#world`, overlay `#setup-overlay` with `.setup-card`, `.hand-demo`, `.eyebrow`, `#setup-title`, `#setup-message`, `#start-button`, `#retry-button` (hidden), `.privacy-note`, overlay `#hand-hint` (hidden) with `.hand-hint-icon`, `.hand-hint-label`, overlay `#countdown` (hidden), `#loading-progress` optional. Aside `#settings-panel` hidden with buttons `#stop-camera`, `#resume-camera`, checkbox `#camera-preview-toggle`, `.settings-copy`. Footer `.footer-note`, `.footer-pill`. Video `#camera-preview` hidden muted playsinline mirrored via CSS; `#debug-panel` hidden contains `#debug-text`. `[hidden] {display:none!important}` required. During game no child keyboard/mouse needed. Adult controls can use clicks, but optional gameplay UI is dwell-only.

## Tracking owner

Own ONLY `js/hand-tracking.js`, `js/tracking-worker.js`, `js/pointer.js`, `tests/unit/tracking*.test.js`. Import pinned `@mediapipe/tasks-vision` npm dependency 0.10.32. Runtime model URL `${import.meta.env.BASE_URL}models/hand_landmarker.task`, WASM `${import.meta.env.BASE_URL}mediapipe/wasm`; integration prepares these local files. Keep webcam inference local, no CDNs/runtime analytics. Prefer dedicated module Worker with one in-flight transferable ImageBitmap frame, inference throttled ~24-30 Hz; no frame backlog. Worker loads local WASM with VIDEO mode, CPU delegate, two hands. Robust error messages and cleanup. Can support explicit tested fallback if worker has incompatibility; do not silently leave startup stuck. Inspect modern guide: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js . MediaPipe detection is synchronous and should not block rendering.

Export `HandTracker`: `new HandTracker(videoElement,{onFrame,onStatus,onError}={})`; `await start()` obtains front webcam and initializes tracker, resolves when camera + inference are ready (not when first hand appears), emits status text. `stop()` releases all tracks, worker, callbacks/frame loop/bitmaps; `pause()`/`resume()` can stop/restart inference for page visibility, with no stale pointer. onFrame payload `{pointers,landmarks,inferenceMs}`. onError receives Error. Expose `running` bool. Stop/retry while initialization is pending must not leak a camera or worker. Error events from camera track ended handled. Stale tracking/lost detections emit empty pointers; raw landmarks optional debug. Stable pointer identity across output ordering (handedness with duplicate disambiguation or spatial matching); no teleports on swapping hand order. pointer.js pure helpers for landmark-8 mirroring, smoothing (elapsed-time aware), reacquisition reset, no browser globals. Unit tests deterministic. Do not request camera until main's adult start action.

## Audio owner

Own ONLY `js/audio.js`, `tests/unit/audio*.test.js`. Export `AudioManager` with `new AudioManager()`, `await unlock()` invoked directly from start click before asynchronous camera permission; `setMuted(bool)`, getter `muted`, `handleEvents(events)`, `destroy()`. Web Audio synthesized pleasant non-startling bounded sounds for listed events, distinct orange surprise cue, giggle-like playful tones, quiet environmental prop notes and short celebration melody. No speech required, no constant noisy loop. Clamp master volume, cap/polyphony/throttle, honor mute immediately including already-playing tails and avoid resume while muted. On unsupported audio no-op, never prevent gameplay. Sound preference managed by main localStorage (no video stored). Do not access webcam/DOM. Tests use injected or mocked context.

## Approved follow-up contract

- A stage is one complete scene: six blue-dog scratches award one star. A go defaults to six stages and allows 1–15 in parent settings. Changes apply to the next go; the active target is fixed until restart.
- The star tray renders one evenly spaced slot per active target, in balanced rows of at most eight. Completed scenes fill the slots. Pending setting changes do not alter the current tray; replay resets it.
- Snapshots add `completedStages` and `stagesTarget`. `GO_COMPLETE` follows the final celebration, freezes updates, and emits `goComplete` once. No hand is required to finish the celebration.
- The finished screen offers a clickable “Play again” control. Completion releases the camera and both local previews. Replay resets progress and adopts the pending stage setting before requesting the camera again.
- `go-controls.js` owns settings and finish/progress DOM. `hand-readiness.js` is a pure readiness gate: one second of steady tracking, then a three-second countdown. Loss, changed owner, or excessive movement resets it and prompts slow movement.
- `hand-setup-view.js` shares the camera stream for a live mirrored setup view and renders derived hand landmarks and paw pointers. It never requests its own stream and clears its preview at play, stop, error, finish, or page exit.
- Lost tracking during interactive play shows a centered hand-and-paw guide. It must not cover setup/error screens or celebrations that do not need a hand.
- `scratch-hand.js` supplies the centered opening/closing hand and “Keep wiggling” cue. These are feedback only. Gesture rules, motion credit, and jitter rejection do not change.
- Public Pages deployment requires the existing checks and AIslop minimum 95. The owner-approved development advisory exception is exact, time-limited, and separate from runtime security requirements.

## Verification and delivery

Node built-in unit tests, Playwright browser tests for render/startup/missing permission/debug simulation/hitbox scaling/gesture progression/bonus pause/continuous scene transitions. Debug mouse simulation ONLY `?debug=true&input=mouse`; never normal gameplay fallback. Debug exposes `window.__BLUE_DOG__` for browser tests ONLY when debug true: `{game, renderer, setPointers(pointers), step(dt), snapshot()}`. Query params `scene`, `debug`, `camera`, `bonusRate`, `cameoRate`, `seed` validated/clamped. No real webcam or child validation claims. Vite for dev/build only, no game framework. Production all model/WASM local; build works under nested base path and static HTTPS. The later approved delivery uses the checked GitHub Pages workflow. Do not claim real webcam or child validation from synthetic/injected tests.
