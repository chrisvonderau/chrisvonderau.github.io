(() => {
  function boot() {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const startButton = document.getElementById("startButton");
  const screenActions = document.getElementById("screenActions");
  const soundButton = document.getElementById("soundButton");

  const W = canvas.width;
  const H = canvas.height;
  const TAU = Math.PI * 2;
  const rand = (min, max) => min + Math.random() * (max - min);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const colors = {
    skyTop: "#111726",
    skyMid: "#182130",
    skyBottom: "#161516",
    mint: "#7cf7d4",
    coral: "#ff6f61",
    amber: "#ffd166",
    blue: "#68b6ff",
    violet: "#b69cff",
    white: "#fbfdff",
    ink: "#080c12",
    enemy: "#f4a261",
    enemyDark: "#7d352e",
  };

  const controls = [
    {
      left: "KeyA",
      right: "KeyD",
      flap: "KeyW",
      name: "P1",
      color: colors.coral,
      accent: colors.amber,
      spawnX: 225,
    },
    {
      left: "ArrowLeft",
      right: "ArrowRight",
      flap: "ArrowUp",
      name: "P2",
      color: colors.blue,
      accent: colors.violet,
      spawnX: 735,
    },
  ];

  const platforms = [
    { x: -40, y: 505, w: 1040, h: 46, color: "#253645" },
    { x: 64, y: 428, w: 238, h: 18, color: "#22646c" },
    { x: 655, y: 428, w: 238, h: 18, color: "#22646c" },
    { x: 333, y: 350, w: 292, h: 18, color: "#31506c" },
    { x: 82, y: 266, w: 235, h: 18, color: "#55456f" },
    { x: 644, y: 266, w: 235, h: 18, color: "#55456f" },
    { x: 372, y: 178, w: 216, h: 18, color: "#70633a" },
  ];

  const state = {
    screen: "title",
    time: 0,
    lastTime: 0,
    wave: 1,
    waveDelay: 0,
    players: [],
    enemies: [],
    eggs: [],
    particles: [],
    keys: new Set(),
    shake: 0,
    flash: 0,
    muted: false,
    audio: null,
    nextEnemyId: 1,
    spawnBanner: 0,
    matchWinner: "",
  };

  function makePlayer(index) {
    const profile = controls[index];
    return {
      kind: "player",
      id: index + 1,
      name: profile.name,
      x: profile.spawnX,
      y: 390,
      prevY: 390,
      vx: index === 0 ? 1.5 : -1.5,
      vy: 0,
      dir: index === 0 ? 1 : -1,
      color: profile.color,
      accent: profile.accent,
      score: 0,
      lives: 3,
      alive: true,
      respawn: 0,
      invulnerable: 130,
      grounded: false,
      flapGlow: 0,
      bob: rand(0, TAU),
      control: profile,
    };
  }

  function makeEnemy(x, y, tier = 0) {
    const tierData = [
      { color: "#f4a261", accent: "#f6d365", speed: 0.2, score: 100 },
      { color: "#c084fc", accent: "#f0abfc", speed: 0.26, score: 150 },
      { color: "#52e0b8", accent: "#fff1a8", speed: 0.32, score: 225 },
    ][tier] || { color: "#f4a261", accent: "#f6d365", speed: 0.2, score: 100 };

    return {
      kind: "enemy",
      id: state.nextEnemyId++,
      x,
      y,
      prevY: y,
      vx: rand(-1.8, 1.8),
      vy: rand(-2, 0),
      dir: Math.random() > 0.5 ? 1 : -1,
      tier,
      color: tierData.color,
      accent: tierData.accent,
      speed: tierData.speed,
      score: tierData.score,
      grounded: false,
      flapGlow: 0,
      flapTimer: rand(10, 70),
      changeMind: rand(30, 120),
      bob: rand(0, TAU),
    };
  }

  function resetMatch() {
    state.wave = 1;
    state.waveDelay = 0;
    state.players = [makePlayer(0), makePlayer(1)];
    state.enemies = [];
    state.eggs = [];
    state.particles = [];
    state.shake = 0;
    state.flash = 0;
    state.spawnBanner = 90;
    state.matchWinner = "";
    state.nextEnemyId = 1;
    spawnWave();
  }

  function startMatch() {
    unlockAudio();
    resetMatch();
    state.screen = "playing";
    updateButtons();
    playChord([392, 523, 659], 0.11, "triangle", 0.09);
  }

  function spawnWave() {
    const count = Math.min(3 + state.wave, 10);
    state.enemies = [];
    for (let i = 0; i < count; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const tier = state.wave > 5 && i % 4 === 0 ? 2 : state.wave > 2 && i % 3 === 0 ? 1 : 0;
      const x = side < 0 ? rand(60, 250) : rand(710, 900);
      const y = rand(105, 330);
      state.enemies.push(makeEnemy(x, y, tier));
    }
    state.spawnBanner = 120;
  }

  function updateButtons() {
    const visible = state.screen === "title" || state.screen === "gameover";
    screenActions.classList.toggle("is-hidden", !visible);
    startButton.textContent = state.screen === "gameover" ? "Play Again" : "Start Match";
    soundButton.textContent = state.muted ? "Sound Off" : "Sound On";
    soundButton.setAttribute("aria-pressed", String(!state.muted));
    soundButton.classList.toggle("is-hidden", state.screen === "playing");
  }

  function unlockAudio() {
    if (state.audio) {
      if (state.audio.ctx.state === "suspended") {
        state.audio.ctx.resume();
      }
      return;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      state.muted = true;
      updateButtons();
      return;
    }

    const audioCtx = new AudioContext();
    const master = audioCtx.createGain();
    master.gain.value = 0.26;
    master.connect(audioCtx.destination);
    state.audio = { ctx: audioCtx, master };
  }

  function playTone(freq, duration = 0.08, type = "square", volume = 0.05, bend = 0) {
    if (state.muted || !state.audio) return;
    const audioCtx = state.audio.ctx;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (bend !== 0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(60, freq + bend), now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(state.audio.master);
    osc.start(now);
    osc.stop(now + duration + 0.025);
  }

  function playChord(notes, duration, type, volume) {
    notes.forEach((note, index) => {
      window.setTimeout(() => playTone(note, duration, type, volume), index * 35);
    });
  }

  function addParticles(x, y, count, palette, size = 3, speed = 4) {
    for (let i = 0; i < count; i += 1) {
      state.particles.push({
        x,
        y,
        vx: rand(-speed, speed),
        vy: rand(-speed, speed * 0.5),
        life: rand(24, 58),
        maxLife: 58,
        color: palette[Math.floor(Math.random() * palette.length)],
        size: rand(size * 0.45, size),
      });
    }
  }

  function circleOverlap(a, b, radius) {
    const dxRaw = Math.abs(a.x - b.x);
    const dx = Math.min(dxRaw, W - dxRaw);
    const dy = a.y - b.y;
    return dx * dx + dy * dy < radius * radius;
  }

  function wrappedDeltaX(from, to) {
    let dx = to - from;
    if (dx > W / 2) dx -= W;
    if (dx < -W / 2) dx += W;
    return dx;
  }

  function updateRider(entity, dt) {
    entity.prevY = entity.y;
    const wasGrounded = entity.grounded;
    entity.grounded = false;

    entity.vy = clamp(entity.vy + 0.42 * dt, -12, 10);
    entity.vx *= wasGrounded ? 0.86 : 0.992;
    entity.x += entity.vx * dt;
    entity.y += entity.vy * dt;

    if (entity.y < 44) {
      entity.y = 44;
      entity.vy = Math.abs(entity.vy) * 0.4;
    }

    if (entity.x < -60) entity.x += W + 120;
    if (entity.x > W + 60) entity.x -= W + 120;

    resolvePlatforms(entity);
  }

  function resolvePlatforms(entity) {
    const bodyHalfHeight = 24;
    const oldBottom = entity.prevY + bodyHalfHeight;
    const newBottom = entity.y + bodyHalfHeight;
    for (const platform of platforms) {
      const insideX = entity.x > platform.x - 26 && entity.x < platform.x + platform.w + 26;
      const crossedTop = oldBottom <= platform.y + 4 && newBottom >= platform.y;
      if (entity.vy >= 0 && insideX && crossedTop) {
        entity.y = platform.y - bodyHalfHeight;
        entity.vy = 0;
        entity.grounded = true;
        return;
      }
    }
  }

  function updatePlayers(dt) {
    for (const player of state.players) {
      if (!player.alive) {
        player.respawn -= dt;
        if (player.respawn <= 0 && player.lives > 0) {
          player.x = player.control.spawnX;
          player.y = 390;
          player.prevY = player.y;
          player.vx = player.id === 1 ? 1.8 : -1.8;
          player.vy = -4;
          player.dir = player.id === 1 ? 1 : -1;
          player.alive = true;
          player.invulnerable = 140;
          addParticles(player.x, player.y, 18, [player.color, player.accent, colors.white], 3, 4);
        }
        continue;
      }

      const control = player.control;
      if (state.keys.has(control.left)) {
        player.vx -= 0.34 * dt;
        player.dir = -1;
      }
      if (state.keys.has(control.right)) {
        player.vx += 0.34 * dt;
        player.dir = 1;
      }

      if (state.keys.has(control.flap)) {
        if (player.flapGlow <= 0) {
          playTone(280 + player.id * 90, 0.045, "triangle", 0.025, 160);
        }
        player.vy -= player.grounded ? 8.7 : 0.7 * dt;
        player.flapGlow = 12;
      }

      player.vx = clamp(player.vx, -5.6, 5.6);
      player.vy = clamp(player.vy, -10.8, 11);
      player.flapGlow = Math.max(0, player.flapGlow - dt);
      player.invulnerable = Math.max(0, player.invulnerable - dt);
      updateRider(player, dt);
    }
  }

  function nearestLivingPlayer(enemy) {
    let best = null;
    let bestDistance = Infinity;
    for (const player of state.players) {
      if (!player.alive) continue;
      const dx = wrappedDeltaX(enemy.x, player.x);
      const dy = enemy.y - player.y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        best = player;
        bestDistance = distance;
      }
    }
    return best;
  }

  function updateEnemies(dt) {
    for (const enemy of state.enemies) {
      const target = nearestLivingPlayer(enemy);
      enemy.changeMind -= dt;
      enemy.flapTimer -= dt;

      if (target) {
        const dx = wrappedDeltaX(enemy.x, target.x);
        const desiredDir = dx >= 0 ? 1 : -1;
        enemy.vx += desiredDir * enemy.speed * dt;
        enemy.dir = desiredDir;

        const wantsHeight = enemy.y > target.y - 18 || enemy.y > 390;
        const nearEdge = enemy.grounded && (enemy.x < 90 || enemy.x > W - 90 || Math.abs(dx) < 135);
        if ((wantsHeight || nearEdge) && enemy.flapTimer <= 0) {
          enemy.vy -= rand(6.2, 8.6);
          enemy.flapGlow = 14;
          enemy.flapTimer = rand(30, 82) - Math.min(state.wave * 2, 18);
        }
      } else if (enemy.flapTimer <= 0) {
        enemy.vy -= rand(5.6, 7.4);
        enemy.flapTimer = rand(45, 90);
      }

      if (enemy.changeMind <= 0) {
        enemy.vx += rand(-1.5, 1.5);
        enemy.changeMind = rand(45, 140);
      }

      enemy.vx = clamp(enemy.vx, -4.2 - enemy.tier * 0.45, 4.2 + enemy.tier * 0.45);
      enemy.flapGlow = Math.max(0, enemy.flapGlow - dt);
      updateRider(enemy, dt);
    }
  }

  function updateEggs(dt) {
    for (const egg of state.eggs) {
      egg.prevY = egg.y;
      egg.vy = clamp(egg.vy + 0.28 * dt, -8, 6);
      egg.x += egg.vx * dt;
      egg.y += egg.vy * dt;
      egg.vx *= 0.985;
      if (egg.x < -20) egg.x += W + 40;
      if (egg.x > W + 20) egg.x -= W + 40;
      resolveEgg(egg);
      egg.hatch -= dt;
      egg.pulse += dt * 0.08;
    }

    for (const player of state.players) {
      if (!player.alive) continue;
      for (let i = state.eggs.length - 1; i >= 0; i -= 1) {
        const egg = state.eggs[i];
        if (circleOverlap(player, egg, 39)) {
          player.score += egg.points;
          addParticles(egg.x, egg.y, 22, [colors.amber, colors.mint, colors.white], 3, 4.8);
          state.eggs.splice(i, 1);
          playChord([740, 988], 0.07, "sine", 0.05);
        }
      }
    }

    for (let i = state.eggs.length - 1; i >= 0; i -= 1) {
      const egg = state.eggs[i];
      if (egg.hatch <= 0) {
        state.enemies.push(makeEnemy(egg.x, egg.y - 35, clamp(egg.tier, 0, 2)));
        addParticles(egg.x, egg.y, 24, [colors.violet, colors.enemy, colors.white], 3.4, 5);
        state.eggs.splice(i, 1);
        playTone(180, 0.16, "sawtooth", 0.05, 220);
      }
    }
  }

  function resolveEgg(egg) {
    const oldBottom = egg.prevY + 12;
    const newBottom = egg.y + 12;
    for (const platform of platforms) {
      const insideX = egg.x > platform.x + 4 && egg.x < platform.x + platform.w - 4;
      const crossedTop = oldBottom <= platform.y + 3 && newBottom >= platform.y;
      if (egg.vy >= 0 && insideX && crossedTop) {
        egg.y = platform.y - 12;
        egg.vy = 0;
        egg.vx *= 0.86;
        return;
      }
    }
  }

  function updateJousts() {
    for (let pIndex = 0; pIndex < state.players.length; pIndex += 1) {
      const player = state.players[pIndex];
      if (!player.alive || player.invulnerable > 0) continue;
      for (let eIndex = state.enemies.length - 1; eIndex >= 0; eIndex -= 1) {
        const enemy = state.enemies[eIndex];
        if (!circleOverlap(player, enemy, 58)) continue;

        const playerLance = player.y - 29;
        const enemyLance = enemy.y - 25;
        if (playerLance < enemyLance - 8) {
          defeatEnemy(player, enemy, eIndex);
        } else if (playerLance > enemyLance + 8) {
          defeatPlayer(player, enemy);
        } else {
          const dx = wrappedDeltaX(enemy.x, player.x);
          const push = dx >= 0 ? -1 : 1;
          player.vx += push * 2.5;
          enemy.vx -= push * 2.5;
          player.vy -= 2.8;
          enemy.vy -= 2.2;
          addParticles((player.x + enemy.x) / 2, (player.y + enemy.y) / 2 - 8, 12, [colors.white, colors.mint], 2.6, 3.5);
          playTone(250, 0.08, "square", 0.03, -80);
        }
      }
    }

    const [p1, p2] = state.players;
    if (p1.alive && p2.alive && circleOverlap(p1, p2, 52)) {
      const dx = wrappedDeltaX(p1.x, p2.x);
      const push = dx >= 0 ? -1 : 1;
      p1.vx += push * 0.9;
      p2.vx -= push * 0.9;
    }
  }

  function defeatEnemy(player, enemy, enemyIndex) {
    player.score += enemy.score;
    state.enemies.splice(enemyIndex, 1);
    state.eggs.push({
      x: enemy.x,
      y: enemy.y,
      prevY: enemy.y,
      vx: enemy.vx * 0.25,
      vy: -4.2,
      points: 250 + enemy.tier * 75,
      hatch: 560 - Math.min(state.wave * 24, 220),
      tier: enemy.tier,
      pulse: rand(0, TAU),
    });
    state.shake = Math.max(state.shake, 8);
    state.flash = Math.max(state.flash, 8);
    addParticles(enemy.x, enemy.y, 30, [enemy.color, enemy.accent, colors.white, colors.mint], 4, 6);
    playChord([520, 780, 1040], 0.08, "triangle", 0.055);
  }

  function defeatPlayer(player, enemy) {
    player.lives -= 1;
    player.alive = false;
    player.respawn = player.lives > 0 ? 110 : 999999;
    player.vx = 0;
    player.vy = 0;
    state.shake = Math.max(state.shake, 14);
    addParticles(player.x, player.y, 38, [player.color, player.accent, colors.white], 4.5, 6.5);
    enemy.vy -= 4;
    playTone(118, 0.22, "sawtooth", 0.07, -42);

    if (state.players.every((candidate) => candidate.lives <= 0 && !candidate.alive)) {
      finishGame();
    }
  }

  function finishGame() {
    const [p1, p2] = state.players;
    if (p1.score === p2.score) {
      state.matchWinner = "Draw";
    } else {
      state.matchWinner = p1.score > p2.score ? "P1 Wins" : "P2 Wins";
    }
    state.screen = "gameover";
    updateButtons();
    playChord([165, 147, 131], 0.18, "triangle", 0.07);
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const particle = state.particles[i];
      particle.life -= dt;
      particle.vy += 0.07 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      if (particle.life <= 0) {
        state.particles.splice(i, 1);
      }
    }
  }

  function updateWave(dt) {
    if (state.screen !== "playing") return;
    if (state.enemies.length === 0 && state.eggs.length === 0) {
      if (state.waveDelay <= 0) {
        state.waveDelay = 115;
        state.spawnBanner = 80;
        for (const player of state.players) {
          if (player.lives > 0) player.score += 150;
        }
        playChord([523, 659, 784, 1046], 0.1, "triangle", 0.05);
      } else {
        state.waveDelay -= dt;
        if (state.waveDelay <= 0) {
          state.wave += 1;
          spawnWave();
        }
      }
    } else {
      state.waveDelay = 0;
    }
  }

  function update(dt) {
    state.time += dt;
    state.shake = Math.max(0, state.shake - dt * 0.8);
    state.flash = Math.max(0, state.flash - dt);
    state.spawnBanner = Math.max(0, state.spawnBanner - dt);

    if (state.screen !== "playing") {
      updateParticles(dt);
      return;
    }

    updatePlayers(dt);
    updateEnemies(dt);
    updateEggs(dt);
    updateJousts();
    updateParticles(dt);
    updateWave(dt);
  }

  function drawRoundedRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, colors.skyTop);
    sky.addColorStop(0.5, colors.skyMid);
    sky.addColorStop(1, colors.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 38; i += 1) {
      const x = (i * 83 + Math.sin(i * 21.7) * 40 + state.time * 0.05) % W;
      const y = 55 + ((i * 47) % 240);
      const size = 1 + (i % 4) * 0.55;
      ctx.fillStyle = i % 3 === 0 ? colors.amber : i % 3 === 1 ? colors.mint : colors.white;
      ctx.fillRect(x, y, size, size);
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.28;
    for (let i = 0; i < 4; i += 1) {
      const y = 110 + i * 74 + Math.sin(state.time * 0.01 + i) * 7;
      ctx.strokeStyle = ["#7cf7d4", "#ffd166", "#ff6f61", "#68b6ff"][i];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= W; x += 28) {
        ctx.lineTo(x, y + Math.sin((x + state.time * 0.45) * 0.012 + i) * 6);
      }
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    const floor = ctx.createLinearGradient(0, 478, 0, H);
    floor.addColorStop(0, "rgba(124, 247, 212, 0.05)");
    floor.addColorStop(1, "rgba(255, 111, 97, 0.16)");
    ctx.fillStyle = floor;
    ctx.fillRect(0, 478, W, 62);
    ctx.restore();
  }

  function drawPlatforms() {
    for (const platform of platforms) {
      ctx.save();
      drawRoundedRect(platform.x, platform.y, platform.w, platform.h, 8);
      ctx.fillStyle = platform.color;
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = colors.white;
      ctx.fillRect(platform.x + 8, platform.y + 3, platform.w - 16, 2);
      ctx.globalAlpha = 0.62;
      ctx.fillStyle = colors.mint;
      for (let x = platform.x + 16; x < platform.x + platform.w - 10; x += 22) {
        ctx.fillRect(x, platform.y - 3, 10, 3);
      }
      ctx.restore();
    }
  }

  function drawRiderWithWrap(entity) {
    drawRider(entity, entity.x);
    if (entity.x < 80) drawRider(entity, entity.x + W);
    if (entity.x > W - 80) drawRider(entity, entity.x - W);
  }

  function drawRider(entity, drawX) {
    if (entity.kind === "player" && entity.invulnerable > 0 && Math.floor(state.time / 5) % 2 === 0) {
      return;
    }

    const dir = entity.dir || 1;
    const bob = Math.sin(state.time * 0.12 + entity.bob) * 2;
    const flap = entity.flapGlow > 0 ? Math.sin(state.time * 0.7) * 6 : 0;
    const leg = Math.sin(state.time * 0.32 + entity.bob) * 6;

    ctx.save();
    ctx.translate(drawX, entity.y + bob);
    ctx.scale(dir, 1);

    ctx.globalAlpha = entity.alive === false ? 0.35 : 1;
    ctx.fillStyle = "rgba(0, 0, 0, 0.26)";
    ctx.beginPath();
    ctx.ellipse(0, 29, 42, 9, 0, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = entity.accent;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.moveTo(14, -30);
    ctx.lineTo(67, -41 + flap * 0.2);
    ctx.stroke();
    ctx.fillStyle = entity.accent;
    ctx.beginPath();
    ctx.moveTo(68, -41 + flap * 0.2);
    ctx.lineTo(54, -47 + flap * 0.2);
    ctx.lineTo(55, -34 + flap * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = shade(entity.color, -0.35);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-26, 15);
    ctx.lineTo(-31 + leg * 0.5, 29);
    ctx.moveTo(-7, 17);
    ctx.lineTo(-12 - leg * 0.5, 31);
    ctx.moveTo(17, 16);
    ctx.lineTo(21 + leg * 0.45, 30);
    ctx.moveTo(34, 10);
    ctx.lineTo(38 - leg * 0.35, 27);
    ctx.stroke();

    ctx.fillStyle = shade(entity.color, -0.18);
    ctx.beginPath();
    ctx.moveTo(-36, -2);
    ctx.bezierCurveTo(-58, -8, -58, 10, -37, 11);
    ctx.bezierCurveTo(-48, 19, -57, 21, -65, 15);
    ctx.bezierCurveTo(-58, 27, -31, 23, -20, 8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = entity.color;
    ctx.beginPath();
    ctx.ellipse(0, 4, 39, 20, -0.08, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.26)";
    ctx.beginPath();
    ctx.ellipse(-5, -1, 27, 8, -0.18, 0, TAU);
    ctx.fill();

    ctx.fillStyle = shade(entity.color, -0.08);
    ctx.beginPath();
    ctx.ellipse(34, -12, 15, 26, -0.4, 0, TAU);
    ctx.fill();

    ctx.fillStyle = entity.color;
    ctx.beginPath();
    ctx.ellipse(49, -25, 23, 14, -0.25, 0, TAU);
    ctx.fill();
    ctx.fillStyle = entity.color;
    ctx.beginPath();
    ctx.moveTo(37, -34);
    ctx.lineTo(43, -53);
    ctx.lineTo(50, -35);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = entity.accent;
    ctx.beginPath();
    ctx.moveTo(58, -38);
    ctx.lineTo(76, -62);
    ctx.lineTo(64, -33);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(8, 12, 18, 0.32)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(63, -44);
    ctx.lineTo(70, -56);
    ctx.stroke();

    ctx.fillStyle = entity.accent;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.ellipse(28 + i * 5, -31 + i * 4, 7, 3, -0.8, 0, TAU);
      ctx.fill();
    }

    ctx.fillStyle = colors.ink;
    ctx.beginPath();
    ctx.arc(59, -27, 2.2, 0, TAU);
    ctx.fill();

    ctx.fillStyle = shade(entity.accent, -0.1);
    drawRoundedRect(-17, -12, 31, 12, 4);
    ctx.fill();

    ctx.fillStyle = entity.kind === "enemy" ? colors.enemyDark : "#18243a";
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-5, -33, 13, 21, 5) : drawRoundedRect(-5, -33, 13, 21, 5);
    ctx.fill();
    ctx.fillStyle = entity.kind === "enemy" ? "#f7b891" : "#ffd0a6";
    ctx.beginPath();
    ctx.arc(1, -40, 8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = entity.kind === "enemy" ? colors.enemyDark : shade(entity.accent, -0.15);
    ctx.beginPath();
    ctx.moveTo(-8, -43);
    ctx.lineTo(1, -53);
    ctx.lineTo(10, -43);
    ctx.closePath();
    ctx.fill();

    if (entity.flapGlow > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(entity.flapGlow / 16, 0, 0.75);
      ctx.strokeStyle = entity.accent;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.arc(-17 - i * 7, 8, 20 + i * 7, -0.7, 0.65);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();
  }

  function shade(hex, amount) {
    const clean = hex.replace("#", "");
    const num = parseInt(clean, 16);
    let r = (num >> 16) & 255;
    let g = (num >> 8) & 255;
    let b = num & 255;
    if (amount < 0) {
      r *= 1 + amount;
      g *= 1 + amount;
      b *= 1 + amount;
    } else {
      r += (255 - r) * amount;
      g += (255 - g) * amount;
      b += (255 - b) * amount;
    }
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  }

  function drawEggs() {
    for (const egg of state.eggs) {
      const warning = egg.hatch < 150 ? Math.sin(state.time * 0.35) * 0.5 + 0.5 : 0;
      drawEgg(egg, egg.x, warning);
      if (egg.x < 30) drawEgg(egg, egg.x + W, warning);
      if (egg.x > W - 30) drawEgg(egg, egg.x - W, warning);
    }
  }

  function drawEgg(egg, x, warning) {
    ctx.save();
    ctx.translate(x, egg.y);
    ctx.rotate(Math.sin(egg.pulse) * 0.08);
    ctx.fillStyle = warning > 0.1 ? shade(colors.amber, warning * 0.2) : colors.white;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 19, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = warning > 0.1 ? colors.coral : colors.mint;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-9, -5);
    ctx.lineTo(-4, -1);
    ctx.lineTo(1, -6);
    ctx.lineTo(7, -1);
    ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = colors.amber;
    ctx.beginPath();
    ctx.ellipse(-4, -8, 4, 6, 0.3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    for (const particle of state.particles) {
      ctx.save();
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawHud() {
    ctx.save();
    ctx.fillStyle = "rgba(8, 12, 18, 0.46)";
    ctx.fillRect(0, 0, W, 55);
    ctx.fillStyle = colors.white;
    ctx.font = "800 18px Inter, system-ui, sans-serif";
    ctx.textBaseline = "middle";

    const p1 = state.players[0] || { score: 0, lives: 3 };
    const p2 = state.players[1] || { score: 0, lives: 3 };
    ctx.textAlign = "left";
    ctx.fillStyle = controls[0].color;
    ctx.fillText(`P1 ${String(p1.score).padStart(5, "0")}`, 28, 26);
    drawLives(167, 26, p1.lives, controls[0].accent);

    ctx.textAlign = "center";
    ctx.fillStyle = colors.white;
    ctx.fillText(`WAVE ${state.wave}`, W / 2, 26);

    ctx.textAlign = "right";
    ctx.fillStyle = controls[1].color;
    ctx.fillText(`${String(p2.score).padStart(5, "0")} P2`, W - 28, 26);
    drawLives(W - 248, 26, p2.lives, controls[1].accent);
    ctx.restore();
  }

  function drawLives(x, y, lives, color) {
    ctx.save();
    for (let i = 0; i < 3; i += 1) {
      ctx.globalAlpha = i < lives ? 1 : 0.18;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x + i * 16, y - 6);
      ctx.lineTo(x + i * 16 + 7, y);
      ctx.lineTo(x + i * 16, y + 6);
      ctx.lineTo(x + i * 16 - 7, y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTitle() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = colors.white;
    ctx.font = "900 64px Inter, system-ui, sans-serif";
    ctx.fillText("Unicorn Joust", W / 2, 124);
    ctx.font = "700 21px Inter, system-ui, sans-serif";
    ctx.fillStyle = colors.mint;
    ctx.fillText("Fly higher. Strike cleaner.", W / 2, 166);

    const demoA = {
      kind: "player",
      alive: true,
      x: 365,
      y: 305 + Math.sin(state.time * 0.04) * 4,
      dir: 1,
      color: colors.coral,
      accent: colors.amber,
      invulnerable: 0,
      flapGlow: 8,
      bob: 0,
    };
    const demoB = {
      kind: "player",
      alive: true,
      x: 595,
      y: 285 + Math.cos(state.time * 0.04) * 4,
      dir: -1,
      color: colors.blue,
      accent: colors.violet,
      invulnerable: 0,
      flapGlow: 8,
      bob: 1,
    };
    drawRider(demoA, demoA.x);
    drawRider(demoB, demoB.x);

    ctx.font = "800 17px Inter, system-ui, sans-serif";
    ctx.fillStyle = "rgba(251, 253, 255, 0.78)";
    ctx.fillText("Two riders. One arena.", W / 2, 406);
    ctx.restore();
  }

  function drawGameOver() {
    ctx.save();
    ctx.fillStyle = "rgba(8, 12, 18, 0.74)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.fillStyle = colors.white;
    ctx.font = "900 58px Inter, system-ui, sans-serif";
    ctx.fillText("Match Complete", W / 2, 148);
    ctx.fillStyle = colors.mint;
    ctx.font = "900 34px Inter, system-ui, sans-serif";
    ctx.fillText(state.matchWinner, W / 2, 204);

    const [p1, p2] = state.players;
    ctx.font = "800 22px Inter, system-ui, sans-serif";
    ctx.fillStyle = controls[0].color;
    ctx.fillText(`P1 ${p1.score}`, W / 2 - 120, 277);
    ctx.fillStyle = controls[1].color;
    ctx.fillText(`P2 ${p2.score}`, W / 2 + 120, 277);
    ctx.restore();
  }

  function drawPause() {
    ctx.save();
    ctx.fillStyle = "rgba(8, 12, 18, 0.62)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.fillStyle = colors.white;
    ctx.font = "900 58px Inter, system-ui, sans-serif";
    ctx.fillText("Paused", W / 2, H / 2);
    ctx.restore();
  }

  function drawBanners() {
    if (state.spawnBanner <= 0 || state.screen !== "playing") return;
    ctx.save();
    ctx.globalAlpha = clamp(state.spawnBanner / 45, 0, 1);
    ctx.textAlign = "center";
    ctx.fillStyle = colors.white;
    ctx.font = "900 34px Inter, system-ui, sans-serif";
    const message = state.waveDelay > 0 ? "Wave Clear" : `Wave ${state.wave}`;
    ctx.fillText(message, W / 2, 92);
    ctx.restore();
  }

  function render() {
    ctx.save();
    if (state.shake > 0) {
      ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));
    }

    drawBackground();
    drawPlatforms();

    if (state.screen !== "title") {
      drawEggs();

      for (const enemy of state.enemies) {
        drawRiderWithWrap(enemy);
      }

      for (const player of state.players) {
        if (player.alive) drawRiderWithWrap(player);
      }

      drawParticles();
      if (state.screen === "playing" || state.screen === "paused") drawHud();
      drawBanners();
    }
    ctx.restore();

    if (state.flash > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(state.flash / 20, 0, 0.18);
      ctx.fillStyle = colors.white;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    if (state.screen === "title") drawTitle();
    if (state.screen === "gameover") drawGameOver();
    if (state.screen === "paused") drawPause();
  }

  function tick(now) {
    const elapsed = state.lastTime ? now - state.lastTime : 16.67;
    state.lastTime = now;
    const dt = clamp(elapsed / 16.67, 0.25, 2);
    update(dt);
    render();
    window.requestAnimationFrame(tick);
  }

  function handleKeyDown(event) {
    const playKeys = [
      "KeyA",
      "KeyD",
      "KeyW",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "Space",
      "Enter",
      "KeyP",
      "KeyM",
    ];
    if (playKeys.includes(event.code)) {
      event.preventDefault();
    }

    if (event.code === "Space" || event.code === "Enter") {
      if (state.screen === "title" || state.screen === "gameover") {
        startMatch();
      }
      return;
    }

    if (event.code === "KeyP") {
      if (state.screen === "playing") {
        state.screen = "paused";
      } else if (state.screen === "paused") {
        state.screen = "playing";
      }
      updateButtons();
      return;
    }

    if (event.code === "KeyM") {
      unlockAudio();
      state.muted = !state.muted;
      updateButtons();
      return;
    }

    state.keys.add(event.code);
  }

  function handleKeyUp(event) {
    state.keys.delete(event.code);
  }

  startButton.addEventListener("click", startMatch);
  soundButton.addEventListener("click", () => {
    unlockAudio();
    state.muted = !state.muted;
    updateButtons();
  });
  window.addEventListener("keydown", handleKeyDown, { passive: false });
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", () => state.keys.clear());

  state.players = [makePlayer(0), makePlayer(1)];
  updateButtons();
  window.requestAnimationFrame(tick);

  window.unicornJoustGame = {
    start: startMatch,
    reset: resetMatch,
    getState: () => ({
      screen: state.screen,
      wave: state.wave,
      players: state.players.map((player) => ({
        name: player.name,
        score: player.score,
        lives: player.lives,
        alive: player.alive,
      })),
      enemies: state.enemies.length,
      eggs: state.eggs.length,
      muted: state.muted,
    }),
  };
  }

  let booted = false;
  function startWhenReady() {
    if (booted) return;
    if (
      !document.getElementById("gameCanvas") ||
      !document.getElementById("startButton") ||
      !document.getElementById("soundButton")
    ) {
      window.setTimeout(startWhenReady, 0);
      return;
    }
    booted = true;
    boot();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startWhenReady, { once: true });
  }
  startWhenReady();
})();
