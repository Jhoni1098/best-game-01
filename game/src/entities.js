// Voidgarden — entity factories.
// One job: build the plain objects the simulation moves around (player,
// foes, bolts, blooms, pickups, particles, floating text). No updates here,
// no drawing here — just the shapes and their starting numbers.

import { PLAYER_BASE, HEART_BASE, ENEMIES, BLOOMS, scaleEnemy } from './config.js';

let nextId = 1;
export function freshId() {
  return nextId++;
}

export function createPlayer() {
  return {
    id: freshId(),
    kind: 'player',
    x: HEART_BASE.x,
    y: HEART_BASE.y + 150,
    vx: 0,
    vy: 0,
    radius: PLAYER_BASE.radius,
    hp: PLAYER_BASE.hp,
    maxHp: PLAYER_BASE.hp,
    speed: PLAYER_BASE.speed,
    fireRate: PLAYER_BASE.fireRate,
    damage: PLAYER_BASE.damage,
    bulletSpeed: PLAYER_BASE.bulletSpeed,
    pickupRadius: PLAYER_BASE.pickupRadius,
    armor: PLAYER_BASE.armor,
    pierce: PLAYER_BASE.pierce,
    projectiles: PLAYER_BASE.projectiles,
    dashCooldown: PLAYER_BASE.dashCooldown,
    dashTimer: 0,
    dashLeft: 0,
    aim: -Math.PI / 2,
    fireCd: 0,
    invuln: 0,
    walkPhase: 0,
  };
}

export function createHeart() {
  return {
    x: HEART_BASE.x,
    y: HEART_BASE.y,
    radius: HEART_BASE.radius,
    hp: HEART_BASE.maxHp,
    maxHp: HEART_BASE.maxHp,
    pulse: 0,
  };
}

export function spawnEnemy(type, x, y, wave, elite, rng) {
  const def = scaleEnemy(type, wave);
  const hp = elite ? Math.round(def.hp * 2.6) : def.hp;
  return {
    id: freshId(),
    kind: 'enemy',
    type,
    name: def.name,
    x, y,
    vx: 0, vy: 0,
    radius: def.radius * (elite ? 1.25 : 1),
    hp, maxHp: hp,
    speed: def.speed * (elite ? 0.92 : 1),
    damage: def.damage,
    score: elite ? def.score * 3 : def.score,
    seeds: elite ? def.seeds * 3 : def.seeds,
    behaviour: def.behaviour,
    color: def.color,
    eye: def.eye,
    range: def.range || 0,
    globSpeed: def.globSpeed || 0,
    globDamage: def.globDamage || 0,
    elite,
    attackCd: 0,
    shootCd: rng.range(0.5, 1.5),
    zigPhase: rng.range(0, Math.PI * 2),
    flash: 0,
    slowUntil: 0,
    slowFactor: 1,
    spawnBurst: 0,
    wobble: rng.range(0, Math.PI * 2),
  };
}

export function createBolt(x, y, angle, speed, damage, pierce, friendly, color) {
  return {
    id: freshId(),
    kind: 'bolt',
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: friendly ? 5 : 7,
    damage,
    pierce,
    friendly,
    color: color || (friendly ? '#ffe9a8' : '#c084fc'),
    life: 1.6,
    hitIds: new Set(),
  };
}

export function createBloom(type, x, y) {
  const def = BLOOMS[type];
  return {
    id: freshId(),
    kind: 'bloom',
    type,
    name: def.name,
    x, y,
    radius: def.radius,
    range: def.range,
    damage: def.damage,
    rate: def.rate || 0,
    color: def.color,
    petal: def.petal,
    cd: 0,
    pulse: 0,
    age: 0,
    grown: 0, // 0..1 planting animation
  };
}

export function createPickup(x, y, kind, value, rng) {
  return {
    id: freshId(),
    kind: 'pickup',
    pick: kind, // 'seed' | 'heart' | 'ember'
    x: x + rng.range(-8, 8),
    y: y + rng.range(-8, 8),
    vx: rng.range(-40, 40),
    vy: rng.range(-40, 40),
    radius: kind === 'seed' ? 7 : 10,
    value,
    life: 12,
    bob: rng.range(0, Math.PI * 2),
  };
}

export function createParticle(x, y, color, count, speed, life, size, rng) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const a = rng.float() * Math.PI * 2;
    const sp = speed * (0.3 + rng.float() * 0.7);
    parts.push({
      id: freshId(),
      kind: 'particle',
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      color,
      life: life * (0.6 + rng.float() * 0.4),
      maxLife: life,
      size: size * (0.6 + rng.float() * 0.8),
      drag: 0.92,
    });
  }
  return parts;
}

export function createFloater(x, y, text, color) {
  return {
    id: freshId(),
    kind: 'floater',
    x, y,
    text,
    color,
    life: 0.9,
    maxLife: 0.9,
  };
}
