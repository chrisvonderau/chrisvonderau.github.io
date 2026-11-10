(function () {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const highScoreEl = document.getElementById("highScore");
  const livesEl = document.getElementById("lives");
  const stageEl = document.getElementById("stage");
  const startButton = document.getElementById("startButton");
  const pauseButton = document.getElementById("pauseButton");
  const muteButton = document.getElementById("muteButton");

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const STORAGE_KEY = "orangutan-keg-climb-high-score";
  const keys = new Set();
  const justPressed = new Set();

  const palettes = {
    steelA: "#426078",
    steelB: "#243548",
    girderTop: "#ff5d4f",
    girderBottom: "#a82337",
    ladder: "#f4c452",
    ladderShadow: "#986526",
    black: "#04070c",
    white: "#fff7c8",
    gold: "#fac84b",
    pbrBlue: "#1c5bbf",
    pbrRed: "#cf1e38",
    keg: "#9c6937",
    kegDark: "#573019",
    orange: "#d46d23",
    orangeDark: "#7c3918",
    skin: "#a8c8a1",
    coat: "#41505a",
    pants: "#27344b",
  };

  const platforms = [
    { x1: 52, y1: 654, x2: 908, y2: 616 },
    { x1: 52, y1: 540, x2: 908, y2: 576 },
    { x1: 52, y1: 466, x2: 908, y2: 430 },
    { x1: 52, y1: 338, x2: 908, y2: 374 },
    { x1: 52, y1: 264, x2: 908, y2: 228 },
    { x1: 52, y1: 148, x2: 908, y2: 184 },
  ];

  const ladderSeeds = [
    { x: 812, lower: 0, upper: 1 },
    { x: 188, lower: 1, upper: 2 },
    { x: 748, lower: 2, upper: 3 },
    { x: 254, lower: 3, upper: 4 },
    { x: 704, lower: 4, upper: 5 },
    { x: 488, lower: 1, upper: 2, broken: true },
    { x: 520, lower: 3, upper: 4, broken: true },
  ];

  const ladders = ladderSeeds.map((ladder) => {
    const top = platformY(platforms[ladder.upper], ladder.x);
    const bottom = platformY(platforms[ladder.lower], ladder.x);
    return {
      ...ladder,
      w: 48,
      yTop: Math.min(top, bottom),
      yBottom: Math.max(top, bottom),
    };
  });

  const player = {
    x: 112,
    y: 0,
    prevY: 0,
    w: 32,
    h: 54,
    vx: 0,
    vy: 0,
    facing: 1,
    floor: 0,
    onGround: true,
    climbing: false,
    climbLadder: null,
    invulnerable: 0,
    jumpGrace: 0,
    walkFrame: 0,
  };

  let state = "title";
  let score = 0;
  const savedHighScore = Number.parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
  let highScore = Number.isFinite(savedHighScore) ? savedHighScore : 0;
  let lives = 3;
  let stage = 1;
  let kegs = [];
  let sparks = [];
  let spawnTimer = 0;
  let stageMessageTimer = 0;
  let lastTime = 0;
  let gameTime = 0;
  const sound = {
    muted: false,
    context: null,
    enabled: false,
  };

  function padScore(value) {
    return String(Math.max(0, Math.floor(value))).padStart(6, "0");
  }

  function updateHud() {
    scoreEl.textContent = padScore(score);
    highScoreEl.textContent = padScore(highScore);
    livesEl.textContent = String(lives);
    stageEl.textContent = String(stage);
  }

  function platformY(platform, x) {
    const t = (x - platform.x1) / (platform.x2 - platform.x1);
    return platform.y1 + (platform.y2 - platform.y1) * t;
  }

  function downhillDirection(platform) {
    return platform.y2 > platform.y1 ? 1 : -1;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isPressed(...names) {
    return names.some((name) => keys.has(name));
  }

  function wasPressed(...names) {
    return names.some((name) => justPressed.has(name));
  }

  function resetPlayer() {
    player.x = 112;
    player.y = platformY(platforms[0], player.x);
    player.prevY = player.y;
    player.vx = 0;
    player.vy = 0;
    player.floor = 0;
    player.onGround = true;
    player.climbing = false;
    player.climbLadder = null;
    player.invulnerable = 1.7;
    player.jumpGrace = 0;
    player.facing = 1;
  }

  function resetGame() {
    score = 0;
    lives = 3;
    stage = 1;
    kegs = [];
    sparks = [];
    spawnTimer = 1.1;
    stageMessageTimer = 1.8;
    resetPlayer();
    state = "playing";
    updateHud();
    playTone(440, 0.07, "square", 0.03);
    playTone(660, 0.08, "square", 0.03, 0.08);
    canvas.focus();
  }

  function nextStage() {
    stage += 1;
    score += 1000;
    kegs = [];
    sparks = [];
    spawnTimer = 1.05;
    stageMessageTimer = 1.8;
    resetPlayer();
    updateHud();
    playTone(523.25, 0.08, "square", 0.03);
    playTone(659.25, 0.08, "square", 0.03, 0.08);
    playTone(783.99, 0.12, "square", 0.03, 0.16);
  }

  function loseLife() {
    if (player.invulnerable > 0 || state !== "playing") {
      return;
    }

    lives -= 1;
    updateHud();
    burst(player.x, player.y - 28, "#9bf4b8", 14);
    playTone(140, 0.18, "sawtooth", 0.05);
    playTone(80, 0.22, "sawtooth", 0.05, 0.1);

    if (lives <= 0) {
      state = "gameover";
      recordHighScore();
      return;
    }

    resetPlayer();
  }

  function recordHighScore() {
    if (score > highScore) {
      highScore = score;
      localStorage.setItem(STORAGE_KEY, String(highScore));
      updateHud();
    }
  }

  function startAudio() {
    if (sound.context || sound.muted) {
      return;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      return;
    }

    sound.context = new AudioContext();
    sound.enabled = true;
  }

  function playTone(freq, duration, type, volume, delay = 0) {
    if (sound.muted) {
      return;
    }

    startAudio();
    if (!sound.context || sound.context.state === "closed") {
      return;
    }

    const now = sound.context.currentTime + delay;
    const oscillator = sound.context.createOscillator();
    const gain = sound.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(sound.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  function spawnKeg() {
    const topIndex = platforms.length - 1;
    const p = platforms[topIndex];
    const x = 126;
    const speed = 98 + stage * 14 + Math.random() * 16;

    kegs.push({
      x,
      y: platformY(p, x) - 18,
      r: 18,
      floor: topIndex,
      targetFloor: topIndex - 1,
      direction: downhillDirection(p),
      speed,
      rotation: 0,
      falling: false,
      scored: false,
      wobble: Math.random() * Math.PI * 2,
    });

    playTone(196, 0.05, "square", 0.02);
  }

  function nearestUsableLadder() {
    let best = null;
    let bestDistance = Infinity;
    for (const ladder of ladders) {
      if (ladder.broken) {
        continue;
      }

      const horizontal = Math.abs(player.x - ladder.x);
      const verticalOverlap = player.y >= ladder.yTop - 14 && player.y <= ladder.yBottom + 16;
      if (horizontal < ladder.w * 0.58 && verticalOverlap && horizontal < bestDistance) {
        best = ladder;
        bestDistance = horizontal;
      }
    }

    return best;
  }

  function updatePlayer(dt) {
    const left = isPressed("ArrowLeft", "KeyA");
    const right = isPressed("ArrowRight", "KeyD");
    const up = isPressed("ArrowUp", "KeyW");
    const down = isPressed("ArrowDown", "KeyS");
    const jump = wasPressed("Space", "KeyJ", "KeyK");
    const ladder = nearestUsableLadder();

    player.prevY = player.y;
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.jumpGrace = Math.max(0, player.jumpGrace - dt);

    if ((up || down) && ladder) {
      player.climbing = true;
      player.climbLadder = ladder;
      player.x += (ladder.x - player.x) * Math.min(1, dt * 9);
      player.vy = 0;
      player.onGround = false;
    }

    if (player.climbing) {
      const climbSpeed = 132;
      let climb = 0;
      if (up) {
        climb -= climbSpeed;
      }
      if (down) {
        climb += climbSpeed;
      }

      player.y += climb * dt;
      player.x += (player.climbLadder.x - player.x) * Math.min(1, dt * 12);
      player.y = clamp(player.y, player.climbLadder.yTop, player.climbLadder.yBottom);
      player.vx = 0;

      if (up && player.y <= player.climbLadder.yTop + 1) {
        player.floor = player.climbLadder.upper;
        player.y = platformY(platforms[player.floor], player.x);
        player.climbing = false;
        player.climbLadder = null;
        player.onGround = true;
        return;
      }

      if (down && player.y >= player.climbLadder.yBottom - 1) {
        player.floor = player.climbLadder.lower;
        player.y = platformY(platforms[player.floor], player.x);
        player.climbing = false;
        player.climbLadder = null;
        player.onGround = true;
        return;
      }

      if (jump && player.jumpGrace <= 0) {
        player.climbing = false;
        player.climbLadder = null;
        player.vy = -470;
        player.jumpGrace = 0.14;
        playTone(340, 0.05, "square", 0.03);
      }

      const currentFloor = floorUnderPlayer(12);
      const nearPlatform = currentFloor !== null && Math.abs(player.y - platformY(platforms[currentFloor], player.x)) <= 9;
      if (nearPlatform && (!up && !down)) {
        player.climbing = false;
        player.climbLadder = null;
        player.floor = currentFloor;
        player.y = platformY(platforms[currentFloor], player.x);
        player.onGround = true;
      }

      return;
    }

    const acceleration = player.onGround ? 2200 : 1350;
    const friction = player.onGround ? 0.83 : 0.97;
    const maxSpeed = 218;

    if (left) {
      player.vx -= acceleration * dt;
      player.facing = -1;
    }
    if (right) {
      player.vx += acceleration * dt;
      player.facing = 1;
    }
    if (!left && !right) {
      player.vx *= Math.pow(friction, dt * 60);
      if (Math.abs(player.vx) < 1) {
        player.vx = 0;
      }
    }

    player.vx = clamp(player.vx, -maxSpeed, maxSpeed);

    if (jump && (player.onGround || player.jumpGrace > 0)) {
      player.vy = -642;
      player.onGround = false;
      player.jumpGrace = 0;
      playTone(420, 0.06, "square", 0.03);
    }

    player.x += player.vx * dt;
    player.x = clamp(player.x, 34, WIDTH - 34);
    player.vy += 1680 * dt;
    player.y += player.vy * dt;

    const landedFloor = floorUnderPlayer(18);
    if (player.vy >= 0 && landedFloor !== null) {
      const platform = platforms[landedFloor];
      const groundY = platformY(platform, player.x);
      const wasAbove = player.prevY <= groundY + 10;
      const isAtGround = player.y >= groundY - 6;

      if (wasAbove && isAtGround) {
        player.y = groundY;
        player.vy = 0;
        player.floor = landedFloor;
        player.onGround = true;
        player.jumpGrace = 0.1;
      }
    } else {
      player.onGround = false;
    }

    if (player.y > HEIGHT + 90) {
      loseLife();
    }

    if (player.onGround && player.floor === platforms.length - 1 && player.x > 805) {
      nextStage();
    }

    if (Math.abs(player.vx) > 10 || !player.onGround) {
      player.walkFrame += dt * (player.onGround ? 10 : 6);
    }
  }

  function floorUnderPlayer(tolerance) {
    let best = null;
    let bestDelta = Infinity;
    for (let i = 0; i < platforms.length; i += 1) {
      const p = platforms[i];
      if (player.x < p.x1 - 6 || player.x > p.x2 + 6) {
        continue;
      }

      const y = platformY(p, player.x);
      const delta = Math.abs(player.y - y);
      if (delta < tolerance && delta < bestDelta) {
        best = i;
        bestDelta = delta;
      }
    }

    return best;
  }

  function updateKegs(dt) {
    spawnTimer -= dt;
    const spawnEvery = Math.max(0.74, 2.05 - stage * 0.13);
    if (spawnTimer <= 0 && state === "playing") {
      spawnKeg();
      spawnTimer = spawnEvery + Math.random() * 0.45;
    }

    for (const keg of kegs) {
      if (keg.falling) {
        keg.y += (330 + stage * 24) * dt;
        keg.rotation += keg.direction * dt * 8;
        const targetPlatform = platforms[keg.targetFloor];
        const targetY = platformY(targetPlatform, keg.x) - keg.r;
        if (keg.y >= targetY) {
          keg.y = targetY;
          keg.floor = keg.targetFloor;
          keg.direction = downhillDirection(targetPlatform);
          keg.falling = false;
          burst(keg.x, keg.y, "#f8d470", 5);
        }
        continue;
      }

      const platform = platforms[keg.floor];
      keg.direction = downhillDirection(platform);
      keg.x += keg.direction * keg.speed * dt;
      keg.y = platformY(platform, keg.x) - keg.r;
      keg.rotation += keg.direction * dt * 7.5;
      keg.wobble += dt * 7;

      const leftEdge = platform.x1 + keg.r;
      const rightEdge = platform.x2 - keg.r;
      const passedEdge = keg.direction < 0 ? keg.x < leftEdge : keg.x > rightEdge;

      if (passedEdge) {
        keg.x = keg.direction < 0 ? leftEdge : rightEdge;
        if (keg.floor > 0) {
          keg.falling = true;
          keg.targetFloor = keg.floor - 1;
        } else {
          keg.dead = true;
          score += 10;
          updateHud();
        }
      }
    }

    kegs = kegs.filter((keg) => !keg.dead);
  }

  function updateSparks(dt) {
    for (const spark of sparks) {
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.vy += 470 * dt;
      spark.life -= dt;
    }
    sparks = sparks.filter((spark) => spark.life > 0);
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      sparks.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 210,
        vy: -Math.random() * 190 - 40,
        life: 0.25 + Math.random() * 0.35,
        color,
      });
    }
  }

  function checkCollisions() {
    const px = player.x;
    const py = player.y - player.h / 2;

    for (const keg of kegs) {
      const nearestX = clamp(keg.x, px - player.w / 2, px + player.w / 2);
      const nearestY = clamp(keg.y, py - player.h / 2, py + player.h / 2);
      const dx = keg.x - nearestX;
      const dy = keg.y - nearestY;
      const hit = dx * dx + dy * dy < (keg.r - 2) * (keg.r - 2);

      if (hit) {
        loseLife();
        break;
      }

      const jumpedOver =
        !keg.scored &&
        !keg.falling &&
        player.y < keg.y - 16 &&
        Math.abs(player.x - keg.x) < 42 &&
        player.vy > -100;

      if (jumpedOver) {
        keg.scored = true;
        score += 100;
        updateHud();
        burst(keg.x, keg.y - 22, "#9ef8ff", 7);
        playTone(760, 0.05, "square", 0.025);
      }
    }
  }

  function update(dt) {
    if (state !== "playing") {
      stageMessageTimer = Math.max(0, stageMessageTimer - dt);
      updateSparks(dt);
      return;
    }

    gameTime += dt;
    stageMessageTimer = Math.max(0, stageMessageTimer - dt);
    updatePlayer(dt);
    updateKegs(dt);
    updateSparks(dt);
    checkCollisions();
    recordHighScore();
  }

  function draw() {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    drawScene();
    drawOverlay();
    ctx.restore();
  }

  function drawScene() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawBackground();
    drawGoal();
    drawLadders();
    drawPlatforms();
    drawOrangutan();
    for (const keg of kegs) {
      drawKeg(keg);
    }
    drawSparks();
    drawPlayer();
    drawForegroundGlow();
  }

  function drawBackground() {
    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = "rgba(31, 70, 105, 0.25)";
    for (let x = 22; x < WIDTH; x += 48) {
      ctx.fillRect(x, 0, 4, HEIGHT);
    }
    for (let y = 36; y < HEIGHT; y += 48) {
      ctx.fillRect(0, y, WIDTH, 4);
    }

    ctx.fillStyle = "#101826";
    for (let i = 0; i < 18; i += 1) {
      const x = (i * 71 + 18) % WIDTH;
      const y = 92 + ((i * 113) % 500);
      ctx.fillRect(x, y, 22, 46);
      ctx.fillRect(x + 34, y - 18, 18, 64);
    }

    ctx.fillStyle = "rgba(255, 244, 187, 0.06)";
    ctx.fillRect(24, 22, WIDTH - 48, HEIGHT - 44);
  }

  function drawPlatforms() {
    for (const platform of platforms) {
      drawGirder(platform);
    }
  }

  function drawGirder(platform) {
    const dx = platform.x2 - platform.x1;
    const dy = platform.y2 - platform.y1;
    const length = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.translate(platform.x1, platform.y1);
    ctx.rotate(angle);
    ctx.fillStyle = palettes.girderBottom;
    ctx.fillRect(0, 0, length, 24);
    ctx.fillStyle = palettes.girderTop;
    ctx.fillRect(0, -8, length, 14);
    ctx.fillStyle = "#7f1726";
    for (let x = 22; x < length; x += 40) {
      ctx.save();
      ctx.translate(x, 8);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -17, 8, 34);
      ctx.restore();
      ctx.save();
      ctx.translate(x + 20, 8);
      ctx.rotate(-Math.PI / 4);
      ctx.fillRect(-4, -17, 8, 34);
      ctx.restore();
    }
    ctx.fillStyle = "#ffd16a";
    for (let x = 12; x < length; x += 64) {
      ctx.fillRect(x, -4, 10, 6);
    }
    ctx.restore();
  }

  function drawLadders() {
    for (const ladder of ladders) {
      ctx.save();
      ctx.translate(Math.round(ladder.x), 0);
      ctx.globalAlpha = ladder.broken ? 0.45 : 1;
      ctx.fillStyle = palettes.ladderShadow;
      ctx.fillRect(-ladder.w / 2 + 2, ladder.yTop + 2, 8, ladder.yBottom - ladder.yTop + 3);
      ctx.fillRect(ladder.w / 2 - 10, ladder.yTop + 2, 8, ladder.yBottom - ladder.yTop + 3);
      ctx.fillStyle = palettes.ladder;
      ctx.fillRect(-ladder.w / 2, ladder.yTop, 8, ladder.yBottom - ladder.yTop);
      ctx.fillRect(ladder.w / 2 - 8, ladder.yTop, 8, ladder.yBottom - ladder.yTop);
      for (let y = ladder.yTop + 12; y < ladder.yBottom - 6; y += 22) {
        if (ladder.broken && y > (ladder.yTop + ladder.yBottom) / 2 - 8 && y < (ladder.yTop + ladder.yBottom) / 2 + 38) {
          continue;
        }
        ctx.fillRect(-ladder.w / 2, y, ladder.w, 7);
      }
      ctx.restore();
    }
  }

  function drawGoal() {
    const x = 850;
    const y = platformY(platforms[5], x) - 62;
    const bob = Math.sin(gameTime * 4) * 3;

    ctx.save();
    ctx.translate(x, y + bob);
    ctx.fillStyle = "#f7d560";
    ctx.fillRect(-16, -12, 32, 24);
    ctx.fillStyle = "#d99d2b";
    ctx.fillRect(-11, -8, 22, 16);
    ctx.fillStyle = "#fff4bd";
    ctx.fillRect(-6, -26, 12, 18);
    ctx.strokeStyle = "#ffe993";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, -31, 15, Math.PI * 0.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.fillStyle = "#2a160b";
    ctx.font = "bold 10px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText("OPEN", 0, 3);
    ctx.restore();
  }

  function drawOrangutan() {
    const baseX = 104;
    const baseY = platformY(platforms[5], baseX);
    const beat = Math.sin(gameTime * 5.5);
    const armLift = Math.floor(beat * 4);

    ctx.save();
    ctx.translate(baseX, baseY - 6);
    ctx.fillStyle = palettes.orangeDark;
    ctx.fillRect(-48, -76, 96, 54);
    ctx.fillRect(-58, -52 + armLift, 28, 58);
    ctx.fillRect(30, -52 - armLift, 28, 58);
    ctx.fillStyle = palettes.orange;
    ctx.fillRect(-38, -88, 76, 54);
    ctx.fillRect(-42, -34, 84, 42);
    ctx.fillStyle = "#f0a04b";
    ctx.fillRect(-24, -70, 48, 32);
    ctx.fillStyle = palettes.black;
    ctx.fillRect(-14, -68, 8, 8);
    ctx.fillRect(8, -68, 8, 8);
    ctx.fillRect(-12, -50, 24, 8);
    ctx.fillStyle = "#ffd498";
    ctx.fillRect(-30, -97, 60, 16);
    ctx.fillStyle = palettes.orangeDark;
    ctx.fillRect(-34, -100, 18, 22);
    ctx.fillRect(16, -100, 18, 22);
    drawTinyKeg(52, -86, 0.85);
    ctx.restore();
  }

  function drawPlayer() {
    const blink = player.invulnerable > 0 && Math.floor(gameTime * 18) % 2 === 0;
    if (blink) {
      return;
    }

    const legSwing = Math.sin(player.walkFrame) * 7;
    const armSwing = Math.sin(player.walkFrame + Math.PI) * 6;
    const lean = player.climbing ? 0 : player.facing * (Math.abs(player.vx) > 20 ? 3 : 1);

    ctx.save();
    ctx.translate(Math.round(player.x), Math.round(player.y));
    ctx.scale(player.facing, 1);
    ctx.translate(lean, 0);

    ctx.fillStyle = "#1b222c";
    ctx.fillRect(-13, -7, 11, 8);
    ctx.fillRect(4, -7, 11, 8);
    ctx.fillStyle = palettes.pants;
    ctx.fillRect(-13 + legSwing * 0.15, -28, 10, 24);
    ctx.fillRect(4 - legSwing * 0.15, -28, 10, 24);
    ctx.fillStyle = palettes.coat;
    ctx.fillRect(-17, -54, 34, 31);
    ctx.fillStyle = "#60717b";
    ctx.fillRect(-12, -50, 12, 24);
    ctx.fillStyle = "#39464e";
    ctx.fillRect(2, -50, 10, 26);
    ctx.fillStyle = palettes.skin;
    ctx.fillRect(-12, -72, 24, 22);
    ctx.fillStyle = "#6e806f";
    ctx.fillRect(-10, -74, 22, 5);
    ctx.fillStyle = palettes.black;
    ctx.fillRect(-5, -65, 4, 4);
    ctx.fillRect(6, -65, 4, 4);
    ctx.fillRect(0, -56, 10, 4);
    ctx.fillStyle = "#6e8f82";
    ctx.fillRect(-22, -49 + armSwing * 0.1, 8, 25);
    ctx.fillRect(15, -48 - armSwing * 0.1, 8, 25);
    ctx.fillStyle = "#b7d5b0";
    ctx.fillRect(-24, -24 + armSwing * 0.1, 8, 8);
    ctx.fillRect(17, -23 - armSwing * 0.1, 8, 8);
    ctx.fillStyle = palettes.red;
    ctx.fillRect(-16, -39, 8, 4);
    ctx.restore();
  }

  function drawKeg(keg) {
    ctx.save();
    ctx.translate(Math.round(keg.x), Math.round(keg.y));
    ctx.rotate(keg.rotation);
    drawTinyKeg(0, 0, 1, true);
    ctx.restore();
  }

  function drawTinyKeg(x, y, scale, fullLabel = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = palettes.kegDark;
    ctx.fillRect(-20, -16, 40, 32);
    ctx.fillStyle = palettes.keg;
    ctx.fillRect(-18, -18, 36, 36);
    ctx.fillStyle = "#c88c4d";
    ctx.fillRect(-12, -18, 24, 36);
    ctx.fillStyle = palettes.kegDark;
    ctx.fillRect(-22, -13, 7, 26);
    ctx.fillRect(15, -13, 7, 26);
    ctx.fillStyle = palettes.white;
    ctx.fillRect(-13, -11, 26, 22);
    ctx.fillStyle = palettes.pbrBlue;
    ctx.fillRect(-10, -7, 20, 6);
    ctx.fillRect(-7, 2, 14, 5);
    ctx.fillStyle = palettes.pbrRed;
    ctx.fillRect(-3, -11, 6, 22);
    ctx.fillStyle = palettes.white;
    ctx.font = "bold 6px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText("PBR", 0, 0);
    if (fullLabel) {
      ctx.fillStyle = "#0d2f80";
      ctx.font = "bold 4px 'Courier New', monospace";
      ctx.fillText("PABST", 0, -6);
      ctx.fillText("BLUE", 0, 7);
    }
    ctx.restore();
  }

  function drawSparks() {
    for (const spark of sparks) {
      ctx.globalAlpha = clamp(spark.life * 3, 0, 1);
      ctx.fillStyle = spark.color;
      ctx.fillRect(Math.round(spark.x), Math.round(spark.y), 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  function drawForegroundGlow() {
    ctx.strokeStyle = "rgba(91, 180, 255, 0.35)";
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, WIDTH - 40, HEIGHT - 40);
    ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
    ctx.fillRect(0, 0, WIDTH, 18);
    ctx.fillRect(0, HEIGHT - 18, WIDTH, 18);
  }

  function drawOverlay() {
    if (stageMessageTimer > 0 && state === "playing") {
      drawBanner(`STAGE ${stage}`, "CLIMB!");
    }

    if (state === "title") {
      drawBanner("ORANGUTAN KEG CLIMB", "START");
    }

    if (state === "paused") {
      drawBanner("PAUSED", "READY");
    }

    if (state === "gameover") {
      drawBanner("GAME OVER", `SCORE ${padScore(score)}`);
    }
  }

  function drawBanner(title, subtitle) {
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
    ctx.fillRect(228, 238, 504, 178);
    ctx.strokeStyle = "#ffe08b";
    ctx.lineWidth = 4;
    ctx.strokeRect(238, 248, 484, 158);
    ctx.fillStyle = palettes.white;
    ctx.textAlign = "center";
    ctx.font = "bold 32px 'Courier New', monospace";
    ctx.fillText(title, WIDTH / 2, 318);
    ctx.fillStyle = palettes.gold;
    ctx.font = "bold 24px 'Courier New', monospace";
    ctx.fillText(subtitle, WIDTH / 2, 358);
    ctx.restore();
  }

  function tick(time) {
    const seconds = time / 1000;
    const dt = Math.min(0.034, seconds - lastTime || 0);
    lastTime = seconds;

    if (wasPressed("Enter")) {
      if (state === "title" || state === "gameover") {
        resetGame();
      } else if (state === "paused") {
        state = "playing";
      }
    }

    if (wasPressed("KeyP", "Escape") && state !== "title" && state !== "gameover") {
      state = state === "paused" ? "playing" : "paused";
    }

    update(dt);
    draw();
    justPressed.clear();
    window.requestAnimationFrame(tick);
  }

  function setPaused() {
    if (state === "playing") {
      state = "paused";
    } else if (state === "paused") {
      state = "playing";
      canvas.focus();
    }
  }

  function activateGameScreen() {
    startAudio();
    if (state === "title" || state === "gameover") {
      resetGame();
      return;
    }

    if (state === "paused") {
      state = "playing";
    }

    canvas.focus();
  }

  window.addEventListener("keydown", (event) => {
    const controlKeys = [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Space",
      "KeyA",
      "KeyD",
      "KeyW",
      "KeyS",
      "KeyJ",
      "KeyK",
      "KeyP",
      "Escape",
      "Enter",
    ];

    if (controlKeys.includes(event.code)) {
      event.preventDefault();
    }

    if (!keys.has(event.code)) {
      justPressed.add(event.code);
    }
    keys.add(event.code);
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.code);
  });

  startButton.addEventListener("click", () => {
    activateGameScreen();
  });

  canvas.addEventListener("pointerdown", () => {
    activateGameScreen();
  });

  pauseButton.addEventListener("click", () => {
    setPaused();
  });

  muteButton.addEventListener("click", () => {
    sound.muted = !sound.muted;
    muteButton.textContent = sound.muted ? "Sound Off" : "Sound On";
    muteButton.setAttribute("aria-pressed", String(sound.muted));
    if (!sound.muted) {
      startAudio();
      playTone(660, 0.06, "square", 0.025);
    }
    canvas.focus();
  });

  updateHud();
  resetPlayer();
  draw();
  window.orangutanKegClimbState = () => state; // read by the Xbox controller layer in index.html
  window.requestAnimationFrame(tick);
})();
