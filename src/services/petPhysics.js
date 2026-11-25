const { resolveHeroId, getHeroDescriptor, VALID_MOVEMENT_ARCHETYPES } = require('./heroRegistry');

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Data-Driven 5-Archetype Companion Physics Engine:
 * - swing : Spider-Man-style web tether pendulum arcs, mid-air flips & corner hanging
 * - fly   : Iron Man-style jet-powered aerial acceleration, hover lift & banking turns
 * - glide : Batman-style controlled gliding descent, grappling-hook zips & rooftop perching
 * - swim  : Nemo-style sinusoidal aquatic swimming, tail swish & fluid directional turning
 * - float : Spring-based zero-G orbital hovering
 * All 5 archetypes share elastic rubber-band drag squish-and-recoil physics.
 */
class PetPhysics {
  constructor(workArea) {
    this.bounds = workArea || { x: 0, y: 0, width: 1536, height: 864 };
    this.winW = 204;
    this.winH = 196;

    this.character = 'spidey';
    this.movementArchetype = 'swing'; // 'swing' | 'fly' | 'glide' | 'swim' | 'float'
    this.speedScale = 1.0;

    this.x = this.bounds.x + Math.max(180, this.bounds.width - 230);
    this.y = this.bounds.y + Math.max(170, this.bounds.height - 210);
    this.vx = -76;
    this.vy = -12;
    this.speed = 77;
    this.facing = -1;
    this.pitch = 0;

    this.mode = 'swim'; // 'swim' | 'fast' | 'slow' | 'stay' | 'follow'
    this.anchorX = this.x;
    this.anchorY = this.y;
    this.target = null;
    this.wanderTarget = this.pickWanderPoint();
    this.wanderPauseTimer = 0;

    // Archetype-specific kinematic states
    this.swingCycle = 0; // 0..1 continuous cycle
    this.acrobatState = 'swinging'; // 'swinging' | 'flipping' | 'hanging' | 'zipping'
    this.glideState = 'gliding'; // 'gliding' | 'grappling' | 'perching' | 'dashing'
    this.glideCycle = 0;
    this.animalState = 'walking'; // capybara: waddling|resting|swimming; cat: walking|stalking|pouncing|stretching|grooming|sleeping; dog: walking|trotting|running|sitting|playing
    this.animalCycle = 0;

    // Elastic drag squash-and-stretch spring
    this.stretchX = 0;
    this.stretchY = 0;
    this.stretchVx = 0;
    this.stretchVy = 0;
    this.squishMag = 0;

    this.cursor = { x: this.x - 120, y: this.y };
    this.isDragging = false;
    this.hudOpen = false;
    this.time = 0;
  }

  setCharacter(char, customHeroes = []) {
    const norm = resolveHeroId(char, customHeroes);
    if (norm) {
      this.character = norm;
      const desc = getHeroDescriptor(norm, customHeroes);
      this.setMovementArchetype(desc?.movement || 'swing', desc?.speed || 1.0);
      this.swingCycle = 0;
      this.glideCycle = 0;
    }
  }

  setMovementArchetype(archetype, speedScale = 1.0) {
    const legacyMap = { waddle: 'stride', prowl: 'scout', trot: 'drone' };
    const norm = legacyMap[archetype] || archetype;
    if (VALID_MOVEMENT_ARCHETYPES.has(norm)) {
      this.movementArchetype = norm;
    }
    const sc = Number(speedScale);
    if (Number.isFinite(sc)) {
      this.speedScale = clamp(sc, 0.6, 1.6);
    }
  }

  applyDragPull(dx, dy) {
    this.stretchX = clamp(dx / 95, -1.2, 1.2);
    this.stretchY = clamp(dy / 95, -1.2, 1.2);
    this.squishMag = clamp(Math.hypot(this.stretchX, this.stretchY), 0, 1.15);
  }

  releaseDragSpring() {
    this.stretchVx = -this.stretchX * 14;
    this.stretchVy = -this.stretchY * 14;
  }

  setWorkArea(wa) {
    if (!wa) return;
    this.bounds = wa;
    this.clampPosition();
  }

  clampPosition() {
    const padX = Math.round(this.winW / 2) + 8;
    const padY = Math.round(this.winH / 2) + 8;
    const minX = this.bounds.x + padX;
    const maxX = Math.max(minX + 10, this.bounds.x + this.bounds.width - padX);
    const minY = this.bounds.y + padY;
    const maxY = Math.max(minY + 10, this.bounds.y + this.bounds.height - padY);
    this.x = clamp(this.x, minX, maxX);
    this.y = clamp(this.y, minY, maxY);
  }

  setPosition(x, y) {
    this.x = x;
    this.y = y;
    this.clampPosition();
    this.anchorX = this.x;
    this.anchorY = this.y;
  }

  setMode(mode) {
    this.mode = mode;
    this.target = null;
    if (mode === 'stay') {
      this.anchorX = this.x;
      this.anchorY = this.y;
      this.vx *= 0.15;
      this.vy *= 0.15;
    } else if (mode === 'fast') {
      this.wanderPauseTimer = 0;
      this.wanderTarget = this.pickWanderPoint(true);
    } else if (mode === 'swim' || mode === 'slow') {
      this.wanderPauseTimer = 0;
      this.wanderTarget = this.pickWanderPoint(false);
    }
  }

  goTo(x, y, thenStay = false) {
    const padX = Math.round(this.winW / 2) + 12;
    const padY = Math.round(this.winH / 2) + 12;
    const tx = clamp(x, this.bounds.x + padX, this.bounds.x + this.bounds.width - padX);
    const ty = clamp(y, this.bounds.y + padY, this.bounds.y + this.bounds.height - padY);
    this.target = { x: tx, y: ty, thenStay };
    this.wanderPauseTimer = 0;
  }

  goToCorner(corner, thenStay = true) {
    const padX = 132;
    const padY = 122;
    const b = this.bounds;
    const map = {
      'top-left': [b.x + padX, b.y + padY],
      'top-right': [b.x + b.width - padX, b.y + padY],
      'bottom-left': [b.x + padX, b.y + b.height - padY],
      'bottom-right': [b.x + b.width - padX, b.y + b.height - padY],
      center: [b.x + b.width * 0.5, b.y + b.height * 0.48],
    };
    const [cx, cy] = map[corner] || map['bottom-right'];
    this.goTo(cx, cy, thenStay);
  }

  pickWanderPoint(far = false) {
    const padX = 124;
    const padY = 112;
    const b = this.bounds;
    for (let i = 0; i < 6; i++) {
      const px = b.x + padX + Math.random() * Math.max(80, b.width - padX * 2);
      const py = b.y + padY + Math.random() * Math.max(80, b.height - padY * 2);
      const dist = Math.hypot(px - this.x, py - this.y);
      if (!far || dist > Math.min(b.width, b.height) * 0.38) return { x: px, y: py };
    }
    return {
      x: b.x + padX + Math.random() * Math.max(80, b.width - padX * 2),
      y: b.y + padY + Math.random() * Math.max(80, b.height - padY * 2),
    };
  }

  step(dt) {
    dt = Math.min(dt, 0.06);
    this.time += dt;
    let arrived = false;
    const arch = this.movementArchetype || 'swing';
    const spdMul = this.speedScale || 1.0;

    // Damped harmonic spring for elastic drag squish-retract
    if (!this.isDragging) {
      const k = 92;
      const damp = 8.2;
      const ax = -k * this.stretchX - damp * this.stretchVx;
      const ay = -k * this.stretchY - damp * this.stretchVy;
      this.stretchVx += ax * dt;
      this.stretchVy += ay * dt;
      this.stretchX += this.stretchVx * dt;
      this.stretchY += this.stretchVy * dt;
      if (Math.abs(this.stretchX) < 0.004 && Math.abs(this.stretchVx) < 0.01) { this.stretchX = 0; this.stretchVx = 0; }
      if (Math.abs(this.stretchY) < 0.004 && Math.abs(this.stretchVy) < 0.01) { this.stretchY = 0; this.stretchVy = 0; }
      this.squishMag = clamp(Math.hypot(this.stretchX, this.stretchY), 0, 1.15);
    }

    if (this.isDragging) {
      this.vx *= 0.8;
      this.vy *= 0.8;
      this.anchorX = this.x;
      this.anchorY = this.y;
      this.acrobatState = 'hanging';
      this.glideState = 'perching';
    } else if (this.hudOpen) {
      this.vx *= 0.82;
      this.vy *= 0.82;
      this.pitch = lerp(this.pitch, 0, dt * 5);
      this.acrobatState = 'hanging';
      this.glideState = 'perching';
    } else if (this.target) {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= 22) {
        if (this.target.thenStay) {
          this.mode = 'stay';
          this.anchorX = this.target.x;
          this.anchorY = this.target.y;
        }
        this.target = null;
        arrived = true;
      } else {
        const maxSpd = (this.mode === 'fast' ? 340 : arch === 'swing' || arch === 'fly' ? 265 : 225) * spdMul;
        const desiredSpeed = clamp(dist * 2.4, 52, maxSpd);
        this.vx = lerp(this.vx, (dx / dist) * desiredSpeed, dt * 4.8);
        this.vy = lerp(this.vy, (dy / dist) * desiredSpeed, dt * 4.8);
        this.acrobatState = 'zipping';
        this.glideState = dy < -18 ? 'grappling' : 'dashing';
      }
    } else if (this.mode === 'stay') {
      this.vx = lerp(this.vx, (this.anchorX - this.x) * 2.5, dt * 4.5);
      this.vy = lerp(this.vy, (this.anchorY - this.y) * 2.5, dt * 4.5);
      this.acrobatState = 'hanging';
      this.glideState = 'perching';
    } else if (this.mode === 'follow') {
      const dx = this.cursor.x - this.x;
      const dy = this.cursor.y - this.y;
      const dist = Math.hypot(dx, dy);
      const comfort = 110;
      if (dist > comfort) {
        const spd = clamp((dist - comfort) * 2.5, 45, 295 * spdMul);
        this.vx = lerp(this.vx, (dx / dist) * spd, dt * 4.6);
        this.vy = lerp(this.vy, (dy / dist) * spd, dt * 4.6);
        this.acrobatState = 'zipping';
        this.glideState = dy < -15 ? 'grappling' : 'dashing';
      } else {
        this.vx *= Math.pow(0.08, dt);
        this.vy *= Math.pow(0.08, dt);
        if (Math.abs(dx) > 12) this.facing = dx >= 0 ? 1 : -1;
        this.acrobatState = 'hanging';
        this.glideState = 'perching';
      }
    } else {
      const baseCruise =
        this.mode === 'fast'
          ? (arch === 'swing' ? 290 : arch === 'fly' ? 305 : arch === 'glide' ? 255 : 245)
          : this.mode === 'slow'
            ? (arch === 'swing' ? 74 : arch === 'fly' ? 78 : 52)
            : (arch === 'swing' ? 145 : arch === 'fly' ? 158 : arch === 'glide' ? 132 : 104);
      const cfg =
        this.mode === 'fast'
          ? { cruise: baseCruise * spdMul, turn: 5.0, pauseChance: 0.12, pauseMax: 0.8 }
          : this.mode === 'slow'
            ? { cruise: baseCruise * spdMul, turn: 2.2, pauseChance: 0.42, pauseMax: 2.8 }
            : { cruise: baseCruise * spdMul, turn: 3.1, pauseChance: arch === 'glide' ? 0.38 : 0.28, pauseMax: 2.3 };

      if (this.wanderPauseTimer > 0) {
        this.wanderPauseTimer -= dt;
        this.vx *= Math.pow(0.16, dt);
        this.vy *= Math.pow(0.16, dt);
        this.acrobatState = 'hanging';
        this.glideState = 'perching';
        if (arch === 'stride') this.animalState = 'resting';
        else if (arch === 'scout') this.animalState = 'scanning';
        else if (arch === 'drone') this.animalState = 'hovering';
      } else {
        const dx = this.wanderTarget.x - this.x;
        const dy = this.wanderTarget.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 48) {
          this.wanderTarget = this.pickWanderPoint(this.mode === 'fast');
          const pauseProb = arch === 'stride' ? 0.35 : arch === 'scout' ? 0.42 : cfg.pauseChance;
          if (Math.random() < pauseProb) {
            this.wanderPauseTimer = (arch === 'scout' ? 1.6 : 1.0) + Math.random() * cfg.pauseMax;
          }
        } else if (arch === 'swing') {
          // 1. SWING (Vesper): Pendulum tether-swing arc + mid-air release flip + corner hang
          const cycleRate = (this.mode === 'fast' ? 0.92 : this.mode === 'slow' ? 0.44 : 0.62) * spdMul;
          this.swingCycle = (this.swingCycle + dt * cycleRate) % 1.0;
          const isFlipping = this.swingCycle > 0.72;
          this.acrobatState = isFlipping ? 'flipping' : 'swinging';

          const swingArcVy = isFlipping
            ? -Math.sin(((this.swingCycle - 0.72) / 0.28) * Math.PI) * 58
            : Math.cos((this.swingCycle / 0.72) * Math.PI) * 85;
          const baseAngle = Math.atan2(dy, dx);
          this.vx = lerp(this.vx, Math.cos(baseAngle) * cfg.cruise, dt * cfg.turn);
          this.vy = lerp(this.vy, Math.sin(baseAngle) * cfg.cruise * 0.75 + swingArcVy, dt * cfg.turn);
        } else if (arch === 'fly') {
          // 2. FLY (Vector): Jet-powered acceleration + banking turns + steady thruster hover
          const baseAngle = Math.atan2(dy, dx);
          const boost = this.mode === 'fast' ? 1.32 : this.mode === 'slow' ? 0.68 : 1.12;
          const hoverLift = Math.sin(this.time * 3.1) * 16;
          this.vx = lerp(this.vx, Math.cos(baseAngle) * cfg.cruise * boost, dt * (cfg.turn + 1.4));
          this.vy = lerp(this.vy, Math.sin(baseAngle) * cfg.cruise * boost + hoverLift, dt * (cfg.turn + 1.4));
        } else if (arch === 'glide') {
          // 3. GLIDE (Umbra): Grapnel climb -> controlled twin-wing glide -> rooftop perch
          this.glideCycle = (this.glideCycle + dt * 0.42 * spdMul) % 1.0;
          const climbing = dy < -28 || this.glideCycle < 0.24;
          const dashing = this.mode === 'fast';
          this.glideState = climbing ? 'grappling' : dashing ? 'dashing' : 'gliding';
          const baseAngle = Math.atan2(dy, dx);
          if (climbing) {
            this.vx = lerp(this.vx, Math.cos(baseAngle) * cfg.cruise * 1.25, dt * 5.2);
            this.vy = lerp(this.vy, Math.sin(baseAngle) * cfg.cruise * 1.15 - 24, dt * 5.2);
          } else {
            const glideSink = 18 + Math.sin(this.time * 2.1) * 10;
            this.vx = lerp(this.vx, Math.cos(baseAngle) * cfg.cruise * 1.06, dt * 3.4);
            this.vy = lerp(this.vy, Math.sin(baseAngle) * cfg.cruise * 0.62 + glideSink, dt * 2.8);
          }
        } else if (arch === 'float') {
          // 4. FLOAT (Orbital): Smooth spring-based zero-G orbital drift
          const orbitAng = Math.atan2(dy, dx) + Math.sin(this.time * 1.2) * 0.36;
          const glideSpd = cfg.cruise * (this.mode === 'fast' ? 1.12 : 0.78);
          this.vx = lerp(this.vx, Math.cos(orbitAng) * glideSpd, dt * 2.4);
          this.vy = lerp(this.vy, Math.sin(orbitAng) * glideSpd + Math.cos(this.time * 1.9) * 14, dt * 2.4);
        } else if (arch === 'stride') {
          // 5. STRIDE (Kronos — Heavy Task Monolith): Articulated mechanical slab stride + thruster glide burst
          this.animalCycle = (this.animalCycle + dt * 0.48 * spdMul) % 1.0;
          const isBoosting = this.animalCycle > 0.74;
          this.animalState = isBoosting ? 'boosting' : 'striding';
          const ang = Math.atan2(dy, dx);
          const spd = cfg.cruise * (isBoosting ? 1.35 : 0.88);
          const mechCadence = isBoosting ? 0 : Math.abs(Math.sin(this.time * 6.5)) * -14;
          this.vx = lerp(this.vx, Math.cos(ang) * spd, dt * 3.6);
          this.vy = lerp(this.vy, Math.sin(ang) * spd + mechCadence, dt * 3.6);
        } else if (arch === 'scout') {
          // 6. SCOUT (Optix — Deep Research Rover): Precision tracked rover roll + optical scan lock
          this.animalCycle = (this.animalCycle + dt * 0.54 * spdMul) % 1.0;
          const isScanning = this.animalCycle >= 0.58 && this.animalCycle < 0.84;
          const isSprinting = this.animalCycle >= 0.84;
          this.animalState = isSprinting ? 'sprinting' : isScanning ? 'scanning' : 'rolling';
          const ang = Math.atan2(dy, dx);
          const mul = isSprinting ? 1.48 : isScanning ? 0.35 : 0.96;
          const servoLift = isScanning ? Math.sin(this.time * 4.0) * 6 : 0;
          this.vx = lerp(this.vx, Math.cos(ang) * cfg.cruise * mul, dt * 4.6);
          this.vy = lerp(this.vy, Math.sin(ang) * cfg.cruise * mul + servoLift, dt * 4.6);
        } else if (arch === 'drone') {
          // 7. DRONE (Orbit — Autonomous Synth Pod): Magnetic zero-G hover + rapid vector dash
          this.animalCycle = (this.animalCycle + dt * 0.60 * spdMul) % 1.0;
          const isPulsing = this.animalCycle > 0.78;
          this.animalState = isPulsing ? 'pulsing' : 'hovering';
          const ang = Math.atan2(dy, dx) + Math.sin(this.time * 1.8) * 0.18;
          const mul = isPulsing ? 1.36 : 1.04;
          const magWave = Math.sin(this.time * 4.2) * 14;
          this.vx = lerp(this.vx, Math.cos(ang) * cfg.cruise * mul, dt * 4.2);
          this.vy = lerp(this.vy, Math.sin(ang) * cfg.cruise * mul + magWave, dt * 4.2);
        } else {
          // 8. SWIM (Coral): Natural sinusoidal aquatic swimming + tail-swish wave + smooth turns
          const weave = Math.sin(this.time * (this.mode === 'fast' ? 4.4 : 1.85)) * 0.28;
          const ang = Math.atan2(dy, dx) + weave;
          const spd = cfg.cruise * (0.86 + 0.22 * Math.sin(this.time * 1.2));
          this.vx = lerp(this.vx, Math.cos(ang) * spd, dt * cfg.turn);
          this.vy = lerp(this.vy, Math.sin(ang) * spd, dt * cfg.turn);
        }
      }
    }

    if (!this.isDragging) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      const padX = Math.round(this.winW / 2) + 8;
      const padY = Math.round(this.winH / 2) + 8;
      const minX = this.bounds.x + padX;
      const maxX = this.bounds.x + this.bounds.width - padX;
      const minY = this.bounds.y + padY;
      const maxY = this.bounds.y + this.bounds.height - padY;

      if (this.x < minX) { this.x = minX; this.vx = Math.abs(this.vx) * 0.7; }
      if (this.x > maxX) { this.x = maxX; this.vx = -Math.abs(this.vx) * 0.7; }
      if (this.y < minY) { this.y = minY; this.vy = Math.abs(this.vy) * 0.7; }
      if (this.y > maxY) { this.y = maxY; this.vy = -Math.abs(this.vy) * 0.7; }
    }

    this.speed = Math.hypot(this.vx, this.vy);
    if (Math.abs(this.vx) > 9) this.facing = this.vx >= 0 ? 1 : -1;

    const targetPitch =
      this.speed > 12
        ? clamp(Math.atan2(this.vy, Math.max(Math.abs(this.vx), 32)), -0.35, 0.35)
        : 0;
    this.pitch = lerp(this.pitch, targetPitch, dt * 6);

    return { arrived };
  }

  getWindowBounds() {
    return {
      x: Math.round(this.x - this.winW / 2),
      y: Math.round(this.y - this.winH / 2),
      width: this.winW,
      height: this.winH,
    };
  }

  getWindowRect() {
    return this.getWindowBounds();
  }
}

module.exports = { PetPhysics };
