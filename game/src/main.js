// Voidgarden — bootstrap and the frame loop.
// One job: own the canvas, run the simulation on a fixed 1/60 s step, draw
// every frame, and wire the first user gesture to sound. In screenshot mode
// (?shot=...) it builds one deterministic scene, paints it once and reports
// window.__shotReady instead of running the live loop.

import { Game } from './simulation.js';
import { Input } from './input.js';
import { SoundBank } from './audio.js';
import { draw, computeView } from './render.js';
import { buildShotScene } from './shots.js';
import { STEP } from './config.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || '20261116');
const shot = params.get('shot');

const sound = new SoundBank();
const game = new Game(seed, sound);
const input = new Input();
input.attach(canvas);

// Exposed for debugging and for scripted play-tests, not used by the game.
window.__game = game;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Browsers need a gesture before audio may start.
const unlock = () => {
  sound.unlock();
  if (game.mode === 'title') sound.startPad();
};
window.addEventListener('pointerdown', unlock, { once: false });
window.addEventListener('keydown', unlock, { once: false });

function describe() {
  if (!statusEl) return;
  if (game.mode === 'playing') {
    statusEl.textContent = `Wave ${game.wave} of 15. Score ${game.score}. Health ${Math.round(game.player.hp)} of ${game.player.maxHp}. Heart ${Math.round(game.heart.hp)} of ${game.heart.maxHp}. Seeds ${game.seeds}.`;
  } else if (game.mode === 'title') {
    statusEl.textContent = 'Voidgarden. Press Enter to start the night.';
  } else if (game.mode === 'over') {
    statusEl.textContent = `The garden falls. Score ${game.endStats ? game.endStats.score : 0}. Press R to plant again.`;
  } else if (game.mode === 'victory') {
    statusEl.textContent = `The garden blooms again. Score ${game.endStats ? game.endStats.score : 0}. Press R to plant again.`;
  }
}

if (shot) {
  // Deterministic scene: build it, paint one frame, report readiness.
  const view = computeView(canvas.width, canvas.height);
  buildShotScene(game, shot, view);
  draw(ctx, game, canvas.width, canvas.height);
  describe();
  window.__shotReady = true;
} else {
  let last = performance.now();
  let acc = 0;
  let lastMode = game.mode;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    const view = computeView(canvas.width, canvas.height);
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      game.update(input, view);
      acc -= STEP;
      steps++;
    }
    if (steps === 5) acc = 0;
    draw(ctx, game, canvas.width, canvas.height);
    if (game.mode !== lastMode) {
      lastMode = game.mode;
      describe();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
