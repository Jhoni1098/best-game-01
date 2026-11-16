// Voidgarden — the garden itself: rocks, flowers, spawn points.
// One job: build one deterministic garden from a seed and answer the small
// geometry questions the simulation asks (is this spot free? where do foes
// enter? what is in the way?).

import { WORLD_W, WORLD_H, HEART_BASE } from './config.js';

// Eight doorways around the arena rim where the blight walks in.
export const SPAWN_POINTS = [
  { x: 60, y: 60 }, { x: WORLD_W / 2, y: 40 }, { x: WORLD_W - 60, y: 60 },
  { x: 40, y: WORLD_H / 2 }, { x: WORLD_W - 40, y: WORLD_H / 2 },
  { x: 60, y: WORLD_H - 60 }, { x: WORLD_W / 2, y: WORLD_H - 40 }, { x: WORLD_W - 60, y: WORLD_H - 60 },
];

export function makeGarden(rng) {
  const rocks = [];
  const flowers = [];
  const fireflies = [];

  // Rocks: solid circles that block movement. Kept clear of the Heartbloom
  // and of the spawn rim so nothing spawns stuck inside one.
  let tries = 0;
  while (rocks.length < 7 && tries < 200) {
    tries++;
    const x = rng.range(140, WORLD_W - 140);
    const y = rng.range(140, WORLD_H - 140);
    const dx = x - HEART_BASE.x;
    const dy = y - HEART_BASE.y;
    if (dx * dx + dy * dy < 220 * 220) continue;
    if (rocks.some((r) => (r.x - x) ** 2 + (r.y - y) ** 2 < 190 * 190)) continue;
    rocks.push({ x, y, r: rng.range(26, 44) });
  }

  // Decorative night flowers: pure scenery, drawn as tiny glowing dots.
  for (let i = 0; i < 90; i++) {
    const x = rng.range(30, WORLD_W - 30);
    const y = rng.range(30, WORLD_H - 30);
    const dx = x - HEART_BASE.x;
    const dy = y - HEART_BASE.y;
    if (dx * dx + dy * dy < 90 * 90) continue;
    flowers.push({
      x, y,
      hue: rng.pick(['#7ae0a3', '#7ad9ff', '#ff9ecf', '#ffd76a']),
      size: rng.range(1.5, 3.2),
      phase: rng.range(0, Math.PI * 2),
    });
  }

  // Fireflies drift over the garden for the whole run.
  for (let i = 0; i < 26; i++) {
    fireflies.push({
      x: rng.range(0, WORLD_W),
      y: rng.range(0, WORLD_H),
      vx: rng.range(-12, 12),
      vy: rng.range(-9, 9),
      phase: rng.range(0, Math.PI * 2),
    });
  }

  return { rocks, flowers, fireflies };
}

// True when (x, y) is inside the arena and not inside a rock.
export function spotFree(garden, x, y, radius) {
  if (x < radius + 8 || x > WORLD_W - radius - 8) return false;
  if (y < radius + 8 || y > WORLD_H - radius - 8) return false;
  for (const rock of garden.rocks) {
    const dx = x - rock.x;
    const dy = y - rock.y;
    const min = rock.r + radius;
    if (dx * dx + dy * dy < min * min) return false;
  }
  return true;
}

// Push a circle out of every rock it overlaps (slide, not teleport).
export function resolveRocks(garden, body) {
  for (const rock of garden.rocks) {
    const dx = body.x - rock.x;
    const dy = body.y - rock.y;
    const dist = Math.hypot(dx, dy);
    const min = rock.r + body.radius;
    if (dist > 0 && dist < min) {
      const push = min - dist;
      body.x += (dx / dist) * push;
      body.y += (dy / dist) * push;
    }
  }
  body.x = Math.max(body.radius, Math.min(WORLD_W - body.radius, body.x));
  body.y = Math.max(body.radius, Math.min(WORLD_H - body.radius, body.y));
}

// Distance from a point to the Heartbloom.
export function distToHeart(x, y) {
  return Math.hypot(x - HEART_BASE.x, y - HEART_BASE.y);
}
