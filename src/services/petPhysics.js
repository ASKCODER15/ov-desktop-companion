const { normalizeCharacterId } = require('./security');

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

class PetPhysics {
  constructor(workArea) {
    this.bounds = workArea || { x: 0, y: 0, width: 1536, height: 864 };
    this.winW = 204;
    this.winH = 196;

    this.character = 'vesper'; // 'vesper' | 'vector' | 'core' | 'coral'
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

    // Acrobat tether-swinging + elastic squish-stretch spring state
    this.swingCycle = 0; // 0..1 continuous cycle
    this.acrobatState = 'swinging'; // 'swinging' | 'flipping' | 'hanging' | 'zipping'
    this.stretchX = 0; // elastic pull offset (-1..1)
    this.stretchY = 0;
    this.stretchVx = 0;
    this.stretchVy = 0;
    this.squishMag = 0; // 0..1 squash-and-stretch intensity

    this.cursor = { x: this.x - 120, y: this.y };
    this.isDragging = false;
    this.hudOpen = false;
    this.time = 0;
  }

  setCharacter(char) {
    const norm = normalizeCharacterId(char);
    if (norm) {
      this.character = norm;
      this.swingCycle = 0;
    }
  }

  applyDragPull(dx, dy) {
    // Elastic rubber-band stretch when dragging pet across screen!
    this.stretchX = clamp(dx / 95, -1.2, 1.2);
    this.stretchY = clamp(dy / 95, -1.2, 1.2);
    this.squishMag = clamp(Math.hypot(this.stretchX, this.stretchY), 0, 1.15);
  }

  releaseDragSpring() {
    // Give juicy elastic snap-back recoil impulse when released!
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
    const isVesper = this.character === 'vesper';
    const isVector = this.character === 'vector';
    const isCore = this.character === 'core';

    // Damped harmonic spring for juicy elastic squish-retract animation!
    if (!this.isDragging) {
      const k = 92; // spring stiffness
      const damp = 8.2; // rubbery underdamped bounce
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
    } else if (this.hudOpen) {
      this.vx *= 0.82;
      this.vy *= 0.82;
      this.pitch = lerp(this.pitch, 0, dt * 5);
      this.acrobatState = 'hanging';
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
        const maxSpd = this.mode === 'fast' ? 340 : isVesper ? 260 : 220;
        const desiredSpeed = clamp(dist * 2.4, 52, maxSpd);
        this.vx = lerp(this.vx, (dx / dist) * desiredSpeed, dt * 4.8);
        this.vy = lerp(this.vy, (dy / dist) * desiredSpeed, dt * 4.8);
        this.acrobatState = 'zipping';
      }
    } else if (this.mode === 'stay') {
      this.vx = lerp(this.vx, (this.anchorX - this.x) * 2.5, dt * 4.5);
      this.vy = lerp(this.vy, (this.anchorY - this.y) * 2.5, dt * 4.5);
      this.acrobatState = 'hanging';
    } else if (this.mode === 'follow') {
      const dx = this.cursor.x - this.x;
      const dy = this.cursor.y - this.y;
      const dist = Math.hypot(dx, dy);
      const comfort = 110;
      if (dist > comfort) {
        const spd = clamp((dist - comfort) * 2.5, 45, 295);
        this.vx = lerp(this.vx, (dx / dist) * spd, dt * 4.6);
        this.vy = lerp(this.vy, (dy / dist) * spd, dt * 4.6);
        this.acrobatState = 'zipping';
      } else {
        this.vx *= Math.pow(0.08, dt);
        this.vy *= Math.pow(0.08, dt);
        if (Math.abs(dx) > 12) this.facing = dx >= 0 ? 1 : -1;
        this.acrobatState = 'hanging';
      }
    } else {
      const cfg =
        this.mode === 'fast'
          ? { cruise: isVesper ? 290 : 265, turn: 5.0, pauseChance: 0.12, pauseMax: 0.8 }
          : this.mode === 'slow'
            ? { cruise: isVesper ? 72 : 48, turn: 2.2, pauseChance: 0.42, pauseMax: 2.8 }
            : { cruise: isVesper ? 142 : 105, turn: 3.1, pauseChance: 0.3, pauseMax: 2.2 };

      if (this.wanderPauseTimer > 0) {
        this.wanderPauseTimer -= dt;
        this.vx *= Math.pow(0.16, dt);
        this.vy *= Math.pow(0.16, dt);
        this.acrobatState = 'hanging';
      } else {
        const dx = this.wanderTarget.x - this.x;
        const dy = this.wanderTarget.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 48) {
          this.wanderTarget = this.pickWanderPoint(this.mode === 'fast');
          if (Math.random() < cfg.pauseChance) {
            this.wanderPauseTimer = 1.0 + Math.random() * cfg.pauseMax;
          }
        } else {
          if (isVesper) {
            // Vesper pendulum tether-swing arc + mid-air release flip!
            const cycleRate = this.mode === 'fast' ? 0.92 : this.mode === 'slow' ? 0.44 : 0.62;
            this.swingCycle = (this.swingCycle + dt * cycleRate) % 1.0;
            const isFlipping = this.swingCycle > 0.72;
            this.acrobatState = isFlipping ? 'flipping' : 'swinging';

            // Swooping parabolic pendulum arc vertically while advancing toward target
            const swingArcVy = isFlipping
              ? -Math.sin(((this.swingCycle - 0.72) / 0.28) * Math.PI) * 58
              : Math.cos((this.swingCycle / 0.72) * Math.PI) * 85;
            const baseAngle = Math.atan2(dy, dx);
            const targetVx = Math.cos(baseAngle) * cfg.cruise;
            const targetVy = Math.sin(baseAngle) * cfg.cruise * 0.75 + swingArcVy;
            this.vx = lerp(this.vx, targetVx, dt * cfg.turn);
            this.vy = lerp(this.vy, targetVy, dt * cfg.turn);
          } else if (isVector) {
            // Precision supersonic jet-hover flight with smooth aerodynamic turns!
            const baseAngle = Math.atan2(dy, dx);
            const boost = this.mode === 'fast' ? 1.38 : this.mode === 'slow' ? 0.65 : 1.12;
            const hoverLift = Math.sin(this.time * 3.1) * 18;
            this.vx = lerp(this.vx, Math.cos(baseAngle) * cfg.cruise * boost, dt * (cfg.turn + 1.2));
            this.vy = lerp(this.vy, Math.sin(baseAngle) * cfg.cruise * boost + hoverLift, dt * (cfg.turn + 1.2));
          } else if (isCore) {
            // Effortless zero-gravity holographic AI sphere orbit!
            const orbitAng = Math.atan2(dy, dx) + Math.sin(this.time * 1.15) * 0.35;
            const glideSpd = cfg.cruise * (this.mode === 'fast' ? 1.15 : 0.78);
            this.vx = lerp(this.vx, Math.cos(orbitAng) * glideSpd, dt * 2.4);
            this.vy = lerp(this.vy, Math.sin(orbitAng) * glideSpd + Math.cos(this.time * 1.8) * 14, dt * 2.4);
          } else {
            const weave = Math.sin(this.time * (this.mode === 'fast' ? 4.4 : 1.7)) * 0.24;
            const ang = Math.atan2(dy, dx) + weave;
            const spd = cfg.cruise * (0.86 + 0.22 * Math.sin(this.time * 1.1));
            this.vx = lerp(this.vx, Math.cos(ang) * spd, dt * cfg.turn);
            this.vy = lerp(this.vy, Math.sin(ang) * spd, dt * cfg.turn);
          }
        }
      }
    }

    if (!this.isDragging && !this.hudOpen) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      const padX = Math.round(this.winW / 2) + 8;
      const padY = Math.round(this.winH / 2) + 8;
      const minX = this.bounds.x + padX;
      const maxX = this.bounds.x + this.bounds.width - padX;
      const minY = this.bounds.y + padY;
      const maxY = this.bounds.y + this.bounds.height - padY;

      if (this.x < minX) {
        this.x = minX;
        this.vx = Math.abs(this.vx) * 0.65;
        if (!this.target) this.wanderTarget = this.pickWanderPoint();
      } else if (this.x > maxX) {
        this.x = maxX;
        this.vx = -Math.abs(this.vx) * 0.65;
        if (!this.target) this.wanderTarget = this.pickWanderPoint();
      }
      if (this.y < minY) {
        this.y = minY;
        this.vy = Math.abs(this.vy) * 0.65;
      } else if (this.y > maxY) {
        this.y = maxY;
        this.vy = -Math.abs(this.vy) * 0.65;
      }
    }

    this.speed = Math.hypot(this.vx, this.vy);
    if (Math.abs(this.vx) > 10 && !this.isDragging && !this.hudOpen) {
      this.facing = this.vx >= 0 ? 1 : -1;
    }

    const targetPitch =
      this.speed > 12 && !this.hudOpen
        ? clamp(Math.atan2(this.vy, Math.max(Math.abs(this.vx), 48)), -0.36, 0.36)
        : Math.sin(this.time * 1.8) * 0.04;
    this.pitch = lerp(this.pitch, targetPitch, Math.min(1, dt * 5.5));

    return { arrived };
  }

  getWindowRect() {
    return {
      x: Math.round(this.x - this.winW / 2),
      y: Math.round(this.y - this.winH / 2),
      width: this.winW,
      height: this.winH,
    };
  }
}

module.exports = { PetPhysics };
