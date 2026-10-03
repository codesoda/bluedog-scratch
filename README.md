# Blue Dog Scratch

A webcam game for little hands. Find the blue dog, point at him, and wiggle your finger over his tummy. Six scratches bring a celebration and a new scene.

## Run locally

Use Node.js 22.12 or newer. Desktop Chrome is the primary target.

```sh
npm ci
npm run dev
```

Open the printed localhost address. Click **LET'S PLAY** once and allow camera access. Hold up an index finger. After the visual countdown, all gameplay uses your hand. Play seated or standing; small movements are enough.

Do not open `index.html` directly from disk. Camera access requires localhost or HTTPS. If the camera is unavailable, the game shows an adult-facing retry message rather than switching normal gameplay to a mouse.

Starting the dev server or building prepares the tracking assets automatically. First setup downloads Google's pinned hand-landmarker model (about 8 MB) and copies the installed MediaPipe WASM files. Its SHA-256 is verified. The game serves these files locally; it does not fetch runtime models from a CDN.

## What is included

- Four illustrated, layered SVG worlds: backyard, bedroom, lounge, and playground.
- Mirrored index-finger tracking, smoothed paw pointers, and generous targets.
- Find, reveal, scratch, progressive reactions, and six-paw celebrations.
- Hints that grow stronger without a timeout or a loss state.
- Orange-dog surprises with cooldown and drought protection. Missing one has no penalty.
- Decorative parent cameos, ambient animation, and playful optional props.
- Continuous scene changes without repeating the previous scene.
- Quiet synthesized feedback, mute, full screen, and an adult camera stop control.
- Hand-loss pause, reacquisition safeguards, and opt-in debugging.
- Retry and camera cleanup if inference stops working, with no queued frames across a tab pause.

Orange-dog rewards are decorative. They do not replace one of the six required blue-dog scratches. No two-handed gesture is required.

All artwork is code-native SVG. No image-generation quota is used. The characters are intended for the private family prototype in the PRD. There is no show name, logo, or official affiliation. Review character rights before any public distribution.

## Privacy

Camera frames and hand inference stay in the browser. The game does not upload, record, save screenshots, send analytics, or require a backend. It requests video only, not a microphone. It stores only an adult sound preference in local storage.

The parent controls can show a small local camera preview or release the camera. Leaving the page releases camera resources. The inference worker handles one frame at a time, without a frame queue.

## Build and static hosting

```sh
npm run build
npm run preview
```

Upload the complete `dist/` directory to a static HTTPS host. Include its model and WASM directories. Serve `.wasm` as `application/wasm` and `.task` as `application/octet-stream`. Do not deploy only `index.html` or omit large model files. No API keys, server functions, or accounts are needed.

The default build uses relative asset paths. For a known nested path:

```sh
BASE_PATH=/family/blue-dog/ npm run build
```

The production build bundles JavaScript and serves inference assets from the same host. First setup/build needs network access for dependencies and the pinned model; a built game does not need third-party requests.

### GitHub Actions and Pages

`.github/workflows/pages.yml` follows the reference games' checks-and-deploy pattern. Pull requests to `main`, pushes to `main`, and manual runs use Node.js 24 and locked dependencies. Checks run all unit tests, build the game, and test that build in Chrome, including local inference at a nested hosting path. AIslop must score at least **95**. The production dependency audit must find no vulnerabilities. The full audit blocks every finding except the one approved, expiring development-only exception below.

Only successful `main` runs can deploy. The workflow uploads the complete tested `dist/` directory and gives Pages permissions only to the deployment job. It keeps quality reports for 14 days and saves browser reports and traces on failure. Actions are pinned to the same commit versions as the reference games.

To enable deployment in the GitHub repository, select **Settings → Pages → Build and deployment → Source → GitHub Actions**, then push to `main` or run the workflow. Relative asset paths support a repository site without hardcoding its name. The site needs HTTPS for camera access.

The public repository is [codesoda/bluedog-scratch](https://github.com/codesoda/bluedog-scratch). Pages uses GitHub Actions and targets https://codesoda.github.io/bluedog-scratch/. That URL is not live until a deployment succeeds.

The owner approved a seven-day exception for **GHSA-vfj7-8cjw-p6xm**, only in the pinned development chain `aislop@0.16.1 → micromatch@4.0.8 → braces@3.0.3`. It expires on **10 October 2026 at 01:32:23 UTC**. The audit gate rejects new advisories, changed versions, extra installed copies, production findings, service errors, and expired approval. Raw audits and the policy result remain available as CI artifacts. See `docs/security/audit-exception.json` and `docs/validation.md`.

Expiry blocks future checks and deployments while the affected dependency remains installed. It does not take down a site already deployed. The exception is accepted risk, not a dependency fix.

The project owner approved public publication. This approval is not a character-rights clearance. Review character rights before wider distribution.

## Validate

```sh
npm test
npm run build
npm run test:browser
npm run check:quality
npm run check:audit
# All gates, including AIslop and the audit policy:
npm run check
```

Browser tests use installed Google Chrome. The CI workflow installs Chrome and its system dependencies. Tests use deterministic debug input and a synthetic camera, not a real webcam.

AIslop's default engines are configured in `.aislop/config.yml`. Its CI gate fails below **95**. Telemetry is disabled. `.aislopignore` excludes generated files, binaries, and downloaded reference code, not application source. The final validation results and remaining manual checks are recorded in `docs/validation.md`.

## Debugging

Examples:

```text
?debug=true&input=mouse&scene=backyard&seed=family
?debug=true&camera=true
?debug=true&bonusRate=1&cameoRate=1
?scene=bedroom
```

`scene` accepts `backyard`, `bedroom`, `lounge`, or `playground`. Rates are clamped to 0–1. `seed` makes random choices repeatable. `camera=true` opts into a local preview. Mouse simulation requires **both** `debug=true` and `input=mouse`; it is not available during normal play.

Debug mode shows game state, target regions, progress, hand landmarks, and performance information. It also exposes `window.__BLUE_DOG__` with manual stepping for automated tests. That interface and the debug panel are absent from normal mode.

## Manual webcam and child playtest

Automated checks do not establish real-camera latency, frame rate on every computer, or child enjoyment. Before calling the prototype family-ready:

1. Allow, reject, and retry camera permission. Try an unplugged or busy camera.
2. Move left/right and check that the pointer feels like a mirror.
3. Play seated with gentle movement. Hold a finger still; jitter must not finish a scratch.
4. Move a hand out of view during scratching and a surprise. Return elsewhere; the jump must not add scratch progress.
5. Add a second hand and cross hands. Check pointer stability and one-paw-per-scratch behaviour.
6. Leave the tab and return. Stop/resume the camera from parent controls.
7. Complete six scratches. Check celebration and automatic scene change in all four scenes.
8. Miss orange-dog appearances. Check that no progress is removed and the blue dog remains available.
9. Leave the dog unfound and watch escalating visual/audio hints.
10. Check mute, camera preview, full screen, smaller windows, and reduced-motion settings.
11. Let a five-year-old try without verbal instructions. Check discovery, rubbing, bonus excitement, and voluntary replay.

Tune scratch thresholds, hint timing, and bonus duration after this test. Do not add forceful movement or penalties to solve tracking problems.

## Source and assets

`docs/prd.md` holds the product requirements. `docs/implementation-contract.md` records the parallel module boundaries. The small downloaded `docs/reference/` files are implementation references from `codesoda/balloon-pop`, not bundled game code.

MediaPipe Tasks Vision is an Apache-2.0 dependency. The hand model comes from Google's versioned MediaPipe model distribution. See `docs/third-party.md` for provenance. SVG art and synthesized audio are authored in this project.
