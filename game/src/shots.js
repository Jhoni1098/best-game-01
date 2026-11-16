// Voidgarden — deterministic screenshot scenes.
// One job: build the four states the screenshots show (?shot=title|play|
// upgrade|over&seed=N), by running the real simulation with a scripted
// autopilot — never by drawing a fake picture. The scene is fixed for a
// given seed: same seed, same frame. main.js renders one frame and then sets
// window.__shotReady so a screenshot tool knows the scene is painted.

import { Game } from './simulation.js';
import { STEP, BLOOMS, HEART_BASE } from './config.js';
import { computeView } from './render.js';

// A stand-in for the real Input: the autopilot holds a loose orbit around
// the Heartbloom (so the fight stays in frame), aims at the nearest blight
// and holds fire. It implements the same interface update() expects
// (wasPressed / wasClicked / firing / moveAxis / consume).
function autopilot(game, view) {
  const input = {
    mouseX: 640,
    mouseY: 360,
    mouseDown: true,
    mousePressed: false,
    rightPressed: false,
    wasPressed: () => false,
    wasClicked: () => false,
    wasRightClicked: () => false,
    firing: () => true,
    moveAxis() {
      // Drift around the Heartbloom at ~250 px, slowly circling, so the
      // blights stream in past the player instead of being chased to the rim.
      const px = game.player.x - HEART_BASE.x;
      const py = game.player.y - HEART_BASE.y;
      const ang = Math.atan2(py, px) + 0.3;
      const tx = HEART_BASE.x + Math.cos(ang) * 250;
      const ty = HEART_BASE.y + Math.sin(ang) * 250;
      const dx = tx - game.player.x;
      const dy = ty - game.player.y;
      const dd = Math.hypot(dx, dy) || 1;
      if (dd < 30) return { x: 0, y: 0 };
      return { x: dx / dd, y: dy / dd };
    },
    consume() {},
  };
  return input;
}

function aimAtNearest(game, input, view) {
  let target = null;
  let best = Infinity;
  for (const e of game.enemies) {
    const d = (e.x - game.player.x) ** 2 + (e.y - game.player.y) ** 2;
    if (d < best) { best = d; target = e; }
  }
  const tx = target ? target.x : game.player.x + 200;
  const ty = target ? target.y : game.player.y;
  input.mouseX = tx * view.scale + view.ox;
  input.mouseY = ty * view.scale + view.oy;
}

function runSteps(game, input, view, steps) {
  for (let i = 0; i < steps; i++) {
    aimAtNearest(game, input, view);
    game.update(input, view);
    if (game.mode !== 'playing') break;
  }
}

export function buildShotScene(game, scene, view) {
  const idle = {
    mouseX: 640, mouseY: 360, mouseDown: false, mousePressed: false, rightPressed: false,
    wasPressed: () => false, wasClicked: () => false, wasRightClicked: () => false,
    firing: () => false, moveAxis: () => ({ x: 0, y: 0 }), consume() {},
  };

  if (scene === 'title') {
    // The title screen over a living garden; let the wisps drift a while.
    for (let i = 0; i < 240; i++) game.update(idle, view);
    return;
  }

  if (scene === 'play') {
    game.start();
    game.startWave(5);
    // A real mid-fight: two blooms already planted, seeds in the purse.
    game.seeds = 64;
    game.selectedBloom = 'thorn';
    game._tryPlant(620, 330);
    game.selectedBloom = 'frost';
    game._tryPlant(980, 560);
    game.selectedBloom = 'thorn';
    const input = autopilot(game, view);
    runSteps(game, input, view, 600);
    if (game.mode !== 'playing') {
      // The autopilot cleared the wave early; re-stage a shorter fight.
      game.start();
      game.startWave(5);
      game.seeds = 64;
      game.selectedBloom = 'thorn';
      game._tryPlant(620, 330);
      game.selectedBloom = 'frost';
      game._tryPlant(980, 560);
      runSteps(game, autopilot(game, view), view, 350);
    }
    return;
  }

  if (scene === 'upgrade') {
    game.start();
    game.score = 1240;
    game.kills = 31;
    game.seeds = 47;
    game.clearWave();
    for (let i = 0; i < 30; i++) game.update(idle, view);
    return;
  }

  if (scene === 'over') {
    game.start();
    game.startWave(2);
    game.score = 860;
    game.kills = 22;
    game.seeds = 18;
    runSteps(game, autopilot(game, view), view, 420);
    if (game.mode === 'playing') game._damagePlayer(9999);
    for (let i = 0; i < 30; i++) game.update(idle, view);
    return;
  }

  // Unknown scene: fall back to the title.
  for (let i = 0; i < 240; i++) game.update(idle, view);
}

// The view a 1280x720 screenshot uses; kept here so the scene builder and
// the live loop agree on coordinates.
export function shotView() {
  return computeView(1280, 720);
}

export { STEP, BLOOMS };
