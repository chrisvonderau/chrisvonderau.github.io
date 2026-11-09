const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlayText");
const primaryButton = document.getElementById("primaryButton");
const soundButton = document.getElementById("soundButton");
const levelText = document.getElementById("levelText");
const scoreText = document.getElementById("scoreText");
const livesText = document.getElementById("livesText");

const WORLD = { width: 1280, height: 820 };
const START_LIVES = 3;
const PLAYER_W = 42;
const PLAYER_H = 78;
const BALL_R = 20;
const GRAVITY = 1480;
const FLOOR_DIR = [1, -1, 1, -1, 1, -1];

const floors = [
  { x1: 282, x2: 1048, y1: 165, y2: 140 },
  { x1: 138, x2: 1136, y1: 284, y2: 325 },
  { x1: 146, x2: 1140, y1: 420, y2: 376 },
  { x1: 134, x2: 1132, y1: 510, y2: 552 },
  { x1: 142, x2: 1140, y1: 662, y2: 612 },
  { x1: 88, x2: 1198, y1: 748, y2: 775 }
];

const ladders = [
  { x: 410, upper: 0, lower: 1 },
  { x: 898, upper: 0, lower: 1 },
  { x: 565, upper: 1, lower: 2 },
  { x: 1005, upper: 1, lower: 2 },
  { x: 246, upper: 2, lower: 3 },
  { x: 775, upper: 2, lower: 3 },
  { x: 522, upper: 3, lower: 4 },
  { x: 1040, upper: 3, lower: 4 },
  { x: 262, upper: 4, lower: 5 },
  { x: 830, upper: 4, lower: 5 }
];

const keys = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false
};

const player = {
  x: 150,
  y: 0,
  floor: 5,
  jumpOffset: 0,
  jumpVel: 0,
  climbing: null,
  facing: 1,
  invulnerable: 0,
  runTime: 0,
  climbPulse: 0
};

const state = {
  mode: "title",
  level: 1,
  score: 0,
  lives: START_LIVES,
  balls: [],
  sparks: [],
  floats: [],
  clouds: [],
  lastTime: 0,
  spawnTimer: 0,
  throwTimer: 0,
  cameraShake: 0,
  goalGlow: 0,
  soundEnabled: true,
  levelCompleteTimer: 0,
  jumpHeld: false,
  levelStartedAt: 0
};

const audio = {
  ctx: null,
  master: null,
  musicTimer: null,
  step: 0,
  muted: false
};

function floorY(floorIndex, x) {
  const floor = floors[floorIndex];
  const t = clamp((x - floor.x1) / (floor.x2 - floor.x1), 0, 1);
  return lerp(floor.y1, floor.y2, t);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function levelSettings(level) {
  return {
    speed: 138 + level * 18,
    spawnEvery: Math.max(0.82, 2.18 - level * 0.18),
    maxBalls: Math.min(11, 3 + Math.ceil(level * 1.2)),
    skyShift: (level - 1) * 18,
    bonus: 650 + level * 120
  };
}

function resetPlayer() {
  player.floor = 5;
  player.x = floors[5].x1 + 72;
  player.y = floorY(player.floor, player.x);
  player.jumpOffset = 0;
  player.jumpVel = 0;
  player.climbing = null;
  player.facing = 1;
  player.invulnerable = 1.5;
  player.runTime = 0;
}

function resetLevel(keepScore = true) {
  state.balls = [];
  state.sparks = [];
  state.floats = [];
  state.spawnTimer = Math.max(0.9, 1.75 - state.level * 0.08);
  state.throwTimer = 0.35;
  state.cameraShake = 0;
  state.goalGlow = 0;
  state.levelStartedAt = performance.now();
  if (!keepScore) {
    state.score = 0;
  }
  resetPlayer();
  updateHud();
}

function startGame() {
  ensureAudio();
  state.mode = "playing";
  state.level = 1;
  state.score = 0;
  state.lives = START_LIVES;
  resetLevel(false);
  overlay.classList.remove("is-visible");
  playSfx("start");
}

function nextLevel() {
  state.level += 1;
  state.mode = "playing";
  resetLevel(true);
  overlay.classList.remove("is-visible");
  playSfx("start");
}

function showOverlay(kind) {
  overlay.classList.add("is-visible");
  if (kind === "level") {
    primaryButton.textContent = "Next Level";
    overlayText.textContent = `Level ${state.level} complete. The scaffold climbs higher, the gibbon gets faster, and the soccer balls arrive with less warning.`;
  } else if (kind === "gameover") {
    primaryButton.textContent = "Try Again";
    overlayText.textContent = `Curtain call. Your score was ${Math.floor(state.score)}.`;
  } else {
    primaryButton.textContent = "Start Run";
    overlayText.textContent = "A gibbon has taken over the scaffold. Reach the rooftop spotlight before the rolling soccer balls steal the show.";
  }
}

function updateHud() {
  levelText.textContent = String(state.level);
  scoreText.textContent = String(Math.floor(state.score));
  livesText.textContent = String(state.lives);
  soundButton.textContent = state.soundEnabled ? "Sound On" : "Sound Off";
}

function spawnBall() {
  const settings = levelSettings(state.level);
  const top = floors[0];
  const ball = {
    x: top.x1 + 82,
    y: floorY(0, top.x1 + 82) - BALL_R,
    floor: 0,
    dir: FLOOR_DIR[0],
    speed: settings.speed + Math.random() * 24,
    falling: false,
    nextFloor: 1,
    fallSpeed: 0,
    spin: 0,
    scored: false,
    wobble: Math.random() * Math.PI * 2
  };
  state.balls.push(ball);
  addSpark(ball.x, ball.y - 18, "#ffffff", 7);
  playSfx("throw");
}

function addSpark(x, y, color, count = 8) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * 160;
    state.sparks.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.35 + Math.random() * 0.35,
      maxLife: 0.7,
      color
    });
  }
}

function addFloat(text, x, y, color = "#ffffff") {
  state.floats.push({ text, x, y, life: 1, color });
}

function hitPlayer() {
  if (player.invulnerable > 0 || state.mode !== "playing") {
    return;
  }
  state.lives -= 1;
  state.cameraShake = 0.35;
  addSpark(player.x, player.y - 40, "#ff6e5f", 18);
  playSfx("hit");
  if (state.lives <= 0) {
    state.mode = "gameover";
    updateHud();
    showOverlay("gameover");
    stopMusic();
    return;
  }
  resetPlayer();
  state.balls = state.balls.slice(0, Math.max(0, state.balls.length - 2));
  updateHud();
}

function completeLevel() {
  if (state.mode !== "playing") {
    return;
  }
  const settings = levelSettings(state.level);
  state.mode = "level-complete";
  state.score += settings.bonus;
  state.goalGlow = 1.2;
  addFloat(`+${settings.bonus}`, player.x, player.y - 100, "#ffdf5f");
  addSpark(player.x, player.y - 82, "#ffdf5f", 26);
  playSfx("win");
  updateHud();
  showOverlay("level");
}

function handleInput(dt) {
  if (state.mode !== "playing") {
    return;
  }

  const moveSpeed = 246;
  const climbSpeed = 190;
  const floor = floors[player.floor];

  if (player.climbing) {
    const climb = player.climbing;
    player.y += climb.dir * climbSpeed * dt;
    player.x = climb.ladder.x;
    player.climbPulse += dt;
    if (player.climbPulse > 0.22) {
      player.climbPulse = 0;
      playSfx("climb");
    }
    if ((climb.dir < 0 && player.y <= climb.targetY) || (climb.dir > 0 && player.y >= climb.targetY)) {
      player.floor = climb.targetFloor;
      player.y = floorY(player.floor, player.x);
      player.climbing = null;
    }
    return;
  }

  if (keys.left) {
    player.x -= moveSpeed * dt;
    player.facing = -1;
    player.runTime += dt * 9;
  }
  if (keys.right) {
    player.x += moveSpeed * dt;
    player.facing = 1;
    player.runTime += dt * 9;
  }

  player.x = clamp(player.x, floor.x1 + 22, floor.x2 - 22);
  const baseY = floorY(player.floor, player.x);

  if (keys.up) {
    const ladder = nearestLadder("up");
    if (ladder) {
      player.climbing = {
        ladder,
        dir: -1,
        targetFloor: ladder.upper,
        targetY: floorY(ladder.upper, ladder.x)
      };
      player.x = ladder.x;
      player.jumpOffset = 0;
      player.jumpVel = 0;
      return;
    }
  }

  if (keys.down) {
    const ladder = nearestLadder("down");
    if (ladder) {
      player.climbing = {
        ladder,
        dir: 1,
        targetFloor: ladder.lower,
        targetY: floorY(ladder.lower, ladder.x)
      };
      player.x = ladder.x;
      player.jumpOffset = 0;
      player.jumpVel = 0;
      return;
    }
  }

  if (keys.jump && !state.jumpHeld && player.jumpOffset <= 0) {
    player.jumpVel = 610;
    player.jumpOffset = 1;
    state.jumpHeld = true;
    playSfx("jump");
  }
  if (!keys.jump) {
    state.jumpHeld = false;
  }

  if (player.jumpOffset > 0 || player.jumpVel > 0) {
    player.jumpOffset += player.jumpVel * dt;
    player.jumpVel -= GRAVITY * dt;
    if (player.jumpOffset <= 0) {
      player.jumpOffset = 0;
      player.jumpVel = 0;
      addSpark(player.x, baseY - 4, "#dfe8f5", 5);
    }
  }

  player.y = baseY - player.jumpOffset;
}

function nearestLadder(direction) {
  const threshold = 34;
  let best = null;
  let bestDistance = Infinity;
  for (const ladder of ladders) {
    const matches = direction === "up"
      ? ladder.lower === player.floor
      : ladder.upper === player.floor;
    if (!matches) {
      continue;
    }
    const distance = Math.abs(player.x - ladder.x);
    if (distance < threshold && distance < bestDistance) {
      best = ladder;
      bestDistance = distance;
    }
  }
  return best;
}

function updateBalls(dt) {
  const settings = levelSettings(state.level);
  state.spawnTimer -= dt;
  state.throwTimer -= dt;

  if (state.spawnTimer <= 0 && state.balls.length < settings.maxBalls) {
    spawnBall();
    state.spawnTimer = settings.spawnEvery * (0.75 + Math.random() * 0.5);
  }

  for (const ball of state.balls) {
    ball.spin += ball.dir * dt * 7.2;
    ball.wobble += dt * 4;

    if (ball.falling) {
      ball.fallSpeed += 980 * dt;
      ball.y += ball.fallSpeed * dt;
      const targetY = floorY(ball.nextFloor, ball.x) - BALL_R;
      if (ball.y >= targetY) {
        ball.floor = ball.nextFloor;
        ball.y = targetY;
        ball.dir = FLOOR_DIR[ball.floor];
        ball.falling = false;
        ball.fallSpeed = 0;
        addSpark(ball.x, ball.y + BALL_R, "#ffffff", 6);
        playSfx("bounce");
      }
      continue;
    }

    ball.x += ball.dir * ball.speed * dt;
    ball.y = floorY(ball.floor, ball.x) - BALL_R + Math.sin(ball.wobble) * 1.6;
    const floor = floors[ball.floor];
    const atRight = ball.x > floor.x2 - BALL_R;
    const atLeft = ball.x < floor.x1 + BALL_R;
    if (atRight || atLeft) {
      if (ball.floor < floors.length - 1) {
        ball.x = clamp(ball.x, floor.x1 + BALL_R, floor.x2 - BALL_R);
        ball.falling = true;
        ball.nextFloor = ball.floor + 1;
        ball.fallSpeed = 120;
      } else {
        ball.dead = true;
      }
    }

    if (!ball.scored && Math.abs(ball.x - player.x) < 42 && player.y < ball.y - 36 && player.jumpOffset > 34) {
      ball.scored = true;
      state.score += 90;
      addFloat("+90", player.x + 18, player.y - 90, "#62d3ff");
      playSfx("score");
    }
  }

  state.balls = state.balls.filter((ball) => !ball.dead && ball.y < WORLD.height + 80);
}

function updateParticles(dt) {
  for (const spark of state.sparks) {
    spark.life -= dt;
    spark.x += spark.vx * dt;
    spark.y += spark.vy * dt;
    spark.vy += 210 * dt;
  }
  state.sparks = state.sparks.filter((spark) => spark.life > 0);

  for (const floater of state.floats) {
    floater.life -= dt;
    floater.y -= 38 * dt;
  }
  state.floats = state.floats.filter((floater) => floater.life > 0);

  state.cameraShake = Math.max(0, state.cameraShake - dt);
  state.goalGlow = Math.max(0, state.goalGlow - dt);
  player.invulnerable = Math.max(0, player.invulnerable - dt);
}

function checkCollisions() {
  if (player.invulnerable > 0 || state.mode !== "playing") {
    return;
  }
  const rect = {
    x: player.x - PLAYER_W / 2,
    y: player.y - PLAYER_H,
    w: PLAYER_W,
    h: PLAYER_H
  };
  for (const ball of state.balls) {
    if (circleRect(ball.x, ball.y, BALL_R * 0.86, rect)) {
      hitPlayer();
      return;
    }
  }

  const onTopFloor = player.floor === 0 && !player.climbing;
  if (onTopFloor && player.x > 948 && player.y < 180) {
    completeLevel();
  }
}

function circleRect(cx, cy, r, rect) {
  const nearestX = clamp(cx, rect.x, rect.x + rect.w);
  const nearestY = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy < r * r;
}

function update(dt) {
  if (state.mode === "playing") {
    state.score += dt * (8 + state.level * 1.2);
    handleInput(dt);
    updateBalls(dt);
    checkCollisions();
    updateHud();
  }
  updateParticles(dt);
}

function draw() {
  const shake = state.cameraShake > 0 ? state.cameraShake * 12 : 0;
  const sx = (Math.random() - 0.5) * shake;
  const sy = (Math.random() - 0.5) * shake;

  ctx.save();
  ctx.clearRect(0, 0, WORLD.width, WORLD.height);
  ctx.translate(sx, sy);
  drawSky();
  drawCity();
  drawBuilding();
  drawScaffold();
  drawGoal();
  drawGibbon();
  for (const ball of state.balls) {
    drawSoccerBall(ball);
  }
  drawPlayer();
  drawParticles();
  drawVignette();
  ctx.restore();
}

function drawSky() {
  const settings = levelSettings(state.level);
  const shift = settings.skyShift;
  const gradient = ctx.createLinearGradient(0, 0, 0, WORLD.height);
  gradient.addColorStop(0, `hsl(${225 + shift * 0.2}, 60%, ${18 + Math.min(12, state.level)}%)`);
  gradient.addColorStop(0.44, `hsl(${198 - shift * 0.1}, 60%, 28%)`);
  gradient.addColorStop(1, `hsl(${24 + shift * 0.08}, 64%, 22%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  ctx.globalAlpha = 0.7;
  drawBlob(190, 105, 120, "#ffdf5f", 0.24);
  drawBlob(1060, 125, 150, "#62d3ff", 0.18);
  ctx.globalAlpha = 1;

  const t = performance.now() / 1000;
  for (let i = 0; i < 9; i += 1) {
    const x = ((i * 190 + t * (12 + i * 1.4)) % 1480) - 100;
    const y = 58 + (i % 4) * 34;
    drawCloud(x, y, 0.72 + (i % 3) * 0.18);
  }
}

function drawCloud(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
  ctx.beginPath();
  ctx.ellipse(0, 12, 40, 16, 0, 0, Math.PI * 2);
  ctx.ellipse(34, 6, 36, 20, 0, 0, Math.PI * 2);
  ctx.ellipse(74, 14, 48, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCity() {
  const t = performance.now() / 1000;
  drawSkyline(650, 0.28, "#17223a", t * 7);
  drawSkyline(705, 0.5, "#11182d", t * 13);
  drawSkyline(755, 0.76, "#0b1022", t * 20);
}

function drawSkyline(baseY, alpha, color, drift) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  let x = -80 - (drift % 180);
  let i = 0;
  while (x < WORLD.width + 120) {
    const w = 44 + (i % 5) * 19;
    const h = 92 + ((i * 43) % 150);
    ctx.fillRect(x, baseY - h, w, h);
    ctx.fillStyle = "rgba(255, 223, 95, 0.26)";
    for (let wx = x + 9; wx < x + w - 8; wx += 16) {
      for (let wy = baseY - h + 16; wy < baseY - 12; wy += 24) {
        if ((wx + wy + i) % 3 === 0) {
          ctx.fillRect(wx, wy, 5, 7);
        }
      }
    }
    ctx.fillStyle = color;
    x += w + 16;
    i += 1;
  }
  ctx.restore();
}

function drawBuilding() {
  const gradient = ctx.createLinearGradient(0, 120, WORLD.width, WORLD.height);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.08)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0.02)");
  ctx.fillStyle = gradient;
  roundRect(48, 90, 1184, 730, 8);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 2;
  for (let x = 92; x < 1230; x += 82) {
    ctx.beginPath();
    ctx.moveTo(x, 100);
    ctx.lineTo(x - 30, 810);
    ctx.stroke();
  }
  for (let y = 142; y < 790; y += 76) {
    ctx.beginPath();
    ctx.moveTo(54, y);
    ctx.lineTo(1224, y + Math.sin(y) * 8);
    ctx.stroke();
  }
}

function drawScaffold() {
  drawBackTrusses();
  for (const ladder of ladders) {
    drawLadder(ladder);
  }
  for (let i = floors.length - 1; i >= 0; i -= 1) {
    drawPlatform(floors[i], i);
  }
  drawForegroundBolts();
}

function drawBackTrusses() {
  ctx.save();
  ctx.lineWidth = 7;
  ctx.strokeStyle = "rgba(98, 211, 255, 0.22)";
  for (let x = 126; x <= 1154; x += 196) {
    ctx.beginPath();
    ctx.moveTo(x, 128);
    ctx.lineTo(x + 62, 790);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 88, 128);
    ctx.lineTo(x - 22, 790);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLadder(ladder) {
  const yTop = floorY(ladder.upper, ladder.x);
  const yBottom = floorY(ladder.lower, ladder.x);
  const x = ladder.x;
  ctx.save();
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#f5b14c";
  ctx.beginPath();
  ctx.moveTo(x - 19, yTop + 4);
  ctx.lineTo(x - 19, yBottom - 8);
  ctx.moveTo(x + 19, yTop + 4);
  ctx.lineTo(x + 19, yBottom - 8);
  ctx.stroke();

  ctx.lineWidth = 5;
  ctx.strokeStyle = "#ffe1a1";
  for (let y = yTop + 22; y < yBottom - 18; y += 25) {
    ctx.beginPath();
    ctx.moveTo(x - 22, y);
    ctx.lineTo(x + 22, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlatform(floor, index) {
  const dx = floor.x2 - floor.x1;
  const dy = floor.y2 - floor.y1;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);

  ctx.save();
  ctx.translate(floor.x1, floor.y1);
  ctx.rotate(angle);
  ctx.fillStyle = "#25334a";
  roundRect(-18, -16, length + 36, 34, 8);
  ctx.fill();
  ctx.strokeStyle = "#90a5bf";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = index % 2 === 0 ? "#f6bd48" : "#ff6e5f";
  for (let x = -8; x < length + 20; x += 46) {
    ctx.save();
    ctx.translate(x, -13);
    ctx.rotate(-0.42);
    ctx.fillRect(-8, 0, 16, 27);
    ctx.restore();
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.34)";
  for (let x = 18; x < length; x += 82) {
    ctx.beginPath();
    ctx.arc(x, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawForegroundBolts() {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.lineWidth = 3;
  for (let i = 0; i < floors.length - 1; i += 1) {
    const a = floors[i];
    const b = floors[i + 1];
    for (let x = 180; x <= 1100; x += 230) {
      ctx.beginPath();
      ctx.moveTo(x, floorY(i, x) + 15);
      ctx.lineTo(x + 54, floorY(i + 1, x + 54) - 15);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawGoal() {
  const glow = 0.45 + Math.sin(performance.now() / 180) * 0.08 + state.goalGlow * 0.5;
  const x = 1004;
  const y = floorY(0, x) - 12;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const gradient = ctx.createRadialGradient(x, y - 64, 4, x, y - 64, 145 + state.goalGlow * 90);
  gradient.addColorStop(0, `rgba(255, 223, 95, ${glow})`);
  gradient.addColorStop(1, "rgba(255, 223, 95, 0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y - 64, 170, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#ffdf5f";
  ctx.beginPath();
  ctx.ellipse(0, -6, 40, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#fff3b4";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(0, -28, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGibbon() {
  const t = performance.now() / 1000;
  const x = 344;
  const y = floorY(0, x) - 18;
  const armSwing = Math.sin(t * 4) * 10;

  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#5a3726";
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(-28, -64);
  ctx.quadraticCurveTo(-96, -48 + armSwing, -102, 5);
  ctx.moveTo(30, -62);
  ctx.quadraticCurveTo(92, -44 - armSwing, 108, -2);
  ctx.stroke();

  ctx.fillStyle = "#6b432b";
  ctx.beginPath();
  ctx.ellipse(0, -58, 48, 55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#9c6840";
  ctx.beginPath();
  ctx.ellipse(0, -58, 28, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6b432b";
  ctx.beginPath();
  ctx.arc(0, -111, 39, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c58b5e";
  ctx.beginPath();
  ctx.ellipse(0, -105, 24, 19, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1b1110";
  ctx.beginPath();
  ctx.arc(-12, -116, 4, 0, Math.PI * 2);
  ctx.arc(12, -116, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1b1110";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, -103, 11, 0.18, Math.PI - 0.18);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(101, -4, 14, 0, Math.PI * 2);
  ctx.fill();
  drawMiniBall(101, -4, 13, t * 4);
  ctx.restore();
}

function drawPlayer() {
  const t = performance.now() / 1000;
  const walk = Math.sin(player.runTime) * 1;
  const blink = player.invulnerable > 0 && Math.floor(t * 12) % 2 === 0;
  if (blink) {
    ctx.globalAlpha = 0.55;
  }

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.scale(player.facing, 1);

  const legSwing = player.climbing
    ? Math.sin(t * 12) * 13
    : Math.sin(player.runTime) * 12;

  ctx.strokeStyle = "#191b24";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-12, -24);
  ctx.lineTo(-18 - legSwing * 0.18, -2);
  ctx.moveTo(12, -24);
  ctx.lineTo(17 + legSwing * 0.18, -2);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  roundRect(-22, -69 + walk, 44, 42, 8);
  ctx.fill();
  ctx.strokeStyle = "#171923";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = "#171923";
  for (let y = -64; y < -33; y += 11) {
    ctx.fillRect(-20, y + walk, 40, 5);
  }

  ctx.fillStyle = "#e83f3b";
  ctx.beginPath();
  ctx.moveTo(20, -57 + walk);
  ctx.lineTo(42, -48 + walk);
  ctx.lineTo(21, -43 + walk);
  ctx.fill();

  ctx.strokeStyle = "#171923";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-22, -58 + walk);
  ctx.quadraticCurveTo(-42, -48 + legSwing * 0.08, -38, -28);
  ctx.moveTo(22, -58 + walk);
  ctx.quadraticCurveTo(43, -50 - legSwing * 0.08, 38, -28);
  ctx.stroke();

  ctx.fillStyle = "#f8f5ed";
  ctx.beginPath();
  ctx.arc(0, -92 + walk, 23, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#171923";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#171923";
  ctx.beginPath();
  ctx.arc(-8, -94 + walk, 3, 0, Math.PI * 2);
  ctx.arc(8, -94 + walk, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#171923";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-11, -103 + walk);
  ctx.lineTo(-4, -99 + walk);
  ctx.moveTo(11, -103 + walk);
  ctx.lineTo(4, -99 + walk);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -86 + walk, 7, 0.1, Math.PI - 0.1);
  ctx.stroke();

  ctx.fillStyle = "#171923";
  ctx.beginPath();
  ctx.ellipse(-2, -119 + walk, 26, 10, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-13, -129 + walk, 25, 13);

  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawSoccerBall(ball) {
  ctx.save();
  ctx.translate(ball.x, ball.y);
  drawMiniBall(0, 0, BALL_R, ball.spin);
  ctx.restore();
}

function drawMiniBall(x, y, r, spin) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.fillStyle = "#f6f8fb";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#171923";
  polygon(0, 0, r * 0.36, 5);
  ctx.fill();
  ctx.strokeStyle = "#171923";
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i += 1) {
    const a = -Math.PI / 2 + i * Math.PI * 0.4;
    const px = Math.cos(a) * r * 0.72;
    const py = Math.sin(a) * r * 0.72;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.28, Math.sin(a) * r * 0.28);
    ctx.lineTo(px, py);
    ctx.stroke();
    polygon(px, py, r * 0.16, 5);
    ctx.fill();
  }
  ctx.restore();
}

function polygon(x, y, r, sides) {
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const angle = -Math.PI / 2 + i * Math.PI * 2 / sides;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
}

function drawParticles() {
  for (const spark of state.sparks) {
    const alpha = clamp(spark.life / spark.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = spark.color;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, 2 + alpha * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.font = "900 24px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const floater of state.floats) {
    ctx.save();
    ctx.globalAlpha = clamp(floater.life, 0, 1);
    ctx.fillStyle = floater.color;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = 5;
    ctx.strokeText(floater.text, floater.x, floater.y);
    ctx.fillText(floater.text, floater.x, floater.y);
    ctx.restore();
  }
}

function drawVignette() {
  const gradient = ctx.createRadialGradient(
    WORLD.width / 2,
    WORLD.height / 2,
    160,
    WORLD.width / 2,
    WORLD.height / 2,
    760
  );
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.36)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
}

function drawBlob(x, y, r, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function ensureAudio() {
  if (!state.soundEnabled || audio.ctx) {
    if (audio.ctx && audio.ctx.state === "suspended") {
      audio.ctx.resume();
    }
    startMusic();
    return;
  }
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    state.soundEnabled = false;
    updateHud();
    return;
  }
  audio.ctx = new AudioContext();
  audio.master = audio.ctx.createGain();
  audio.master.gain.value = 0.18;
  audio.master.connect(audio.ctx.destination);
  startMusic();
}

function startMusic() {
  if (!audio.ctx || audio.musicTimer || !state.soundEnabled) {
    return;
  }
  audio.musicTimer = window.setInterval(() => {
    if (state.mode !== "playing") {
      return;
    }
    const melody = [392, 440, 523.25, 440, 329.63, 392, 493.88, 392];
    const bass = [98, 98, 130.81, 98];
    const now = audio.ctx.currentTime;
    playTone(melody[audio.step % melody.length], now, 0.08, "triangle", 0.09);
    if (audio.step % 2 === 0) {
      playTone(bass[(audio.step / 2) % bass.length], now, 0.13, "sine", 0.08);
    }
    audio.step += 1;
  }, 185);
}

function stopMusic() {
  if (audio.musicTimer) {
    clearInterval(audio.musicTimer);
    audio.musicTimer = null;
  }
}

function playTone(freq, when, duration, type = "sine", volume = 0.2, slideTo = null) {
  if (!audio.ctx || !audio.master || !state.soundEnabled) {
    return;
  }
  const osc = audio.ctx.createOscillator();
  const gain = audio.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  if (slideTo) {
    osc.frequency.exponentialRampToValueAtTime(slideTo, when + duration);
  }
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(volume, when + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start(when);
  osc.stop(when + duration + 0.03);
}

function playSfx(name) {
  if (!audio.ctx || !state.soundEnabled) {
    return;
  }
  const now = audio.ctx.currentTime;
  if (name === "jump") {
    playTone(260, now, 0.16, "square", 0.12, 520);
  } else if (name === "climb") {
    playTone(220, now, 0.045, "triangle", 0.05);
  } else if (name === "throw") {
    playTone(150, now, 0.1, "sawtooth", 0.07, 105);
  } else if (name === "bounce") {
    playTone(112, now, 0.075, "sine", 0.08, 72);
  } else if (name === "score") {
    playTone(620, now, 0.08, "triangle", 0.1);
    playTone(930, now + 0.055, 0.08, "triangle", 0.1);
  } else if (name === "hit") {
    playTone(190, now, 0.26, "sawtooth", 0.18, 48);
  } else if (name === "win") {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      playTone(freq, now + i * 0.09, 0.15, "triangle", 0.12);
    });
  } else if (name === "start") {
    [329.63, 392, 523.25].forEach((freq, i) => {
      playTone(freq, now + i * 0.07, 0.12, "triangle", 0.1);
    });
  }
}

function fitCanvas() {
  const frame = canvas.parentElement;
  const rect = frame.getBoundingClientRect();
  const scale = Math.min(rect.width / WORLD.width, rect.height / WORLD.height);
  const cssWidth = Math.floor(WORLD.width * scale);
  const cssHeight = Math.floor(WORLD.height * scale);
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.floor(WORLD.width * dpr);
  canvas.height = Math.floor(WORLD.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function gameLoop(timestamp) {
  if (!state.lastTime) {
    state.lastTime = timestamp;
  }
  const dt = Math.min(0.033, (timestamp - state.lastTime) / 1000);
  state.lastTime = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(gameLoop);
}

function setControl(control, value) {
  if (control in keys) {
    keys[control] = value;
  }
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowleft", "a"].includes(key)) setControl("left", true);
  if (["arrowright", "d"].includes(key)) setControl("right", true);
  if (["arrowup", "w"].includes(key)) setControl("up", true);
  if (["arrowdown", "s"].includes(key)) setControl("down", true);
  if ([" ", "spacebar"].includes(key)) setControl("jump", true);
  if (["arrowleft", "arrowright", "arrowup", "arrowdown", " ", "spacebar"].includes(key)) {
    event.preventDefault();
  }
  if (key === "enter" && overlay.classList.contains("is-visible")) {
    primaryButton.click();
  }
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowleft", "a"].includes(key)) setControl("left", false);
  if (["arrowright", "d"].includes(key)) setControl("right", false);
  if (["arrowup", "w"].includes(key)) setControl("up", false);
  if (["arrowdown", "s"].includes(key)) setControl("down", false);
  if ([" ", "spacebar"].includes(key)) setControl("jump", false);
});

document.querySelectorAll("[data-control]").forEach((button) => {
  const control = button.dataset.control;
  const press = (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    button.classList.add("is-held");
    setControl(control, true);
  };
  const release = (event) => {
    event.preventDefault();
    button.classList.remove("is-held");
    setControl(control, false);
  };
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
});

primaryButton.addEventListener("click", () => {
  if (state.mode === "level-complete") {
    nextLevel();
  } else {
    startGame();
  }
});

soundButton.addEventListener("click", () => {
  state.soundEnabled = !state.soundEnabled;
  if (!state.soundEnabled) {
    stopMusic();
  } else {
    ensureAudio();
    playSfx("start");
  }
  updateHud();
});

window.addEventListener("resize", fitCanvas);

function boot() {
  fitCanvas();
  resetPlayer();
  updateHud();
  draw();
  requestAnimationFrame(gameLoop);
}

boot();
