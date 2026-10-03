const video = document.getElementById("video");
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const setupOverlay = document.getElementById("setupOverlay");
const controls = document.getElementById("controls");
const statusEl = document.getElementById("status");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const popsEl = document.getElementById("pops");
const levelEl = document.getElementById("level");
const timeLeftEl = document.getElementById("timeLeft");
const cameraGroup = document.getElementById("cameraGroup");
const difficultyGroup = document.getElementById("difficultyGroup");
const startBtn = document.getElementById("startBtn");

let selectedDeviceId = null;
let previewStream = null;

let width = 0;
let height = 0;
let balloons = [];
let particles = [];
let rings = [];
let lastSpawnAt = 0;
let lastFrameAt = performance.now();
let gameOver = false;
let score = 0;
let pops = 0;
let lives = 5;
let level = 1;
let mode = "idle";
let modeUntil = 0;
let levelStartAt = 0;
let levelDurationMs = 0;
let combo = 0;
let comboUntil = 0;
let pointers = [
  { x: -9999, y: -9999, active: false },
  { x: -9999, y: -9999, active: false },
];
let usingMouse = true;
let handReady = false;
let audioCtx = null;
let lastPopSoundAt = 0;

const balloonColors = ["#f94144", "#f3722c", "#f8961e", "#43aa8b", "#4d96ff", "#c77dff"];

const DIFFICULTY = {
  easy: {
    lives: 10,
    radiusMin: 48, radiusMax: 78,
    speedMin: 28, speedMax: 68,
    hitMul: 1.2,
    extraLifeEvery: 1,
    levelCap: 8,
    durationBase: 40000, durationStep: 800, durationMin: 28000,
    spawnMinBase: 800, spawnMinStep: 25, spawnMinFloor: 400,
    spawnMaxBase: 1300, spawnMaxStep: 30, spawnMaxFloor: 600,
    speedStep: 0.06, driftStep: 0.04,
  },
  medium: {
    lives: 5,
    radiusMin: 24, radiusMax: 48,
    speedMin: 42, speedMax: 112,
    hitMul: 0.92,
    extraLifeEvery: 2,
    levelCap: 12,
    durationBase: 34000, durationStep: 1100, durationMin: 21000,
    spawnMinBase: 620, spawnMinStep: 40, spawnMinFloor: 180,
    spawnMaxBase: 960, spawnMaxStep: 45, spawnMaxFloor: 300,
    speedStep: 0.1, driftStep: 0.07,
  },
  hard: {
    lives: 3,
    radiusMin: 16, radiusMax: 34,
    speedMin: 60, speedMax: 140,
    hitMul: 0.8,
    extraLifeEvery: 3,
    levelCap: 15,
    durationBase: 28000, durationStep: 1200, durationMin: 16000,
    spawnMinBase: 480, spawnMinStep: 45, spawnMinFloor: 120,
    spawnMaxBase: 780, spawnMaxStep: 50, spawnMaxFloor: 200,
    speedStep: 0.13, driftStep: 0.09,
  },
};

let difficulty = DIFFICULTY.medium;

function getLevelConfig(levelNum) {
  const d = difficulty;
  const clamped = Math.min(levelNum, d.levelCap);
  return {
    durationMs: Math.max(d.durationMin, d.durationBase - clamped * d.durationStep),
    spawnMinMs: Math.max(d.spawnMinFloor, d.spawnMinBase - clamped * d.spawnMinStep),
    spawnMaxMs: Math.max(d.spawnMaxFloor, d.spawnMaxBase - clamped * d.spawnMaxStep),
    speedMul: 1 + clamped * d.speedStep,
    driftMul: 1 + clamped * d.driftStep,
  };
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function spawnBalloon(cfg) {
  const d = difficulty;
  const radius = rand(d.radiusMin, d.radiusMax);
  balloons.push({
    x: rand(radius + 8, width - radius - 8),
    y: height + radius + rand(0, 80),
    radius,
    speed: rand(d.speedMin, d.speedMax) * cfg.speedMul,
    drift: rand(-15, 15) * cfg.driftMul,
    color: balloonColors[Math.floor(Math.random() * balloonColors.length)],
    phase: rand(0, Math.PI * 2),
  });
}

function drawBalloon(balloon, t) {
  const bob = Math.sin(t * 0.0025 + balloon.phase) * 2.3;
  const x = balloon.x + bob;
  const y = balloon.y;
  const r = balloon.radius;

  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.9, r, 0, 0, Math.PI * 2);
  ctx.fillStyle = balloon.color;
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.ellipse(x - r * 0.22, y - r * 0.28, r * 0.16, r * 0.22, -0.35, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.94);
  ctx.lineTo(x - 2, y + r + 7);
  ctx.lineTo(x + 2, y + r + 7);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,240,200,0.95)";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x, y + r + 7);
  ctx.quadraticCurveTo(x + Math.sin(balloon.phase + t * 0.003) * 10, y + r + 20, x, y + r + 35);
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 1.3;
  ctx.stroke();
}

function drawPointer() {
  for (const p of pointers) {
    if (!p.active) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 213, 79, 0.22)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffd54f";
    ctx.fill();
  }
}

function burst(x, y, color) {
  const shardCount = 16;
  for (let i = 0; i < shardCount; i += 1) {
    const ang = (Math.PI * 2 * i) / shardCount + rand(-0.18, 0.18);
    const speed = rand(130, 290);
    particles.push({
      x,
      y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      size: rand(2, 5),
      color,
      life: rand(0.22, 0.38),
      age: 0,
      drag: rand(0.84, 0.93),
      gravity: rand(180, 260),
    });
  }

  rings.push({
    x,
    y,
    radius: 8,
    growth: rand(260, 380),
    life: 0.24,
    age: 0,
    color,
  });
}

function ensureAudioReady() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) {
    return false;
  }
  if (!audioCtx) {
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return true;
}

function playPopSound(size = 1) {
  const nowMs = performance.now();
  if (nowMs - lastPopSoundAt < 35) {
    return;
  }
  lastPopSoundAt = nowMs;

  if (!ensureAudioReady()) {
    return;
  }

  const now = audioCtx.currentTime;
  const gain = audioCtx.createGain();
  const osc = audioCtx.createOscillator();
  const noise = audioCtx.createBufferSource();
  const noiseFilter = audioCtx.createBiquadFilter();
  const noiseGain = audioCtx.createGain();

  osc.type = "triangle";
  const startFreq = rand(250, 370) * (1 + size * 0.08);
  const endFreq = rand(88, 132);
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.09);

  const peak = 0.11 + size * 0.015;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

  const frameCount = Math.floor(audioCtx.sampleRate * 0.12);
  const buffer = audioCtx.createBuffer(1, frameCount, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frameCount);
  }
  noise.buffer = buffer;

  noiseFilter.type = "highpass";
  noiseFilter.frequency.value = 1300;

  noiseGain.gain.setValueAtTime(0.04, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(audioCtx.destination);

  osc.start(now);
  osc.stop(now + 0.12);
  noise.start(now);
  noise.stop(now + 0.085);
}

function drawEffects(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.age += dt;
    if (p.age >= p.life) {
      particles.splice(i, 1);
      continue;
    }
    p.vx *= p.drag;
    p.vy = p.vy * p.drag + p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const alpha = 1 - p.age / p.life;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.7})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 0.66 * alpha + 0.7, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
  }

  for (let i = rings.length - 1; i >= 0; i -= 1) {
    const ring = rings[i];
    ring.age += dt;
    if (ring.age >= ring.life) {
      rings.splice(i, 1);
      continue;
    }
    ring.radius += ring.growth * dt;
    const alpha = 1 - ring.age / ring.life;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.55})`;
    ctx.lineWidth = 2 + alpha * 1.6;
    ctx.stroke();
  }
}

function updateHud() {
  scoreEl.textContent = String(score);
  livesEl.textContent = String(lives);
  popsEl.textContent = String(pops);
  levelEl.textContent = String(level);
  if (mode === "level") {
    const left = Math.max(0, Math.ceil((modeUntil - performance.now()) / 1000));
    timeLeftEl.textContent = String(left);
  } else {
    timeLeftEl.textContent = "0";
  }
}

function startLevel(now) {
  mode = "level";
  levelStartAt = now;
  const cfg = getLevelConfig(level);
  levelDurationMs = cfg.durationMs;
  modeUntil = now + levelDurationMs;
  setStatus(`LEVEL ${level} START`);
  updateHud();
}

function clearLevel(now) {
  const bonus = 40 + level * 20;
  score += bonus;
  const earnLife = level % difficulty.extraLifeEvery === 0;
  if (earnLife) {
    lives += 1;
  }
  updateHud();
  setStatus(`LEVEL ${level} CLEAR +${bonus}${earnLife ? " | +1 LIFE" : ""}`);
  mode = "intermission";
  modeUntil = now + 2400;
}

function drawArcadeBanner(now) {
  if (mode !== "intermission") {
    return;
  }
  const remaining = Math.max(0, (modeUntil - now) / 1000);
  const alpha = Math.min(1, remaining / 0.35, 1);
  ctx.fillStyle = `rgba(0, 0, 0, ${0.4 * alpha})`;
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 44px Trebuchet MS, sans-serif";
  ctx.fillText(`LEVEL ${level} CLEAR`, width / 2, height / 2 - 15);
  ctx.fillStyle = "#ffd54f";
  ctx.font = "700 24px Trebuchet MS, sans-serif";
  ctx.fillText("Get ready...", width / 2, height / 2 + 25);
}

function popAtPointers(now) {
  let popped = false;
  for (const p of pointers) {
    if (!p.active) continue;
    for (let i = balloons.length - 1; i >= 0; i -= 1) {
      const b = balloons[i];
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const d2 = dx * dx + dy * dy;
      const hitR = b.radius * difficulty.hitMul;
      if (d2 <= hitR * hitR) {
        burst(b.x, b.y, b.color);
        playPopSound(Math.max(0.8, b.radius / 34));
        balloons.splice(i, 1);
        pops += 1;
        if (now <= comboUntil) {
          combo += 1;
        } else {
          combo = 1;
        }
        comboUntil = now + 850;
        score += 8 + combo * 2;
        updateHud();
        statusEl.textContent = combo > 1 ? `Combo x${combo}` : "Nice pop!";
        popped = true;
        break;
      }
    }
  }
  if (!popped && now - lastSpawnAt > 1200) {
    statusEl.textContent = "Track a balloon with your fingertip.";
  }
}

function tick(now) {
  const dt = Math.min((now - lastFrameAt) / 1000, 0.05);
  lastFrameAt = now;
  ctx.clearRect(0, 0, width, height);

  if (!gameOver && mode === "intermission" && now >= modeUntil) {
    level += 1;
    startLevel(now);
  }

  if (!gameOver && mode === "level") {
    const cfg = getLevelConfig(level);
    if (now - lastSpawnAt > rand(cfg.spawnMinMs, cfg.spawnMaxMs) && now < modeUntil) {
      spawnBalloon(cfg);
      lastSpawnAt = now;
    }
  }

  for (let i = balloons.length - 1; i >= 0; i -= 1) {
    const b = balloons[i];
    b.y -= b.speed * dt;
    b.x += Math.sin(now * 0.001 + b.phase) * b.drift * dt;
    b.x = Math.max(b.radius + 6, Math.min(width - b.radius - 6, b.x));
    drawBalloon(b, now);

    if (b.y < -b.radius - 20) {
      balloons.splice(i, 1);
      lives -= 1;
      updateHud();
      if (lives <= 0) {
        gameOver = true;
        statusEl.textContent = `Game over. Final score: ${score}`;
      }
    }
  }

  if (!gameOver && mode === "level") {
    popAtPointers(now);
  }

  if (!gameOver && mode === "level" && now >= modeUntil && balloons.length === 0) {
    clearLevel(now);
  }

  drawEffects(dt);
  drawPointer();
  drawArcadeBanner(now);
  updateHud();

  if (gameOver) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 44px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("GAME OVER", width / 2, height / 2 - 15);
    ctx.font = "700 26px Trebuchet MS, sans-serif";
    ctx.fillStyle = "#ffd54f";
    ctx.fillText(`Score: ${score}`, width / 2, height / 2 + 26);
  }

  requestAnimationFrame(tick);
}

function resetGame() {
  balloons = [];
  particles = [];
  rings = [];
  score = 0;
  pops = 0;
  lives = difficulty.lives;
  level = 1;
  combo = 0;
  comboUntil = 0;
  mode = "idle";
  levelStartAt = 0;
  levelDurationMs = 0;
  modeUntil = 0;
  gameOver = false;
  updateHud();
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

function bindMouseFallback() {
  window.addEventListener("mousemove", (event) => {
    if (!usingMouse) {
      return;
    }
    pointers[0].x = event.clientX;
    pointers[0].y = event.clientY;
    pointers[0].active = true;
  });
  window.addEventListener("mouseleave", () => {
    if (usingMouse) {
      pointers[0].active = false;
    }
  });
}

function initHands() {
  if (!window.Hands) {
    setStatus("Hand tracking unavailable, mouse mode enabled.");
    return;
  }

  const hands = new window.Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.65,
  });

  hands.onResults((results) => {
    const landmarks = results.multiHandLandmarks || [];
    if (!landmarks.length) {
      if (!usingMouse) {
        pointers[0].active = false;
        pointers[1].active = false;
      }
      return;
    }

    usingMouse = false;
    handReady = true;

    for (let h = 0; h < 2; h++) {
      if (h < landmarks.length && landmarks[h][8]) {
        const tip = landmarks[h][8];
        pointers[h].x = (1 - tip.x) * width;
        pointers[h].y = tip.y * height;
        pointers[h].active = true;
      } else {
        pointers[h].active = false;
      }
    }
  });

  const handCam = new window.Camera(video, {
    onFrame: async () => {
      await hands.send({ image: video });
    },
    width: 1280,
    height: 720,
  });

  handCam.start();
}

async function enumerateCameras() {
  try {
    // Request a temporary stream to trigger permission prompt, then enumerate
    const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    tempStream.getTracks().forEach((t) => t.stop());
  } catch (_) {
    // permission denied — we'll show whatever enumerateDevices returns
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((d) => d.kind === "videoinput");

  cameraGroup.innerHTML = "";
  cameras.forEach((cam, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toggle-btn";
    btn.dataset.deviceId = cam.deviceId;
    const label = (cam.label || `Camera ${i + 1}`).replace(/\s*\([0-9a-f:]{4,}\)\s*$/i, "").trim();
    btn.textContent = label;
    cameraGroup.appendChild(btn);
  });

  // Auto-select first camera
  if (cameras.length > 0) {
    selectCamera(cameras[0].deviceId);
  }
}

async function startPreview(deviceId) {
  // Stop any existing preview stream
  if (previewStream) {
    previewStream.getTracks().forEach((t) => t.stop());
    previewStream = null;
  }

  try {
    previewStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = previewStream;
    await video.play();
  } catch (err) {
    console.error("Preview failed:", err);
  }
}

function selectCamera(deviceId) {
  selectedDeviceId = deviceId;
  cameraGroup.querySelectorAll(".toggle-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.deviceId === deviceId);
  });
  startPreview(deviceId);
  updateStartBtn();
}

function updateStartBtn() {
  const hasDifficulty = difficultyGroup.querySelector(".toggle-btn.active") !== null;
  startBtn.disabled = !(selectedDeviceId && hasDifficulty);
}

async function start() {
  try {
    ensureAudioReady();

    // Stop preview stream — we'll use the same device for the game stream
    if (previewStream) {
      previewStream.getTracks().forEach((t) => t.stop());
      previewStream = null;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();

    resetGame();
    startLevel(performance.now());
    setupOverlay.style.display = "none";
    setStatus("Game live. Pop balloons with your finger.");
    initHands();
    setTimeout(() => {
      if (!handReady) {
        setStatus("No hand detected yet. Move your hand into frame or use mouse.");
      }
    }, 2800);
  } catch (err) {
    setupOverlay.style.display = "flex";
    setStatus("Camera error. Try another camera or check permissions.");
    console.error(err);
  }
}

// --- Event listeners ---

cameraGroup.addEventListener("click", (e) => {
  const btn = e.target.closest(".toggle-btn");
  if (!btn) return;
  selectCamera(btn.dataset.deviceId);
});

difficultyGroup.addEventListener("click", (e) => {
  const btn = e.target.closest(".toggle-btn");
  if (!btn) return;
  difficulty = DIFFICULTY[btn.dataset.difficulty];
  difficultyGroup.querySelectorAll(".toggle-btn").forEach((b) => {
    b.classList.toggle("active", b === btn);
  });
  updateStartBtn();
});

startBtn.addEventListener("click", () => {
  if (!startBtn.disabled) start();
});

window.addEventListener("resize", resize);
bindMouseFallback();
resize();
updateHud();
setStatus("Pick a camera and difficulty.");
requestAnimationFrame(tick);
enumerateCameras();
