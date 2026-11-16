// Voidgarden — the simulation: state machine, waves, combat, economy.
// One job: advance the game one fixed 1/60 s step at a time. Everything here
// is pure logic over plain objects — no canvas, no DOM — so the same code
// drives live play and the deterministic screenshot scenes.

import {
  WORLD_W, WORLD_H, TOTAL_WAVES, STEP, PLAYER_BASE,
  ENEMIES, BLOOMS, BLOOM_ORDER, UPGRADES, waveComp, spawnGap,
} from './config.js';
import { Rng } from './random.js';
import { makeGarden, spotFree, resolveRocks, SPAWN_POINTS, distToHeart } from './world.js';
import {
  createPlayer, createHeart, spawnEnemy, createBolt, createBloom,
  createPickup, createParticle, createFloater,
} from './entities.js';

const TAU = Math.PI * 2;

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

export class Game {
  constructor(seed, sound) {
    this.seed = seed >>> 0;
    this.rng = new Rng(this.seed);
    this.sound = sound;
    this.garden = makeGarden(this.rng);
    this.best = 0;
    try {
      this.best = Number(window.localStorage.getItem('voidgarden-best') || 0) || 0;
    } catch { this.best = 0; }
    this.reset();
  }

  reset() {
    this.mode = 'title'; // title | playing | upgrade | over | victory
    this.paused = false;
    this.time = 0;
    this.wave = 0;
    this.waveState = 'idle'; // banner | spawning | fighting | cleared
    this.banner = null;
    this.bannerTimer = 0;
    this.spawnList = [];
    this.spawnTimer = 0;
    this.score = 0;
    this.seeds = 0;
    this.kills = 0;
    this.bloomDamageMul = 1;
    this.selectedBloom = 'thorn';
    this.offer = [];
    this.player = createPlayer();
    this.heart = createHeart();
    this.enemies = [];
    this.bolts = [];
    this.blooms = [];
    this.particles = [];
    this.floaters = [];
    this.pickups = [];
    this.shakeT = 0;
    this.shakeMag = 0;
    this.hurtFlash = 0;
    this.stats = { shots: 0, hits: 0, planted: 0, seedsGot: 0, damage: 0 };
    this.cards = []; // upgrade card rects, written by the renderer
    this.buttons = []; // menu button rects, written by the renderer
    this.endStats = null;
    this._titleWisps();
  }

  // A few wisps drifting behind the title screen so it is alive, not static.
  _titleWisps() {
    this.titleWisps = [];
    for (let i = 0; i < 6; i++) {
      const a = this.rng.angle();
      this.titleWisps.push({
        x: WORLD_W / 2 + Math.cos(a) * this.rng.range(220, 520),
        y: WORLD_H / 2 + Math.sin(a) * this.rng.range(160, 320),
        phase: this.rng.range(0, TAU),
        speed: this.rng.range(12, 26),
        radius: 13,
      });
    }
  }

  start() {
    const keepBest = this.best;
    this.reset();
    this.best = keepBest;
    this.mode = 'playing';
    this.seeds = 10;
    this.startWave(1);
    this.sound.stopPad();
  }

  startWave(n) {
    this.wave = n;
    const comp = waveComp(n, this.rng);
    this.spawnList = [];
    for (const group of comp.groups) {
      for (let i = 0; i < group.count; i++) {
        this.spawnList.push({
          type: group.type,
          elite: this.rng.chance(comp.eliteChance),
        });
      }
    }
    // Shuffle the flat queue so types interleave.
    for (let i = this.spawnList.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [this.spawnList[i], this.spawnList[j]] = [this.spawnList[j], this.spawnList[i]];
    }
    this.waveState = 'banner';
    this.banner = { title: comp.headline, sub: n === TOTAL_WAVES ? 'Survive the King' : 'Defend the Heartbloom', t: 0, dur: 2.2 };
    this.bannerTimer = 2.2;
    this.spawnTimer = 0.4;
    if (n === TOTAL_WAVES) this.sound.bossRoar();
    else this.sound.waveHorn();
  }

  // ---- main step ---------------------------------------------------------

  update(input, view) {
    // Global keys work in every mode.
    if (input.wasPressed('KeyM')) {
      this.sound.setMuted(!this.sound.muted);
    }
    if (this.mode === 'title') {
      this._updateTitle(input);
      this._updateAmbient();
      input.consume();
      return;
    }
    if (this.mode === 'over' || this.mode === 'victory') {
      this._updateEnd(input);
      this._updateAmbient();
      input.consume();
      return;
    }
    if (this.mode === 'upgrade') {
      this._updateUpgrade(input);
      this._updateAmbient();
      input.consume();
      return;
    }
    // Playing.
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
      this.paused = !this.paused;
      this.sound.click();
    }
    if (this.paused) {
      input.consume();
      return;
    }
    this.time += STEP;
    if (this.bannerTimer > 0) this.bannerTimer -= STEP;
    if (this.hurtFlash > 0) this.hurtFlash -= STEP;
    if (this.heart.pulse > 0) this.heart.pulse = Math.max(0, this.heart.pulse - STEP * 1.5);
    if (this.shakeT > 0) this.shakeT -= STEP;

    this._updatePlayer(input, view);
    this._updateSpawning();
    this._updateEnemies();
    this._updateBolts();
    this._updateBlooms();
    this._updatePickups();
    this._updateParticles();
    this._updateFloaters();
    this._checkWaveEnd();
    input.consume();
  }

  _updateAmbient() {
    this.time += STEP;
    if (this.heart.pulse > 0) this.heart.pulse = Math.max(0, this.heart.pulse - STEP * 1.5);
    this._updateParticles();
    this._updateFloaters();
    for (const f of this.garden.fireflies) {
      f.x += f.vx * STEP;
      f.y += f.vy * STEP;
      f.phase += STEP;
      if (f.x < 0 || f.x > WORLD_W) f.vx *= -1;
      if (f.y < 0 || f.y > WORLD_H) f.vy *= -1;
    }
  }

  _updateTitle(input) {
    for (const w of this.titleWisps) {
      w.phase += STEP * 0.6;
      w.x += Math.cos(w.phase) * w.speed * STEP;
      w.y += Math.sin(w.phase * 1.3) * w.speed * STEP;
    }
    const startIt = input.wasPressed('Enter') || input.wasPressed('Space') || this._clickedButton(input, 'start');
    if (startIt) {
      this.sound.unlock();
      this.sound.click();
      this.start();
    }
  }

  _updateEnd(input) {
    const again = input.wasPressed('KeyR') || input.wasPressed('Enter') || input.wasPressed('Space')
      || this._clickedButton(input, 'again');
    if (again) {
      this.sound.click();
      this.start();
    }
  }

  _updateUpgrade(input) {
    // Keyboard 1/2/3 picks a card; a click on a card does the same.
    for (let i = 0; i < this.offer.length; i++) {
      if (input.wasPressed('Digit' + (i + 1)) || input.wasPressed('Numpad' + (i + 1))) {
        this._pickUpgrade(i);
        return;
      }
    }
    if (input.wasClicked()) {
      const mx = input.mouseX;
      const my = input.mouseY;
      for (let i = 0; i < this.cards.length; i++) {
        const c = this.cards[i];
        if (mx >= c.x && mx <= c.x + c.w && my >= c.y && my <= c.y + c.h) {
          this._pickUpgrade(i);
          return;
        }
      }
    }
  }

  _clickedButton(input, id) {
    if (!input.wasClicked()) return false;
    const mx = input.mouseX;
    const my = input.mouseY;
    return this.buttons.some((b) => b.id === id && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h);
  }

  _pickUpgrade(i) {
    const up = this.offer[i];
    if (!up) return;
    up.apply(this);
    this.sound.upgrade();
    this.offer = [];
    this.mode = 'playing';
    this.startWave(this.wave + 1);
  }

  // ---- playing -----------------------------------------------------------

  _updatePlayer(input, view) {
    const p = this.player;
    if (p.invuln > 0) p.invuln -= STEP;
    if (p.fireCd > 0) p.fireCd -= STEP;
    if (p.dashTimer > 0) p.dashTimer -= STEP;

    // Aim follows the pointer.
    const wx = (input.mouseX - view.ox) / view.scale;
    const wy = (input.mouseY - view.oy) / view.scale;
    p.aim = Math.atan2(wy - p.y, wx - p.x);

    // Dash on Shift: a short burst with brief invulnerability.
    if (input.wasPressed('ShiftLeft') || input.wasPressed('ShiftRight')) {
      if (p.dashCooldown > 0 && p.dashTimer <= 0) {
        p.dashTimer = p.dashCooldown;
        p.dashLeft = PLAYER_BASE.dashTime;
        p.invuln = Math.max(p.invuln, PLAYER_BASE.dashTime + 0.05);
        this._burst(p.x, p.y, '#ffe9a8', 10, 160, 0.35, 3);
      }
    }

    const axis = input.moveAxis();
    let speed = p.speed;
    if (p.dashLeft > 0) {
      p.dashLeft -= STEP;
      speed = PLAYER_BASE.dashSpeed;
    }
    p.vx = axis.x * speed;
    p.vy = axis.y * speed;
    p.x += p.vx * STEP;
    p.y += p.vy * STEP;
    resolveRocks(this.garden, p);
    if (axis.x !== 0 || axis.y !== 0) p.walkPhase += STEP * 10;

    // Bloom selection.
    for (let i = 0; i < BLOOM_ORDER.length; i++) {
      if (input.wasPressed('Digit' + (i + 1))) {
        this.selectedBloom = BLOOM_ORDER[i];
        this.sound.click();
      }
    }
    if (input.wasPressed('KeyE')) {
      const idx = BLOOM_ORDER.indexOf(this.selectedBloom);
      this.selectedBloom = BLOOM_ORDER[(idx + 1) % BLOOM_ORDER.length];
      this.sound.click();
    }
    if (input.wasRightClicked()) this.selectedBloom = null;

    // Plant on click (but not on the HUD strips).
    if (input.wasClicked() && this.selectedBloom && wy > 70 && wy < WORLD_H - 8) {
      this._tryPlant(wx, wy);
    }

    // Fire while held.
    if (input.firing() && p.fireCd <= 0) {
      this._fireBolts();
    }
  }

  _fireBolts() {
    const p = this.player;
    p.fireCd = 1 / p.fireRate;
    this.stats.shots += p.projectiles;
    const spread = p.projectiles === 1 ? [0] : p.projectiles === 2 ? [-0.09, 0.09] : [-0.16, 0, 0.16];
    for (const off of spread) {
      const a = p.aim + off;
      this.bolts.push(createBolt(
        p.x + Math.cos(a) * (p.radius + 6),
        p.y + Math.sin(a) * (p.radius + 6),
        a, p.bulletSpeed, p.damage, p.pierce, true, '#ffe9a8',
      ));
    }
    this.sound.shoot();
  }

  _tryPlant(wx, wy) {
    const type = this.selectedBloom;
    const def = BLOOMS[type];
    if (this.seeds < def.cost) {
      this.floaters.push(createFloater(wx, wy - 20, 'Need ' + def.cost + ' seeds', '#ff5d73'));
      this.sound.click();
      return;
    }
    if (!spotFree(this.garden, wx, wy, def.radius + 4)) return;
    if (distToHeart(wx, wy) < 95) return;
    if (this.blooms.some((b) => (b.x - wx) ** 2 + (b.y - wy) ** 2 < 56 * 56)) return;
    this.seeds -= def.cost;
    this.blooms.push(createBloom(type, wx, wy));
    this.stats.planted++;
    this.sound.plant();
    this._burst(wx, wy, def.petal, 14, 120, 0.5, 3);
  }

  _updateSpawning() {
    if (this.waveState === 'banner') {
      if (this.bannerTimer <= 0) this.waveState = 'spawning';
      return;
    }
    if (this.waveState !== 'spawning') return;
    this.spawnTimer -= STEP;
    if (this.spawnTimer <= 0 && this.spawnList.length > 0 && this.enemies.length < 46) {
      const next = this.spawnList.shift();
      const pt = this.rng.pick(SPAWN_POINTS);
      const e = spawnEnemy(next.type, pt.x + this.rng.range(-24, 24), pt.y + this.rng.range(-24, 24), this.wave, next.elite, this.rng);
      e.spawnBurst = 0.3;
      this.enemies.push(e);
      this._burst(e.x, e.y, e.color, 8, 90, 0.4, 3);
      this.spawnTimer = spawnGap(this.wave) * this.rng.range(0.8, 1.2);
    }
    if (this.spawnList.length === 0) this.waveState = 'fighting';
  }

  _updateEnemies() {
    const p = this.player;
    const heart = this.heart;
    for (const e of this.enemies) {
      if (e.flash > 0) e.flash -= STEP;
      if (e.attackCd > 0) e.attackCd -= STEP;
      if (e.shootCd > 0) e.shootCd -= STEP;
      if (e.spawnBurst > 0) e.spawnBurst -= STEP;
      const slowed = this.time < e.slowUntil;
      const speed = e.speed * (slowed ? e.slowFactor : 1);
      const dxH = heart.x - e.x;
      const dyH = heart.y - e.y;
      const dH = Math.hypot(dxH, dyH) || 1;
      const dxP = p.x - e.x;
      const dyP = p.y - e.y;
      const dP = Math.hypot(dxP, dyP) || 1;

      if (e.behaviour === 'ranged') {
        if (dH > e.range) {
          e.x += (dxH / dH) * speed * STEP;
          e.y += (dyH / dH) * speed * STEP;
        } else if (e.shootCd <= 0) {
          const target = dP < 430 ? p : heart;
          const a = angleTo(e.x, e.y, target.x, target.y);
          this.bolts.push(createBolt(e.x, e.y, a, e.globSpeed, e.globDamage, 0, false, '#c084fc'));
          e.shootCd = 2.3;
          this.sound.bloomShoot();
        }
      } else if (e.behaviour === 'zigzag') {
        e.zigPhase += STEP * 5;
        const px = -dyH / dH;
        const py = dxH / dH;
        const sway = Math.sin(e.zigPhase) * 0.7;
        e.x += ((dxH / dH) + px * sway) * speed * STEP;
        e.y += ((dyH / dH) + py * sway) * speed * STEP;
      } else {
        // chase / split / boss: walk at the Heartbloom.
        e.x += (dxH / dH) * speed * STEP;
        e.y += (dyH / dH) * speed * STEP;
        if (e.behaviour === 'boss') this._bossTricks(e);
      }

      // Swat the gardener if close.
      if (dP < e.radius + p.radius + 4 && e.attackCd <= 0) {
        e.attackCd = 0.85;
        this._damagePlayer(e.damage);
        const kb = 160;
        p.x += (dxP / dP) * kb * STEP * 6;
        p.y += (dyP / dP) * kb * STEP * 6;
        resolveRocks(this.garden, p);
      }
      // Gnaw the Heartbloom if touching it.
      if (dH < e.radius + heart.radius + 2 && e.attackCd <= 0) {
        e.attackCd = 1.0;
        this._damageHeart(e.damage);
      }
      resolveRocks(this.garden, e);
    }

    // Gentle separation so foes do not stack on one pixel.
    for (let i = 0; i < this.enemies.length; i++) {
      for (let j = i + 1; j < this.enemies.length; j++) {
        const a = this.enemies[i];
        const b = this.enemies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = a.radius + b.radius - 2;
        if (d > 0 && d < min) {
          const push = (min - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
  }

  _bossTricks(e) {
    // Radial burst every 6 s; summon wisps every 9 s (capped).
    if (e.shootCd <= 0) {
      e.shootCd = 6;
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU + e.wobble;
        this.bolts.push(createBolt(e.x, e.y, a, 190, 12, 0, false, '#c084fc'));
      }
      e.wobble += 0.35;
      this.sound.bossRoar();
      this._shake(0.35, 7);
    }
    if (!e.summonCd) e.summonCd = 9;
    e.summonCd -= STEP;
    if (e.summonCd <= 0 && this.enemies.length < 40) {
      e.summonCd = 9;
      for (let k = 0; k < 3; k++) {
        const a = this.rng.angle();
        this.enemies.push(spawnEnemy('wisp', e.x + Math.cos(a) * 60, e.y + Math.sin(a) * 60, this.wave, false, this.rng));
      }
      this._burst(e.x, e.y, '#8f5cff', 16, 140, 0.5, 3);
    }
  }

  _updateBolts() {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.x += b.vx * STEP;
      b.y += b.vy * STEP;
      b.life -= STEP;
      let dead = b.life <= 0 || b.x < 0 || b.x > WORLD_W || b.y < 0 || b.y > WORLD_H;
      if (!dead) {
        for (const rock of this.garden.rocks) {
          const dx = b.x - rock.x;
          const dy = b.y - rock.y;
          if (dx * dx + dy * dy < (rock.r + b.radius) ** 2) { dead = true; break; }
        }
      }
      if (!dead && b.friendly) {
        for (const e of this.enemies) {
          if (b.hitIds.has(e.id)) continue;
          const dx = e.x - b.x;
          const dy = e.y - b.y;
          if (dx * dx + dy * dy < (e.radius + b.radius) ** 2) {
            b.hitIds.add(e.id);
            this.stats.hits++;
            this._damageEnemy(e, b.damage, true);
            if (b.pierce > 0) {
              b.pierce--;
            } else {
              dead = true;
            }
            break;
          }
        }
      } else if (!dead && !b.friendly) {
        const p = this.player;
        const dx = p.x - b.x;
        const dy = p.y - b.y;
        if (dx * dx + dy * dy < (p.radius + b.radius) ** 2) {
          this._damagePlayer(b.damage);
          dead = true;
        } else {
          const h = this.heart;
          const hx = h.x - b.x;
          const hy = h.y - b.y;
          if (hx * hx + hy * hy < (h.radius + b.radius) ** 2) {
            this._damageHeart(b.damage);
            dead = true;
          }
        }
      }
      if (dead) this.bolts.splice(i, 1);
    }
  }

  _updateBlooms() {
    for (const b of this.blooms) {
      b.age += STEP;
      if (b.grown < 1) b.grown = Math.min(1, b.grown + STEP * 2.5);
      if (b.cd > 0) b.cd -= STEP;
      if (b.pulse > 0) b.pulse -= STEP;
      if (b.type === 'thorn') {
        if (b.cd <= 0) {
          let target = null;
          let bestD = b.range * b.range;
          for (const e of this.enemies) {
            const d2 = (e.x - b.x) ** 2 + (e.y - b.y) ** 2;
            if (d2 < bestD) { bestD = d2; target = e; }
          }
          if (target) {
            const a = angleTo(b.x, b.y, target.x, target.y);
            this.bolts.push(createBolt(b.x, b.y, a, BLOOMS.thorn.bulletSpeed, b.damage * this.bloomDamageMul, 0, true, '#b8ff7a'));
            b.cd = 1 / b.rate;
            this.sound.bloomShoot();
          }
        }
      } else if (b.type === 'frost') {
        for (const e of this.enemies) {
          const d2 = (e.x - b.x) ** 2 + (e.y - b.y) ** 2;
          if (d2 < b.range * b.range) {
            e.slowUntil = this.time + 0.6;
            e.slowFactor = 1 - BLOOMS.frost.slow;
            if (this.rng.chance(0.02)) this._damageEnemy(e, BLOOMS.frost.dps * STEP * 30, false);
          }
        }
      } else if (b.type === 'sun') {
        if (b.cd <= 0) {
          b.cd = b.rate;
          b.pulse = 0.35;
          this._burst(b.x, b.y, '#ffd76a', 10, 130, 0.4, 3);
          for (const e of [...this.enemies]) {
            const d2 = (e.x - b.x) ** 2 + (e.y - b.y) ** 2;
            if (d2 < (b.range + e.radius) ** 2) {
              this._damageEnemy(e, b.damage * this.bloomDamageMul, false);
            }
          }
        }
      }
    }
  }

  _updatePickups() {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.life -= STEP;
      pk.bob += STEP * 4;
      const dx = p.x - pk.x;
      const dy = p.y - pk.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < p.pickupRadius) {
        const pull = 620 * (1 - d / p.pickupRadius);
        pk.vx += (dx / d) * pull * STEP * 4;
        pk.vy += (dy / d) * pull * STEP * 4;
      }
      pk.vx *= 0.92;
      pk.vy *= 0.92;
      pk.x += pk.vx * STEP;
      pk.y += pk.vy * STEP;
      if (d < p.radius + pk.radius + 6) {
        if (pk.pick === 'seed') {
          this.seeds += pk.value;
          this.stats.seedsGot += pk.value;
          this.floaters.push(createFloater(pk.x, pk.y - 12, '+' + pk.value, '#b8ff7a'));
          this.sound.pickup();
        } else if (pk.pick === 'heart') {
          p.hp = Math.min(p.maxHp, p.hp + 25);
          this.floaters.push(createFloater(pk.x, pk.y - 12, '+25', '#ff9ecf'));
          this.sound.pickup();
        } else {
          this.score += 50;
          this.floaters.push(createFloater(pk.x, pk.y - 12, '+50', '#ffd76a'));
          this.sound.pickup();
        }
        this.pickups.splice(i, 1);
        continue;
      }
      if (pk.life <= 0) this.pickups.splice(i, 1);
    }
  }

  _updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= STEP;
      pt.x += pt.vx * STEP;
      pt.y += pt.vy * STEP;
      pt.vx *= pt.drag;
      pt.vy *= pt.drag;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }
  }

  _updateFloaters() {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= STEP;
      f.y -= 34 * STEP;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }
    if (this.floaters.length > 40) this.floaters.splice(0, this.floaters.length - 40);
  }

  _checkWaveEnd() {
    if (this.waveState === 'fighting' && this.spawnList.length === 0 && this.enemies.length === 0) {
      this.waveState = 'cleared';
      const bonus = this.wave * 50;
      this.score += bonus;
      this.seeds += 10 + this.wave;
      if (this.wave >= TOTAL_WAVES) {
        this._endRun(true);
        return;
      }
      this.banner = { title: `Wave ${this.wave} cleared`, sub: `+${bonus} score · +${10 + this.wave} seeds`, t: 0, dur: 1.6 };
      this.bannerTimer = 1.6;
      this._offerUpgrades();
    }
  }

  _offerUpgrades() {
    const pool = [...UPGRADES];
    this.offer = [];
    for (let i = 0; i < 3 && pool.length > 0; i++) {
      const idx = Math.floor(this.rng.next() * pool.length);
      this.offer.push(pool.splice(idx, 1)[0]);
    }
    // The banner must not show through the upgrade overlay.
    this.banner = null;
    this.bannerTimer = 0;
    this.mode = 'upgrade';
  }

  // ---- damage ------------------------------------------------------------

  _damageEnemy(e, dmg, showNumber) {
    e.hp -= dmg;
    e.flash = 0.09;
    this.stats.damage += dmg;
    if (showNumber) {
      this.floaters.push(createFloater(e.x, e.y - e.radius - 6, String(Math.round(dmg)), '#fff1b8'));
    }
    this.sound.hit();
    if (e.hp <= 0) this._killEnemy(e);
  }

  _killEnemy(e) {
    const idx = this.enemies.indexOf(e);
    if (idx === -1) return;
    this.enemies.splice(idx, 1);
    this.kills++;
    this.score += e.score;
    this._burst(e.x, e.y, e.color, e.type === 'brute' || e.type === 'king' ? 26 : 12, 190, 0.55, 4);
    this.sound.die();
    if (e.type === 'brute' || e.type === 'king') this._shake(0.4, 9);
    // Seeds spill out in small pickups.
    let left = e.seeds;
    while (left > 0) {
      const v = Math.min(left, 3);
      this.pickups.push(createPickup(e.x, e.y, 'seed', v, this.rng));
      left -= v;
    }
    if (this.rng.chance(0.05)) this.pickups.push(createPickup(e.x, e.y, 'heart', 0, this.rng));
    if (this.rng.chance(0.04)) this.pickups.push(createPickup(e.x, e.y, 'ember', 0, this.rng));
    if (e.type === 'splitter') {
      for (let k = 0; k < 2; k++) {
        const a = this.rng.angle();
        const w = spawnEnemy('wisp', e.x + Math.cos(a) * 24, e.y + Math.sin(a) * 24, this.wave, false, this.rng);
        this.enemies.push(w);
      }
    }
  }

  _damagePlayer(dmg) {
    const p = this.player;
    if (p.invuln > 0 || p.dashLeft > 0) return;
    const real = Math.max(1, Math.round(dmg * (1 - p.armor)));
    p.hp -= real;
    p.invuln = 0.55;
    this.hurtFlash = 0.35;
    this._shake(0.3, 6);
    this.sound.hurt();
    this._burst(p.x, p.y, '#ff5d73', 10, 150, 0.4, 3);
    if (p.hp <= 0) {
      p.hp = 0;
      this._endRun(false);
    }
  }

  _damageHeart(dmg) {
    const h = this.heart;
    h.hp -= dmg;
    h.pulse = 1;
    this._shake(0.25, 5);
    this.sound.heartHit();
    this._burst(h.x, h.y, '#ff9ecf', 8, 130, 0.4, 3);
    if (h.hp <= 0) {
      h.hp = 0;
      this._endRun(false);
    }
  }

  _endRun(won) {
    this.mode = won ? 'victory' : 'over';
    this.endStats = {
      won,
      score: this.score,
      wave: this.wave,
      kills: this.kills,
      timeSec: Math.round(this.time),
      accuracy: this.stats.shots > 0 ? Math.round((this.stats.hits / this.stats.shots) * 100) : 0,
      planted: this.stats.planted,
    };
    if (this.score > this.best) {
      this.best = this.score;
      try {
        window.localStorage.setItem('voidgarden-best', String(this.best));
      } catch { /* storage unavailable */ }
    }
    if (won) this.sound.win();
    else this.sound.over();
  }

  // ---- helpers -----------------------------------------------------------

  _burst(x, y, color, count, speed, life, size) {
    const parts = createParticle(x, y, color, count, speed, life, size, this.rng);
    this.particles.push(...parts);
    if (this.particles.length > 320) this.particles.splice(0, this.particles.length - 320);
  }

  _shake(t, mag) {
    this.shakeT = Math.max(this.shakeT, t);
    this.shakeMag = Math.max(this.shakeMag, mag);
  }

  // Screenshot scenes use this to jump straight to the upgrade choice.
  clearWave() {
    this.waveState = 'fighting';
    this.spawnList = [];
    this.enemies = [];
    this._checkWaveEnd();
  }
}
