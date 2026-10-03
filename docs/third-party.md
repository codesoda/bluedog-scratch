# Third-party provenance

## MediaPipe Tasks Vision

- Package: `@mediapipe/tasks-vision`, pinned to 0.10.32.
- Publisher project: Google AI Edge / MediaPipe.
- Package license: Apache-2.0, as reported by the npm package.
- Official integration guide: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- Build copies WASM loaders/binaries from the installed package into `public/mediapipe/wasm/`.
- Build also creates local `.mjs` adapters with a default `ModuleFactory` export. A debug-function binding preserves the loader's classic-script behavior in strict modules. The worker loads these adapters without `eval` or runtime code synthesis.

## Hand-landmarker model

- Versioned source: https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
- SHA-256: `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`.
- `scripts/prepare-tracking.mjs` verifies the downloaded bytes before saving them.
- Official model information: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker#models
- Runtime inference is local. Model and WASM requests go to the game's own static host.

## Reference code

`docs/reference/balloon-pop-app.js.txt` and `docs/reference/balloon-pop-index.html.txt` were fetched from `codesoda/balloon-pop` through the GitHub contents API. They show the existing mirrored landmark-8 interaction approach. They are not imported, bundled, or served as game modules. Do not treat their inclusion as permission to redistribute unrelated reference assets.

## Character artwork

Project-authored SVG illustrations represent the blue/orange family-dog prototype requested in the PRD. No official show artwork, recordings, logos, or title treatments are imported. Character resemblance does not establish permission for public or commercial distribution. Keep this prototype private unless the relevant rights are cleared.

## Build and validation tools

Vite, Playwright, and AIslop are development dependencies pinned in `package.json` and `package-lock.json`. They are not game frameworks or runtime backend services. AIslop telemetry is disabled in the project configuration.
