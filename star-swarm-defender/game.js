(() => {
  "use strict";

  const WIDTH = 800;
  const HEIGHT = 600;
  const HUD_HEIGHT = 54;
  const TWO_PI = Math.PI * 2;

  const ENEMY_TYPES = {
    scout: {
      label: "Scout",
      width: 30,
      height: 23,
      health: 1,
      points: 100,
      color: "#42f5ff",
      core: "#d9fbff",
      bullet: "#7df6ff"
    },
    fighter: {
      label: "Fighter",
      width: 38,
      height: 28,
      health: 2,
      points: 200,
      color: "#ff5bd6",
      core: "#ffe0f6",
      bullet: "#ff8ce8"
    },
    bomber: {
      label: "Bomber",
      width: 48,
      height: 35,
      health: 3,
      points: 400,
      color: "#ffd166",
      core: "#fff1bf",
      bullet: "#ffd166"
    },
    boss: {
      label: "Solar Warden",
      width: 142,
      height: 62,
      health: 32,
      points: 2500,
      color: "#ff426d",
      core: "#fff0f4",
      bullet: "#ff7d98"
    }
  };

  const POWER_UPS = {
    rapid: {
      label: "Rapid Fire",
      short: "R",
      color: "#52ffa8"
    },
    double: {
      label: "Double Shot",
      short: "2",
      color: "#64a8ff"
    },
    shield: {
      label: "Shield",
      short: "S",
      color: "#fff36a"
    }
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const randomRange = (min, max) => min + Math.random() * (max - min);
  const distanceSq = (ax, ay, bx, by) => {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  };
  const roundedRect = (ctx, x, y, width, height, radius) => {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  class AudioManager {
    constructor() {
      this.context = null;
      this.masterGain = null;
      this.muted = false;
      this.supported = Boolean(window.AudioContext || window.webkitAudioContext);

      try {
        this.muted = localStorage.getItem("starSwarmMuted") === "true";
      } catch (error) {
        this.muted = false;
      }
    }

    ensureContext() {
      if (!this.supported || this.context) {
        return;
      }

      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.context = new AudioContextClass();
        this.masterGain = this.context.createGain();
        this.masterGain.gain.value = this.muted ? 0 : 0.22;
        this.masterGain.connect(this.context.destination);
      } catch (error) {
        this.supported = false;
      }
    }

    resume() {
      this.ensureContext();
      if (this.context && this.context.state === "suspended") {
        this.context.resume();
      }
    }

    toggleMute() {
      this.muted = !this.muted;
      if (this.masterGain) {
        this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.22, this.context.currentTime, 0.01);
      }

      try {
        localStorage.setItem("starSwarmMuted", String(this.muted));
      } catch (error) {
        // Storage can be unavailable in private browsing; the game still runs.
      }

      if (!this.muted) {
        this.resume();
        this.tone({ frequency: 680, endFrequency: 920, duration: 0.08, type: "triangle", gain: 0.12 });
      }
    }

    tone({ frequency, endFrequency = frequency, duration = 0.12, type = "sine", gain = 0.14 }) {
      if (this.muted) {
        return;
      }

      this.ensureContext();
      if (!this.context || !this.masterGain) {
        return;
      }

      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const envelope = this.context.createGain();

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), now + duration);
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(gain, now + 0.01);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      oscillator.connect(envelope);
      envelope.connect(this.masterGain);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    }

    burst(baseFrequency, count, spread, duration, type = "square", gain = 0.12) {
      for (let i = 0; i < count; i += 1) {
        setTimeout(() => {
          this.tone({
            frequency: baseFrequency + randomRange(-spread, spread),
            endFrequency: Math.max(50, baseFrequency * 0.35 + randomRange(-spread, spread)),
            duration,
            type,
            gain
          });
        }, i * 22);
      }
    }

    playerShoot() {
      this.tone({ frequency: 760, endFrequency: 1080, duration: 0.055, type: "triangle", gain: 0.11 });
    }

    enemyShoot() {
      this.tone({ frequency: 320, endFrequency: 190, duration: 0.09, type: "sawtooth", gain: 0.08 });
    }

    enemyExplosion() {
      this.burst(260, 3, 80, 0.12, "square", 0.08);
    }

    playerExplosion() {
      this.burst(180, 7, 120, 0.2, "sawtooth", 0.11);
    }

    waveClear() {
      this.tone({ frequency: 520, endFrequency: 780, duration: 0.13, type: "triangle", gain: 0.11 });
      setTimeout(() => this.tone({ frequency: 780, endFrequency: 1160, duration: 0.16, type: "triangle", gain: 0.11 }), 115);
    }

    gameOver() {
      this.tone({ frequency: 230, endFrequency: 90, duration: 0.55, type: "sawtooth", gain: 0.12 });
    }

    powerUp() {
      this.tone({ frequency: 850, endFrequency: 1500, duration: 0.12, type: "triangle", gain: 0.11 });
    }
  }

  class Starfield {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.stars = [];
      this.createStars();
    }

    createStars() {
      const layers = [
        { count: 75, speed: 24, size: [0.7, 1.4], alpha: [0.35, 0.65] },
        { count: 45, speed: 48, size: [1.0, 2.0], alpha: [0.45, 0.85] },
        { count: 24, speed: 86, size: [1.3, 2.6], alpha: [0.65, 1.0] }
      ];

      this.stars = layers.flatMap((layer) => (
        Array.from({ length: layer.count }, () => ({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          speed: layer.speed * randomRange(0.72, 1.25),
          radius: randomRange(layer.size[0], layer.size[1]),
          alpha: randomRange(layer.alpha[0], layer.alpha[1])
        }))
      ));
    }

    update(dt, speedBoost = 0) {
      for (const star of this.stars) {
        star.y += (star.speed + speedBoost) * dt;
        if (star.y > this.height + 4) {
          star.y = -4;
          star.x = Math.random() * this.width;
        }
      }
    }

    draw(ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
      gradient.addColorStop(0, "#050716");
      gradient.addColorStop(0.5, "#090d22");
      gradient.addColorStop(1, "#070914");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, this.width, this.height);

      for (const star of this.stars) {
        ctx.globalAlpha = star.alpha;
        ctx.fillStyle = "#eafdff";
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, TWO_PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.strokeStyle = "rgba(85, 250, 255, 0.08)";
      ctx.lineWidth = 1;
      for (let y = HUD_HEIGHT + 46; y < this.height; y += 44) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(this.width, y + Math.sin(y * 0.03) * 3);
        ctx.stroke();
      }
    }
  }

  class Bullet {
    constructor(x, y, vx, vy, radius, color, owner, damage = 1) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.radius = radius;
      this.color = color;
      this.owner = owner;
      this.damage = damage;
      this.dead = false;
    }

    update(dt) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      if (this.y < -24 || this.y > HEIGHT + 28 || this.x < -28 || this.x > WIDTH + 28) {
        this.dead = true;
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.shadowBlur = this.owner === "player" ? 16 : 12;
      ctx.shadowColor = this.color;
      ctx.fillStyle = this.color;

      const length = this.owner === "player" ? 16 : 12;
      const rounded = this.radius;
      roundedRect(ctx, this.x - this.radius, this.y - length / 2, this.radius * 2, length, rounded);
      ctx.fill();

      ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
      ctx.beginPath();
      ctx.arc(this.x, this.owner === "player" ? this.y - 4 : this.y + 4, Math.max(1.2, this.radius * 0.5), 0, TWO_PI);
      ctx.fill();
      ctx.restore();
    }
  }

  class Particle {
    constructor(x, y, color, size, speed, angle, life, shape = "circle") {
      this.x = x;
      this.y = y;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.color = color;
      this.size = size;
      this.life = life;
      this.maxLife = life;
      this.shape = shape;
      this.rotation = randomRange(0, TWO_PI);
      this.spin = randomRange(-5, 5);
    }

    update(dt) {
      this.life -= dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vx *= 0.985;
      this.vy *= 0.985;
      this.rotation += this.spin * dt;
    }

    draw(ctx) {
      if (this.life <= 0) {
        return;
      }

      const alpha = clamp(this.life / this.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowBlur = 18 * alpha;
      ctx.shadowColor = this.color;
      ctx.fillStyle = this.color;
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);

      if (this.shape === "spark") {
        ctx.fillRect(-this.size * 0.5, -this.size * 0.12, this.size, this.size * 0.24);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, this.size, 0, TWO_PI);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  class FloatingText {
    constructor(x, y, text, color = "#f7fbff", size = 17) {
      this.x = x;
      this.y = y;
      this.text = text;
      this.color = color;
      this.size = size;
      this.life = 0.95;
      this.maxLife = this.life;
      this.vy = -42;
    }

    update(dt) {
      this.life -= dt;
      this.y += this.vy * dt;
    }

    draw(ctx) {
      const alpha = clamp(this.life / this.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `700 ${this.size}px "Trebuchet MS", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowBlur = 12;
      ctx.shadowColor = this.color;
      ctx.fillStyle = this.color;
      ctx.fillText(this.text, this.x, this.y);
      ctx.restore();
    }
  }

  class PowerUp {
    constructor(x, y, type) {
      this.x = x;
      this.y = y;
      this.type = type;
      this.radius = 14;
      this.vy = 88;
      this.spin = 0;
      this.dead = false;
    }

    update(dt) {
      this.y += this.vy * dt;
      this.spin += dt * 4;
      if (this.y > HEIGHT + 30) {
        this.dead = true;
      }
    }

    draw(ctx) {
      const config = POWER_UPS[this.type];
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.spin);
      ctx.shadowBlur = 18;
      ctx.shadowColor = config.color;
      ctx.strokeStyle = config.color;
      ctx.fillStyle = "rgba(8, 12, 30, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const angle = -Math.PI / 2 + i * TWO_PI / 6;
        const px = Math.cos(angle) * this.radius;
        const py = Math.sin(angle) * this.radius;
        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.rotate(-this.spin);
      ctx.fillStyle = config.color;
      ctx.font = "700 16px Trebuchet MS, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(config.short, 0, 1);
      ctx.restore();
    }
  }

  class Player {
    constructor(game) {
      this.game = game;
      this.width = 42;
      this.height = 34;
      this.speed = 350;
      this.baseCooldown = 0.25;
      this.reset();
    }

    reset() {
      this.x = WIDTH / 2;
      this.y = HEIGHT - 64;
      this.cooldown = 0;
      this.invulnerable = 0;
      this.rapidTimer = 0;
      this.doubleTimer = 0;
      this.shield = 0;
      this.thrustPhase = 0;
    }

    respawn() {
      this.x = WIDTH / 2;
      this.y = HEIGHT - 64;
      this.cooldown = 0.35;
      this.invulnerable = 2.2;
      this.thrustPhase = 0;
    }

    update(dt, keys) {
      let direction = 0;
      if (keys.has("ArrowLeft") || keys.has("KeyA")) {
        direction -= 1;
      }
      if (keys.has("ArrowRight") || keys.has("KeyD")) {
        direction += 1;
      }

      this.x += direction * this.speed * dt;
      this.x = clamp(this.x, this.width * 0.55, WIDTH - this.width * 0.55);
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.invulnerable = Math.max(0, this.invulnerable - dt);
      this.rapidTimer = Math.max(0, this.rapidTimer - dt);
      this.doubleTimer = Math.max(0, this.doubleTimer - dt);
      this.thrustPhase += dt * 18;

      if (keys.has("Space")) {
        this.fire();
      }
    }

    fire() {
      if (this.cooldown > 0) {
        return;
      }

      const cooldown = this.rapidTimer > 0 ? 0.12 : this.baseCooldown;
      this.cooldown = cooldown;

      const bullets = [];
      if (this.doubleTimer > 0) {
        bullets.push(new Bullet(this.x - 12, this.y - 20, -18, -500, 3.2, "#7df9ff", "player", 1));
        bullets.push(new Bullet(this.x + 12, this.y - 20, 18, -500, 3.2, "#7df9ff", "player", 1));
      } else {
        bullets.push(new Bullet(this.x, this.y - 23, 0, -500, 3.4, "#7df9ff", "player", 1));
      }

      this.game.playerBullets.push(...bullets);
      this.game.shotsFired += bullets.length;
      this.game.audio.playerShoot();
    }

    applyPowerUp(type) {
      if (type === "rapid") {
        this.rapidTimer = 8;
      } else if (type === "double") {
        this.doubleTimer = 8;
      } else if (type === "shield") {
        this.shield = Math.min(2, this.shield + 1);
      }
    }

    draw(ctx) {
      const blinkOff = this.invulnerable > 0 && Math.floor(this.invulnerable * 12) % 2 === 0;
      if (blinkOff) {
        return;
      }

      ctx.save();
      ctx.translate(this.x, this.y);

      if (this.shield > 0) {
        ctx.shadowBlur = 26;
        ctx.shadowColor = "#fff36a";
        ctx.strokeStyle = "rgba(255, 243, 106, 0.72)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 31 + Math.sin(this.thrustPhase * 0.55) * 1.5, 0, TWO_PI);
        ctx.stroke();
      }

      const flame = 12 + Math.sin(this.thrustPhase) * 4;
      ctx.shadowBlur = 16;
      ctx.shadowColor = "#31f6ff";
      ctx.fillStyle = "#7df9ff";
      ctx.strokeStyle = "#e6fdff";
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.lineTo(19, 16);
      ctx.lineTo(8, 10);
      ctx.lineTo(0, 24);
      ctx.lineTo(-8, 10);
      ctx.lineTo(-19, 16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#1b2448";
      ctx.beginPath();
      ctx.moveTo(0, -13);
      ctx.lineTo(7, 7);
      ctx.lineTo(0, 12);
      ctx.lineTo(-7, 7);
      ctx.closePath();
      ctx.fill();

      ctx.shadowBlur = 18;
      ctx.shadowColor = "#ffb347";
      ctx.fillStyle = "#ffb347";
      ctx.beginPath();
      ctx.moveTo(-6, 18);
      ctx.lineTo(0, 18 + flame);
      ctx.lineTo(6, 18);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }

  class Enemy {
    constructor(type, x, y, level, options = {}) {
      const config = ENEMY_TYPES[type];
      this.type = type;
      this.label = config.label;
      this.baseX = x;
      this.baseY = y;
      this.x = x;
      this.y = y;
      this.width = config.width;
      this.height = config.height;
      this.maxHealth = type === "boss" ? config.health + level * 6 : config.health + Math.floor(Math.max(0, level - 1) / 4);
      this.health = this.maxHealth;
      this.points = type === "boss" ? config.points + level * 300 : config.points;
      this.color = config.color;
      this.core = config.core;
      this.bullet = config.bullet;
      this.state = "formation";
      this.diveTime = 0;
      this.diveDuration = 3.1;
      this.diveStartX = x;
      this.diveStartY = y;
      this.diveTargetX = x;
      this.diveAmplitude = 60;
      this.phase = randomRange(0, TWO_PI);
      this.dead = false;
      this.hitFlash = 0;
      this.bossFireTimer = randomRange(0.4, 1.2);
      this.wavePhase = options.wavePhase || randomRange(0, TWO_PI);
    }

    startDive(playerX) {
      if (this.state !== "formation" || this.type === "boss") {
        return;
      }

      this.state = "diving";
      this.diveTime = 0;
      this.diveDuration = randomRange(2.8, 3.7);
      this.diveStartX = this.x;
      this.diveStartY = this.y;
      this.diveTargetX = clamp(playerX + randomRange(-70, 70), 42, WIDTH - 42);
      this.diveAmplitude = randomRange(32, 88);
      this.phase = randomRange(0, TWO_PI);
    }

    takeDamage(amount) {
      this.health -= amount;
      this.hitFlash = 0.08;
      if (this.health <= 0) {
        this.dead = true;
      }
    }

    update(dt, game) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);

      if (this.type === "boss") {
        this.x += game.formationDirection * (36 + game.level * 4) * dt;
        this.y = this.baseY + Math.sin(game.elapsed * 1.8) * 8;
        if (this.x < this.width * 0.55 || this.x > WIDTH - this.width * 0.55) {
          game.formationDirection *= -1;
          this.x = clamp(this.x, this.width * 0.55, WIDTH - this.width * 0.55);
        }
        this.bossFireTimer -= dt;
        return;
      }

      if (this.state === "formation") {
        this.x = this.baseX + game.formationOffset;
        this.y = this.baseY + Math.sin(game.elapsed * 2.4 + this.wavePhase) * 4;
      } else if (this.state === "diving") {
        this.diveTime += dt;
        const progress = clamp(this.diveTime / this.diveDuration, 0, 1);
        const eased = easeInOut(progress);
        const sway = Math.sin(progress * Math.PI * 5 + this.phase) * this.diveAmplitude * (1 - progress * 0.25);
        this.x = clamp(lerp(this.diveStartX, this.diveTargetX, eased) + sway, 22, WIDTH - 22);
        this.y = this.diveStartY + progress * (HEIGHT + 70 - this.diveStartY);

        if (this.y > HEIGHT + 42) {
          this.state = "returning";
          this.y = -46;
          this.x = this.baseX + game.formationOffset;
        }
      } else if (this.state === "returning") {
        this.x = lerp(this.x, this.baseX + game.formationOffset, clamp(dt * 4, 0, 1));
        this.y += (145 + game.level * 12) * dt;
        if (this.y >= this.baseY) {
          this.state = "formation";
          this.y = this.baseY;
        }
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.shadowBlur = 18;
      ctx.shadowColor = this.hitFlash > 0 ? "#ffffff" : this.color;
      ctx.strokeStyle = this.hitFlash > 0 ? "#ffffff" : this.color;
      ctx.fillStyle = this.hitFlash > 0 ? "#ffffff" : "rgba(8, 12, 30, 0.92)";
      ctx.lineWidth = 2;

      if (this.type === "scout") {
        this.drawScout(ctx);
      } else if (this.type === "fighter") {
        this.drawFighter(ctx);
      } else if (this.type === "bomber") {
        this.drawBomber(ctx);
      } else {
        this.drawBoss(ctx);
      }

      if (this.maxHealth > 3) {
        this.drawHealthBar(ctx);
      }

      ctx.restore();
    }

    drawScout(ctx) {
      ctx.beginPath();
      ctx.moveTo(0, 15);
      ctx.lineTo(15, -8);
      ctx.lineTo(5, -2);
      ctx.lineTo(0, -16);
      ctx.lineTo(-5, -2);
      ctx.lineTo(-15, -8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = this.core;
      ctx.beginPath();
      ctx.arc(0, 2, 4, 0, TWO_PI);
      ctx.fill();
    }

    drawFighter(ctx) {
      ctx.beginPath();
      ctx.moveTo(0, 17);
      ctx.lineTo(20, 3);
      ctx.lineTo(12, -14);
      ctx.lineTo(0, -7);
      ctx.lineTo(-12, -14);
      ctx.lineTo(-20, 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = this.core;
      ctx.beginPath();
      ctx.moveTo(-9, -2);
      ctx.lineTo(0, 8);
      ctx.lineTo(9, -2);
      ctx.stroke();
    }

    drawBomber(ctx) {
      ctx.beginPath();
      ctx.moveTo(0, 18);
      ctx.lineTo(24, 9);
      ctx.lineTo(16, -12);
      ctx.lineTo(7, -17);
      ctx.lineTo(0, -10);
      ctx.lineTo(-7, -17);
      ctx.lineTo(-16, -12);
      ctx.lineTo(-24, 9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = this.core;
      ctx.fillRect(-10, -1, 20, 7);
      ctx.fillStyle = this.color;
      ctx.fillRect(-3, 8, 6, 7);
    }

    drawBoss(ctx) {
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-70, 10);
      ctx.lineTo(-42, -26);
      ctx.lineTo(-14, -18);
      ctx.lineTo(0, -31);
      ctx.lineTo(14, -18);
      ctx.lineTo(42, -26);
      ctx.lineTo(70, 10);
      ctx.lineTo(38, 27);
      ctx.lineTo(0, 16);
      ctx.lineTo(-38, 27);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = this.core;
      ctx.beginPath();
      ctx.arc(0, -1, 13, 0, TWO_PI);
      ctx.fill();
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(0, -1, 7, 0, TWO_PI);
      ctx.fill();
    }

    drawHealthBar(ctx) {
      const barWidth = this.type === "boss" ? 116 : this.width;
      const y = this.height * 0.62;
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
      ctx.fillRect(-barWidth / 2, y, barWidth, 5);
      ctx.fillStyle = this.color;
      ctx.fillRect(-barWidth / 2, y, barWidth * clamp(this.health / this.maxHealth, 0, 1), 5);
    }
  }

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.dpr = 1;
      this.keys = new Set();
      this.audio = new AudioManager();
      this.starfield = new Starfield(WIDTH, HEIGHT);
      this.player = new Player(this);
      this.highScore = this.loadHighScore();
      this.state = "start";
      this.lastTime = 0;
      this.elapsed = 0;
      this.messageTimer = 0;
      this.waveClearTimer = 0;
      this.waveBonus = 0;
      this.accuracyBonus = 0;
      this.screenShake = 0;
      this.setupCanvas();
      this.bindEvents();
      this.resetGame();
      requestAnimationFrame((time) => this.loop(time));
    }

    setupCanvas() {
      const resize = () => {
        this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        this.canvas.width = Math.floor(WIDTH * this.dpr);
        this.canvas.height = Math.floor(HEIGHT * this.dpr);
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      };

      resize();
      window.addEventListener("resize", resize);
      this.canvas.focus();
    }

    bindEvents() {
      window.addEventListener("keydown", (event) => {
        const handledCodes = ["ArrowLeft", "ArrowRight", "Space", "Enter", "KeyA", "KeyD", "KeyP", "KeyM"];
        if (handledCodes.includes(event.code)) {
          event.preventDefault();
        }

        this.audio.resume();
        this.keys.add(event.code);

        if (!event.repeat) {
          if (event.code === "Enter") {
            if (this.state === "start" || this.state === "gameOver") {
              this.startGame();
            }
          } else if (event.code === "KeyP") {
            this.togglePause();
          } else if (event.code === "KeyM") {
            this.audio.toggleMute();
          }
        }
      });

      window.addEventListener("keyup", (event) => {
        this.keys.delete(event.code);
      });

      window.addEventListener("blur", () => {
        this.keys.clear();
        if (this.state === "playing") {
          this.state = "paused";
        }
      });

      this.canvas.addEventListener("pointerdown", () => {
        this.canvas.focus();
        this.audio.resume();
      });
    }

    loadHighScore() {
      try {
        return Number(localStorage.getItem("starSwarmHighScore")) || 0;
      } catch (error) {
        return 0;
      }
    }

    saveHighScore() {
      if (this.score <= this.highScore) {
        return;
      }

      this.highScore = this.score;
      try {
        localStorage.setItem("starSwarmHighScore", String(this.highScore));
      } catch (error) {
        // High score persistence is optional when storage is blocked.
      }
    }

    resetGame() {
      this.score = 0;
      this.level = 1;
      this.lives = 3;
      this.playerBullets = [];
      this.enemyBullets = [];
      this.enemies = [];
      this.particles = [];
      this.powerUps = [];
      this.floatingTexts = [];
      this.formationOffset = 0;
      this.formationDirection = 1;
      this.formationSpeed = 40;
      this.enemyFireRate = 0.015;
      this.diveRate = 0.075;
      this.shotsFired = 0;
      this.shotsHit = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.clearMessage = "";
      this.player.reset();
    }

    startGame() {
      this.audio.resume();
      this.resetGame();
      this.spawnWave();
      this.state = "playing";
    }

    togglePause() {
      if (this.state === "playing") {
        this.state = "paused";
      } else if (this.state === "paused") {
        this.state = "playing";
        this.lastTime = performance.now();
      }
    }

    spawnWave() {
      this.enemies = [];
      this.enemyBullets = [];
      this.playerBullets = [];
      this.powerUps = [];
      this.formationOffset = 0;
      this.formationDirection = Math.random() < 0.5 ? -1 : 1;
      this.formationSpeed = 40 + (this.level - 1) * 7;
      this.enemyFireRate = Math.min(0.045, 0.015 + (this.level - 1) * 0.0035);
      this.diveRate = Math.min(0.26, 0.075 + (this.level - 1) * 0.018);

      if (this.level % 5 === 0) {
        this.spawnBossWave();
        return;
      }

      const columns = Math.min(10, 8 + Math.floor(this.level / 3));
      const rows = Math.min(5, 3 + Math.floor((this.level - 1) / 2));
      const xSpacing = 62;
      const ySpacing = 47;
      const startX = (WIDTH - (columns - 1) * xSpacing) / 2;
      const startY = 96;

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < columns; col += 1) {
          let type = "scout";
          if (row <= 1 || this.level >= 4) {
            type = "fighter";
          }
          if ((row === 0 && this.level >= 3) || (this.level >= 6 && row === 1 && col % 3 === 1)) {
            type = "bomber";
          }

          const x = startX + col * xSpacing;
          const y = startY + row * ySpacing;
          this.enemies.push(new Enemy(type, x, y, this.level, { wavePhase: row * 0.65 + col * 0.2 }));
        }
      }
    }

    spawnBossWave() {
      const boss = new Enemy("boss", WIDTH / 2, 116, this.level);
      this.enemies.push(boss);

      const escortCount = Math.min(8, 4 + Math.floor(this.level / 5));
      for (let i = 0; i < escortCount; i += 1) {
        const side = i % 2 === 0 ? -1 : 1;
        const rank = Math.floor(i / 2);
        const x = WIDTH / 2 + side * (135 + rank * 52);
        const y = 194 + (rank % 2) * 42;
        this.enemies.push(new Enemy(rank > 1 ? "fighter" : "scout", x, y, this.level));
      }
    }

    loop(timestamp) {
      const dt = Math.min(0.034, (timestamp - this.lastTime) / 1000 || 0);
      this.lastTime = timestamp;
      this.update(dt);
      this.draw();
      requestAnimationFrame((time) => this.loop(time));
    }

    update(dt) {
      this.elapsed += dt;
      const starBoost = this.state === "waveCleared" ? 70 : 0;
      this.starfield.update(dt, starBoost);
      this.updateParticles(dt);

      if (this.screenShake > 0) {
        this.screenShake = Math.max(0, this.screenShake - dt * 24);
      }

      if (this.state === "playing") {
        this.updatePlaying(dt);
      } else if (this.state === "waveCleared") {
        this.waveClearTimer -= dt;
        if (this.waveClearTimer <= 0) {
          this.level += 1;
          this.spawnWave();
          this.state = "playing";
        }
      }
    }

    updatePlaying(dt) {
      this.player.update(dt, this.keys);
      this.updateFormation(dt);
      this.updateEnemies(dt);
      this.updateBullets(dt);
      this.updatePowerUps(dt);
      this.handleCollisions();
      if (this.state !== "playing") {
        return;
      }
      this.maybeStartDive(dt);
      this.maybeEnemyFire(dt);

      if (this.enemies.length === 0) {
        this.clearWave();
      }
    }

    updateFormation(dt) {
      const formationEnemies = this.enemies.filter((enemy) => enemy.state === "formation" && enemy.type !== "boss");
      if (formationEnemies.length === 0) {
        return;
      }

      let minX = Infinity;
      let maxX = -Infinity;
      for (const enemy of formationEnemies) {
        minX = Math.min(minX, enemy.baseX + this.formationOffset - enemy.width / 2);
        maxX = Math.max(maxX, enemy.baseX + this.formationOffset + enemy.width / 2);
      }

      if ((maxX > WIDTH - 34 && this.formationDirection > 0) || (minX < 34 && this.formationDirection < 0)) {
        this.formationDirection *= -1;
      }

      this.formationOffset += this.formationDirection * this.formationSpeed * dt;
    }

    updateEnemies(dt) {
      for (const enemy of this.enemies) {
        enemy.update(dt, this);
      }
    }

    updateBullets(dt) {
      for (const bullet of this.playerBullets) {
        bullet.update(dt);
        if (bullet.dead) {
          this.registerMiss();
        }
      }

      for (const bullet of this.enemyBullets) {
        bullet.update(dt);
      }

      this.playerBullets = this.playerBullets.filter((bullet) => !bullet.dead);
      this.enemyBullets = this.enemyBullets.filter((bullet) => !bullet.dead);
    }

    updatePowerUps(dt) {
      for (const powerUp of this.powerUps) {
        powerUp.update(dt);
        if (distanceSq(powerUp.x, powerUp.y, this.player.x, this.player.y) < Math.pow(powerUp.radius + 24, 2)) {
          powerUp.dead = true;
          this.player.applyPowerUp(powerUp.type);
          const label = POWER_UPS[powerUp.type].label;
          this.floatingTexts.push(new FloatingText(this.player.x, this.player.y - 36, label, POWER_UPS[powerUp.type].color, 15));
          this.createBurst(powerUp.x, powerUp.y, POWER_UPS[powerUp.type].color, 20, 120);
          this.audio.powerUp();
        }
      }

      this.powerUps = this.powerUps.filter((powerUp) => !powerUp.dead);
    }

    updateParticles(dt) {
      for (const particle of this.particles) {
        particle.update(dt);
      }
      for (const text of this.floatingTexts) {
        text.update(dt);
      }

      this.particles = this.particles.filter((particle) => particle.life > 0);
      this.floatingTexts = this.floatingTexts.filter((text) => text.life > 0);
    }

    maybeStartDive(dt) {
      const activeDivers = this.enemies.filter((enemy) => enemy.state === "diving").length;
      const maxDivers = Math.min(4, 1 + Math.floor(this.level / 3));
      if (activeDivers >= maxDivers || Math.random() > this.diveRate * dt) {
        return;
      }

      const candidates = this.enemies.filter((enemy) => enemy.state === "formation" && enemy.type !== "boss");
      if (candidates.length === 0) {
        return;
      }

      candidates[Math.floor(Math.random() * candidates.length)].startDive(this.player.x);
    }

    maybeEnemyFire(dt) {
      for (const enemy of this.enemies) {
        if (enemy.type === "boss") {
          if (enemy.bossFireTimer <= 0) {
            this.fireBossPattern(enemy);
            enemy.bossFireTimer = Math.max(0.7, 1.5 - this.level * 0.055);
          }
          continue;
        }

        const rate = enemy.state === "diving" ? this.enemyFireRate * 2.3 : this.enemyFireRate;
        if (Math.random() < rate * dt) {
          this.fireEnemyBullet(enemy);
        }
      }
    }

    fireEnemyBullet(enemy) {
      const aim = clamp((this.player.x - enemy.x) * 0.12, -70, 70);
      this.enemyBullets.push(new Bullet(enemy.x, enemy.y + enemy.height * 0.45, aim, 220 + this.level * 7, 3.3, enemy.bullet, "enemy", 1));
      this.audio.enemyShoot();
    }

    fireBossPattern(enemy) {
      const speed = 180 + this.level * 8;
      const bulletCount = 7;
      const startAngle = Math.PI * 0.25;
      const endAngle = Math.PI * 0.75;
      for (let i = 0; i < bulletCount; i += 1) {
        const t = bulletCount === 1 ? 0.5 : i / (bulletCount - 1);
        const angle = lerp(startAngle, endAngle, t);
        this.enemyBullets.push(new Bullet(
          enemy.x,
          enemy.y + enemy.height * 0.45,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          3.8,
          enemy.bullet,
          "enemy",
          1
        ));
      }
      this.audio.enemyShoot();
    }

    handleCollisions() {
      for (let i = this.playerBullets.length - 1; i >= 0; i -= 1) {
        const bullet = this.playerBullets[i];
        for (let j = this.enemies.length - 1; j >= 0; j -= 1) {
          const enemy = this.enemies[j];
          if (enemy.dead) {
            continue;
          }
          const hitRadius = Math.max(enemy.width, enemy.height) * 0.48 + bullet.radius;
          if (distanceSq(bullet.x, bullet.y, enemy.x, enemy.y) <= hitRadius * hitRadius) {
            bullet.dead = true;
            this.shotsHit += 1;
            enemy.takeDamage(bullet.damage);
            this.createBurst(bullet.x, bullet.y, "#ffffff", 6, 60);
            if (enemy.dead) {
              this.destroyEnemy(enemy, true);
            }
            break;
          }
        }
      }

      for (const bullet of this.enemyBullets) {
        if (distanceSq(bullet.x, bullet.y, this.player.x, this.player.y) < Math.pow(this.player.width * 0.45 + bullet.radius, 2)) {
          bullet.dead = true;
          this.hitPlayer();
        }
      }

      for (const enemy of this.enemies) {
        if (enemy.dead) {
          continue;
        }
        if (enemy.state !== "diving") {
          continue;
        }
        if (distanceSq(enemy.x, enemy.y, this.player.x, this.player.y) < Math.pow(this.player.width * 0.55 + enemy.width * 0.36, 2)) {
          enemy.dead = true;
          this.destroyEnemy(enemy, false);
          this.hitPlayer();
        }
      }

      this.playerBullets = this.playerBullets.filter((bullet) => !bullet.dead);
      this.enemyBullets = this.enemyBullets.filter((bullet) => !bullet.dead);
      this.enemies = this.enemies.filter((enemy) => !enemy.dead);
    }

    destroyEnemy(enemy, awardPoints) {
      this.createExplosion(enemy.x, enemy.y, enemy.color, enemy.type === "boss" ? 54 : 22, enemy.type === "boss" ? 260 : 165);
      this.audio.enemyExplosion();

      if (awardPoints) {
        this.combo += 1;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        const multiplier = this.getComboMultiplier();
        const points = Math.round(enemy.points * multiplier);
        this.score += points;
        const comboText = multiplier > 1 ? `+${points} x${multiplier.toFixed(2)}` : `+${points}`;
        this.floatingTexts.push(new FloatingText(enemy.x, enemy.y - 10, comboText, enemy.color, enemy.type === "boss" ? 22 : 16));
        this.saveHighScore();
      }

      const dropChance = enemy.type === "boss" ? 0.9 : 0.08 + Math.min(0.06, this.level * 0.006);
      if (awardPoints && Math.random() < dropChance) {
        const types = Object.keys(POWER_UPS);
        const type = types[Math.floor(Math.random() * types.length)];
        this.powerUps.push(new PowerUp(enemy.x, enemy.y, type));
      }
    }

    hitPlayer() {
      if (this.player.invulnerable > 0 || this.state !== "playing") {
        return;
      }

      this.combo = 0;
      if (this.player.shield > 0) {
        this.player.shield -= 1;
        this.player.invulnerable = 1.1;
        this.screenShake = 8;
        this.createBurst(this.player.x, this.player.y, "#fff36a", 34, 210);
        this.audio.powerUp();
        return;
      }

      this.lives -= 1;
      this.screenShake = 18;
      this.createExplosion(this.player.x, this.player.y, "#7df9ff", 52, 250);
      this.audio.playerExplosion();
      this.enemyBullets = [];

      if (this.lives > 0) {
        this.player.respawn();
      } else {
        this.endGame();
      }
    }

    clearWave() {
      const accuracy = this.getAccuracy();
      this.waveBonus = 1000 + this.level * 250;
      this.accuracyBonus = Math.round(this.waveBonus * clamp(accuracy / 100, 0, 1) * 0.35);
      const totalBonus = this.waveBonus + this.accuracyBonus;
      this.score += totalBonus;
      this.clearMessage = `Wave ${this.level} cleared`;
      this.waveClearTimer = 2.65;
      this.combo = 0;
      this.state = "waveCleared";
      this.floatingTexts.push(new FloatingText(WIDTH / 2, HEIGHT / 2 + 58, `Bonus +${totalBonus}`, "#fff36a", 22));
      this.createBurst(WIDTH / 2, HEIGHT / 2, "#7df9ff", 70, 230);
      this.audio.waveClear();
      this.saveHighScore();
    }

    endGame() {
      this.state = "gameOver";
      this.saveHighScore();
      this.audio.gameOver();
    }

    registerMiss() {
      this.combo = 0;
    }

    getComboMultiplier() {
      return 1 + Math.min(1.5, Math.floor(this.combo / 4) * 0.25);
    }

    getAccuracy() {
      if (this.shotsFired === 0) {
        return 0;
      }
      return Math.round((this.shotsHit / this.shotsFired) * 100);
    }

    createBurst(x, y, color, count, speed) {
      for (let i = 0; i < count; i += 1) {
        this.particles.push(new Particle(
          x,
          y,
          color,
          randomRange(1.4, 3.3),
          randomRange(speed * 0.2, speed),
          randomRange(0, TWO_PI),
          randomRange(0.25, 0.65),
          Math.random() < 0.5 ? "spark" : "circle"
        ));
      }
    }

    createExplosion(x, y, color, count, speed) {
      this.createBurst(x, y, color, count, speed);
      this.createBurst(x, y, "#ffffff", Math.floor(count * 0.28), speed * 0.8);
    }

    draw() {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      const shakeX = this.screenShake > 0 ? randomRange(-this.screenShake, this.screenShake) * 0.45 : 0;
      const shakeY = this.screenShake > 0 ? randomRange(-this.screenShake, this.screenShake) * 0.45 : 0;

      ctx.save();
      ctx.translate(shakeX, shakeY);
      this.starfield.draw(ctx);
      this.drawPlayfield(ctx);
      ctx.restore();

      this.drawHud(ctx);
      this.drawOverlay(ctx);
    }

    drawPlayfield(ctx) {
      for (const powerUp of this.powerUps) {
        powerUp.draw(ctx);
      }
      for (const enemy of this.enemies) {
        enemy.draw(ctx);
      }
      for (const bullet of this.playerBullets) {
        bullet.draw(ctx);
      }
      for (const bullet of this.enemyBullets) {
        bullet.draw(ctx);
      }
      this.player.draw(ctx);
      for (const particle of this.particles) {
        particle.draw(ctx);
      }
      for (const text of this.floatingTexts) {
        text.draw(ctx);
      }
    }

    drawHud(ctx) {
      ctx.save();
      ctx.fillStyle = "rgba(2, 5, 16, 0.72)";
      ctx.fillRect(0, 0, WIDTH, HUD_HEIGHT);
      ctx.strokeStyle = "rgba(126, 249, 255, 0.34)";
      ctx.beginPath();
      ctx.moveTo(0, HUD_HEIGHT + 0.5);
      ctx.lineTo(WIDTH, HUD_HEIGHT + 0.5);
      ctx.stroke();

      ctx.font = "700 16px Trebuchet MS, monospace";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#eafdff";
      ctx.textAlign = "left";
      ctx.fillText(`Score ${this.score}`, 22, 20);
      ctx.fillStyle = "#9eefff";
      ctx.fillText(`High ${this.highScore}`, 22, 40);

      ctx.textAlign = "center";
      ctx.fillStyle = "#fff36a";
      ctx.fillText(`Level ${this.level}`, WIDTH / 2, 20);
      ctx.fillStyle = "#f0fbff";
      const multiplier = this.getComboMultiplier();
      const comboLabel = this.combo > 1 ? `Combo ${this.combo} x${multiplier.toFixed(2)}` : `Accuracy ${this.getAccuracy()}%`;
      ctx.fillText(comboLabel, WIDTH / 2, 40);

      ctx.textAlign = "right";
      ctx.fillStyle = "#eafdff";
      ctx.fillText(`Lives ${this.lives}`, WIDTH - 22, 20);
      ctx.fillStyle = this.audio.muted ? "#ff8c9f" : "#52ffa8";
      ctx.fillText(this.audio.muted ? "Muted" : "Sound On", WIDTH - 22, 40);

      this.drawPowerTimers(ctx);
      ctx.restore();
    }

    drawPowerTimers(ctx) {
      const items = [];
      if (this.player.rapidTimer > 0) {
        items.push({ label: "R", value: this.player.rapidTimer, color: POWER_UPS.rapid.color });
      }
      if (this.player.doubleTimer > 0) {
        items.push({ label: "2", value: this.player.doubleTimer, color: POWER_UPS.double.color });
      }
      if (this.player.shield > 0) {
        items.push({ label: "S", value: this.player.shield, color: POWER_UPS.shield.color, isCount: true });
      }

      let x = WIDTH - 330;
      for (const item of items) {
        ctx.fillStyle = item.color;
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 1.5;
        roundedRect(ctx, x, 17, 28, 22, 6);
        ctx.stroke();
        ctx.font = "700 14px Trebuchet MS, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(item.label, x + 14, 28);
        ctx.font = "700 12px Trebuchet MS, monospace";
        ctx.fillText(item.isCount ? String(item.value) : `${Math.ceil(item.value)}s`, x + 48, 28);
        x += 76;
      }
    }

    drawOverlay(ctx) {
      if (this.state === "playing") {
        return;
      }

      ctx.save();
      ctx.fillStyle = "rgba(3, 6, 18, 0.66)";
      ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowBlur = 18;

      if (this.state === "start") {
        this.drawStartScreen(ctx);
      } else if (this.state === "paused") {
        this.drawPauseScreen(ctx);
      } else if (this.state === "waveCleared") {
        this.drawWaveClearScreen(ctx);
      } else if (this.state === "gameOver") {
        this.drawGameOverScreen(ctx);
      }

      ctx.restore();
    }

    drawStartScreen(ctx) {
      ctx.shadowColor = "#7df9ff";
      ctx.fillStyle = "#eafdff";
      ctx.font = "700 46px Trebuchet MS, monospace";
      ctx.fillText("Star Swarm Defender", WIDTH / 2, 164);

      ctx.shadowBlur = 0;
      ctx.fillStyle = "#9eefff";
      ctx.font = "700 18px Trebuchet MS, monospace";
      ctx.fillText("Move: Arrow Keys or A/D   Fire: Space", WIDTH / 2, 248);
      ctx.fillText("Pause: P   Mute: M", WIDTH / 2, 282);
      ctx.font = "700 15px Trebuchet MS, monospace";
      ctx.fillText("Controller: Stick/D-pad Move   A/RT Fire   Start Pause   Y Mute", WIDTH / 2, 316);

      ctx.fillStyle = "#fff36a";
      ctx.font = "700 24px Trebuchet MS, monospace";
      ctx.fillText("Press Enter to Start", WIDTH / 2, 365);

      ctx.fillStyle = "rgba(234, 253, 255, 0.72)";
      ctx.font = "16px Trebuchet MS, monospace";
      ctx.fillText("Break the swarm, dodge dives, and survive the rising waves.", WIDTH / 2, 415);
    }

    drawPauseScreen(ctx) {
      ctx.shadowColor = "#fff36a";
      ctx.fillStyle = "#fff36a";
      ctx.font = "700 44px Trebuchet MS, monospace";
      ctx.fillText("Paused", WIDTH / 2, HEIGHT / 2 - 20);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#eafdff";
      ctx.font = "700 18px Trebuchet MS, monospace";
      ctx.fillText("Press P to Resume", WIDTH / 2, HEIGHT / 2 + 34);
    }

    drawWaveClearScreen(ctx) {
      ctx.shadowColor = "#52ffa8";
      ctx.fillStyle = "#52ffa8";
      ctx.font = "700 38px Trebuchet MS, monospace";
      ctx.fillText(this.clearMessage, WIDTH / 2, HEIGHT / 2 - 70);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#eafdff";
      ctx.font = "700 19px Trebuchet MS, monospace";
      ctx.fillText(`Clear Bonus +${this.waveBonus}`, WIDTH / 2, HEIGHT / 2 - 16);
      ctx.fillText(`Accuracy Bonus +${this.accuracyBonus}`, WIDTH / 2, HEIGHT / 2 + 18);
      ctx.fillStyle = "#fff36a";
      ctx.fillText(`Next wave in ${Math.ceil(this.waveClearTimer)}`, WIDTH / 2, HEIGHT / 2 + 66);
    }

    drawGameOverScreen(ctx) {
      ctx.shadowColor = "#ff426d";
      ctx.fillStyle = "#ff8ca2";
      ctx.font = "700 44px Trebuchet MS, monospace";
      ctx.fillText("Game Over", WIDTH / 2, 176);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#eafdff";
      ctx.font = "700 20px Trebuchet MS, monospace";
      ctx.fillText(`Final Score ${this.score}`, WIDTH / 2, 250);
      ctx.fillText(`High Score ${this.highScore}`, WIDTH / 2, 286);
      ctx.fillText(`Accuracy ${this.getAccuracy()}%   Best Combo ${this.maxCombo}`, WIDTH / 2, 322);
      ctx.fillStyle = "#fff36a";
      ctx.font = "700 24px Trebuchet MS, monospace";
      ctx.fillText("Press Enter to Restart", WIDTH / 2, 396);
    }
  }

  const canvas = document.getElementById("gameCanvas");
  if (canvas) {
    new Game(canvas);
  }
})();
