# Validation results

## Automated checks

The final `npm run check` passes:

- **162 unit tests passed.** Zero failures and zero skipped tests. This includes 37 audit-policy cases.
- **41 desktop Chrome browser tests passed.**
- **Production build passed.** The complete static bundle is in `dist/` (about 30 MB, including local inference assets).
- **AIslop CI passed: 97–98/100 across the latest runs.** `.aislop/config.yml` retains `ci.failBelow: 95` and disables telemetry.
- **The dependency audit has an unresolved development-only advisory.** It reports three high-severity dependency entries for the chain `aislop → micromatch → braces`. The actual advisory is [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), affecting `braces` through 3.0.3. No patched version is listed. Audit responses vary between runs, including zero-result responses; those do not establish remediation. The production-only audit reports zero vulnerabilities.

All five enabled AIslop engines ran. Three non-blocking maintainability warnings remain: the SVG scene-art file and renderer are large, and the character-rig constructor is long. The score is 97 when AIslop includes the development dependency advisory, and 98 when the audit response omits it. No AIslop rules, weights, thresholds, or application-source exclusions were weakened to pass its gate. Do not use `npm audit fix --force`: its suggested AIslop downgrade is not a verified fix.

## CI and Pages deployment

`.github/workflows/pages.yml` follows the `coin-quest` and `skater-dudes` reference workflows. It uses pinned actions, Node.js 24, Chrome browser tests, the 95-point AIslop gate, and a separate full dependency audit. Successful `main` runs deploy only the complete tested build. Pull requests never deploy.

- **Actionlint passed** for the workflow.
- **162 unit tests and 41 Chrome browser tests passed** in the latest GitHub-hosted Linux run.
- **Production build passed**, including the verified local model and worker adapters.
- **Quality-report JSON parses correctly** and retains the scan findings.

The project owner approved public publication. The public repository is `codesoda/bluedog-scratch`, and Pages is configured to use GitHub Actions. Its target URL is https://codesoda.github.io/bluedog-scratch/.

[The first GitHub-hosted Linux run](https://github.com/codesoda/bluedog-scratch/actions/runs/37085874180) passed all 105 unit tests, all 26 Chrome browser tests, the production build, and AIslop at **97/100**. Its full dependency audit failed on the known `braces` advisory. The workflow saved quality evidence and correctly skipped site upload and deployment.

The owner then approved a seven-day exception for this advisory only. `npm run check:audit` runs both full and production audits, saves their raw reports, and checks a fail-closed policy. The approval expires at **2026-10-10T01:32:23.453Z**. It permits only the exact development chain recorded in `docs/security/audit-exception.json`. New advisories, changed versions, additional installed copies, production findings, audit failures, malformed reports, and expired approval remain blocking. The policy enforces expiry for the affected installed version even when the audit service returns zero findings. This accepts risk; it does not fix the dependency.

An independent review found that inherited npm settings could omit development findings from the full audit. The runner now explicitly includes development, optional, and peer dependencies. A manual check with both `NODE_ENV=production` and `npm_config_omit=dev` still reports all three approved entries and a clean production audit.

Expiry blocks future deployments, not an already deployed site.

[The latest GitHub-hosted Linux run](https://github.com/codesoda/bluedog-scratch/actions/runs/37092429516) passed **162 unit tests**, **41 Chrome browser tests**, the production build, AIslop at **98/100**, and the scoped audit policy. The raw full audit retains the three approved development entries. The production audit reports **zero vulnerabilities**. Pages deployed successfully.

The live site at **https://codesoda.github.io/bluedog-scratch/** returns HTTP 200. A hosted Chrome smoke test verifies:

- Normal startup keeps the camera off and exposes no debug interface.
- The live hand-finding screen shows the upright index-finger picture and the paw-pointer explanation. A separate hosted check verifies both, with zero page errors.
- The synthetic camera starts local worker inference at the actual repository path.
- The model, WASM, and module-loader adapter load from the same host.
- The downloaded model matches the pinned SHA-256.
- WASM and module-loader MIME types are valid.
- The new live hand-finding mirror shares the tracker stream; stopping setup clears it and releases tracking.
- A hosted debug-input playthrough completes six scratches, awards one star, shows the finished screen, and resets progress on replay.
- The hosted scratch target shows the patting hand and “Keep wiggling” prompt.
- No page errors or third-party requests occur.

These checks use Chrome's synthetic camera, not a real hand.

## Browser coverage

Tests cover:

- Camera stays off until the adult starts the game.
- Startup and hand finding show an upright index-finger illustration and explain the paw-in-circle pointer.
- The live local mirror shares the existing camera stream, with mirrored landmark and paw overlays.
- A steady-hand interval precedes the countdown. Injected flickering detections reset the countdown and show a slow-movement hint.
- Lost-hand guidance appears in the center during paused interaction and clears on return.
- Settings default to six whole scenes and allow 1–15. One completed scene awards one star.
- Eight scenes require 48 scratches and end with eight stars. Setting changes apply to the next go.
- Finishing freezes progression and releases both previews. “Play again” resets progress and reacquires the camera.
- The patting hand stays over the scratch target, restores the paw outside it, and respects reduced motion. Static pointers and jitter still cannot earn progress.
- The guide stays available on narrow and short windows, including reduced-motion mode.
- Camera denial, retry, pending-permission cancellation, and late rejection.
- Local worker inference using Chrome's **synthetic camera**, at root and nested static hosting paths.
- Explicit local main-thread fallback when workers are unavailable.
- Missing model and runtime worker-crash errors, with camera resource cleanup.
- Simulated page-cache restoration during hand wait.
- Find/reveal/scratch progression in all four scenes.
- Six normal scratches, celebration, and automatic selection of a different scene.
- Hint escalation with no blue-dog timeout.
- Stationary-pointer jitter rejection and partial-progress preservation across hand loss and adult camera stop.
- Orange-dog deadlines pause on hand loss; bonus rewards do not change required progress.
- All **28 hiding spots at all five hint levels** have visible clue centers within their reveal target: 140 geometry cases.
- Small feedback particles, reduced-motion feedback, narrow layouts, and mute preference persistence.
- No third-party runtime requests in normal startup/debug play or worker-inference startup.

Screenshots in `artifacts/` show the start screen, four revealed scenes, celebration, live hand finding, centered recovery guidance, patting feedback, and the turn-finished screen. Gameplay screenshots use deterministic opt-in debug input with diagnostic overlays hidden for visual inspection. They are not evidence of real-hand tracking.

## Independent review and corrections

Parallel reviewers checked camera lifecycle/privacy and the game/visual contract. A follow-up review checks fixed per-go targets, completion/replay, shared preview cleanup, async startup epochs, and stable-hand countdown resets without finding a blocking defect. Integration now fixes:

- Hidden-hand hints no longer cover camera retry overlays.
- Start, stop, resume, and page-return controls remain usable without resetting progress.
- Optional audio never delays camera startup.
- Movement baselines reset on adult stop, visibility changes, and camera errors.
- MediaPipe's module-worker adapter loads without `eval`. A classic-script debug binding makes it work in strict modules.
- Persistently failing frames produce an adult-facing retry instead of silently skipping forever.
- Immediate tab hide/show cannot queue a second inference frame while the first is still pending.
- Quick finds cannot defer an orange-dog appearance indefinitely. A regression test exercises 720 quick encounters across 20 seeds.
- Reveal regions include side and upper hiding clues, including under-furniture poses and tall objects.

## Verification limits

No real webcam, real child, or speaker listening test was performed. Chrome's synthetic camera proves loading, inference execution, and lifecycle handling; it does not prove real-hand detection quality. Countdown/dropout tests inject controlled landmark results through a mock worker while keeping a synthetic camera stream. They prove gating and UI behavior, not real-hand detection or flicker rates.

The five-year-old success criteria still need a family playtest. Tune scratch travel, jitter gating, bonus duration, and hint timing from that test. Do not claim 60 FPS or a specific real-camera latency on untested hardware.

Desktop Chrome is the verified browser. Safari, Firefox, Edge, mobile, real camera unplugging, and genuine browser back/forward-cache restoration need separate testing. The cache test dispatches lifecycle events rather than performing a real cached navigation.

The owner approved public publication of the family prototype, and Pages deployment is verified. This does not establish character-rights clearance.
