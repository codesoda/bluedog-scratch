import { cp, mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const modelDir = path.join(root, 'public/models');
const modelPath = path.join(modelDir, 'hand_landmarker.task');
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const expectedHash = 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(modelDir, { recursive: true });
const wasmDir = path.join(root, 'public/mediapipe/wasm');
await cp(path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm'), wasmDir, { recursive: true });
// Module workers cannot importScripts() the classic loaders, so the worker's
// self.import bridge imports these ES-module adapters instead (no eval).
for (const loader of ['vision_wasm_internal.js', 'vision_wasm_nosimd_internal.js']) {
  const source = await readFile(path.join(wasmDir, loader), 'utf8');
  if (!/\bvar ModuleFactory\s*=/.test(source)) throw new Error(`${loader} does not declare ModuleFactory; cannot build its module adapter.`);
  // The classic loader's block-scoped debug function relies on sloppy-mode
  // hoisting. Supply its outer binding for strict ES-module execution.
  const strictDebugBinding = 'const custom_dbg = (...args) => console.warn(...args);';
  await writeFile(path.join(wasmDir, `${loader}.mjs`), `${strictDebugBinding}\n${source}\nexport default ModuleFactory;\n`);
}
let valid = false;
try { valid = hash(await readFile(modelPath)) === expectedHash; } catch { /* First setup. */ }
if (!valid) {
  console.log('Downloading the pinned MediaPipe hand model (build time only)…');
  const response = await fetch(modelUrl, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Model download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== expectedHash) throw new Error('Model integrity check failed. No unverified model was saved.');
  const temporary = `${modelPath}.partial`;
  try { await writeFile(temporary, bytes); await rename(temporary, modelPath); }
  finally { await rm(temporary, { force: true }); }
}
console.log('Local MediaPipe WASM and model ready. Model SHA-256 verified.');
