// Voidgarden — everything the player sees.
// One job: draw the garden, the fight and every screen on one canvas. The
// simulation never draws; this file never simulates. It also writes the
// clickable rects (menu buttons, upgrade cards) back onto the game object in
// screen pixels, so the simulation can answer clicks.

import { WORLD_W, WORLD_H, TOTAL_WAVES, PALETTE, BLOOMS, BLOOM_ORDER } from './config.js';

const TAU = Math.PI * 2;

export function computeView(canvasW, canvasH) {
  const scale = Math.min(canvasW / WORLD_W, canvasH / WORLD_H);
  const ox = (canvasW - WORLD_W * scale) / 2;
  const oy = (canvasH - WORLD_H * scale) / 2;
  return { scale, ox, oy };
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function bar(ctx, x, y, w, h, frac, fill, back) {
  ctx.fillStyle = back;
  rr(ctx, x, y, w, h, h / 2);
  ctx.fill();
  if (frac > 0) {
    ctx.fillStyle = fill;
    rr(ctx, x, y, Math.max(h, w * frac), h, h / 2);
    ctx.fill();
  }
}

export function draw(ctx, game, canvasW, canvasH) {
  ctx.clearRect(0, 0, canvasW, canvasH);
  const view = computeView(canvasW, canvasH);
  // Screen shake is a deterministic wobble of the clock, never Math.random:
  // the same game time must paint the same frame.
  const shakeMag = game.shakeT > 0 ? game.shakeMag : 0;
  const shakeX = Math.sin(game.time * 131.7) * shakeMag;
  const shakeY = Math.cos(game.time * 149.3) * shakeMag;

  ctx.save();
  ctx.translate(view.ox + shakeX, view.oy + shakeY);
  ctx.scale(view.scale, view.scale);
  drawGarden(ctx, game);
  drawPickups(ctx, game);
  drawBlooms(ctx, game);
  drawHeart(ctx, game);
  drawEnemies(ctx, game);
  drawBolts(ctx, game);
  if (game.mode !== 'title') drawPlayer(ctx, game);
  drawParticles(ctx, game);
  drawFloaters(ctx, game);
  drawGlow(ctx, game);
  ctx.restore();

  drawVignette(ctx, canvasW, canvasH, game);
  if (game.mode === 'title') drawTitle(ctx, game, canvasW, canvasH);
  else if (game.mode === 'playing' || game.mode === 'upgrade' || game.paused) drawHud(ctx, game, canvasW, canvasH, view);
  if (game.mode === 'upgrade') drawUpgrade(ctx, game, canvasW, canvasH);
  if (game.paused && game.mode === 'playing') drawPaused(ctx, canvasW, canvasH);
  if (game.mode === 'over') drawEnd(ctx, game, canvasW, canvasH, false);
  if (game.mode === 'victory') drawEnd(ctx, game, canvasW, canvasH, true);
}

// ---- the garden ----------------------------------------------------------

function drawGarden(ctx, game) {
  const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  g.addColorStop(0, PALETTE.nightTop);
  g.addColorStop(1, PALETTE.nightBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  // The garden bed: a soft ellipse of tilled soil under everything.
  ctx.fillStyle = PALETTE.soil;
  ctx.beginPath();
  ctx.ellipse(WORLD_W / 2, WORLD_H / 2, 760, 420, 0, 0, TAU);
  ctx.fill();

  // Grass tufts, darker at the rim.
  ctx.fillStyle = PALETTE.grass;
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * TAU;
    const rx = 740 + ((i * 37) % 60);
    const ry = 400 + ((i * 53) % 40);
    ctx.beginPath();
    ctx.ellipse(WORLD_W / 2 + Math.cos(a) * rx, WORLD_H / 2 + Math.sin(a) * ry, 46, 20, a, 0, TAU);
    ctx.fill();
  }

  // Arena rim: a ring of pale stones.
  ctx.strokeStyle = 'rgba(120, 140, 200, 0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(WORLD_W / 2, WORLD_H / 2, 780, 435, 0, 0, TAU);
  ctx.stroke();

  // Night flowers twinkle.
  for (const f of game.garden.flowers) {
    const tw = 0.45 + 0.55 * Math.abs(Math.sin(game.time * 1.4 + f.phase));
    ctx.globalAlpha = tw * 0.8;
    ctx.fillStyle = f.hue;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.size, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Rocks.
  for (const rock of game.garden.rocks) {
    ctx.fillStyle = PALETTE.rock;
    ctx.beginPath();
    ctx.arc(rock.x, rock.y, rock.r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = PALETTE.rockEdge;
    ctx.beginPath();
    ctx.arc(rock.x - rock.r * 0.25, rock.y - rock.r * 0.3, rock.r * 0.55, 0, TAU);
    ctx.fill();
  }

  // Fireflies drift.
  for (const f of game.garden.fireflies) {
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(f.phase * 2));
    ctx.globalAlpha = tw;
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(f.x, f.y, 2.4, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPickups(ctx, game) {
  for (const pk of game.pickups) {
    const bob = Math.sin(pk.bob) * 2;
    const fade = pk.life < 3 ? 0.4 + 0.6 * (pk.life / 3) : 1;
    ctx.globalAlpha = fade;
    if (pk.pick === 'seed') {
      ctx.fillStyle = PALETTE.seed;
      ctx.beginPath();
      ctx.arc(pk.x, pk.y + bob, pk.radius, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#eaffd0';
      ctx.beginPath();
      ctx.arc(pk.x - 2, pk.y + bob - 2, 2.5, 0, TAU);
      ctx.fill();
    } else if (pk.pick === 'heart') {
      ctx.fillStyle = '#ff9ecf';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♥', pk.x, pk.y + bob);
    } else {
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(pk.x, pk.y + bob, pk.radius, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff6d6';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✦', pk.x, pk.y + bob + 0.5);
    }
  }
  ctx.globalAlpha = 1;
}

function drawBlooms(ctx, game) {
  for (const b of game.blooms) {
    const grow = 0.4 + 0.6 * b.grown;
    // Range ring, faint, so the player can see what a bloom covers.
    ctx.strokeStyle = b.color;
    ctx.globalAlpha = 0.10;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.range, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Petals.
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(grow, grow);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + game.time * 0.25;
      ctx.fillStyle = b.petal;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * b.radius * 0.62, Math.sin(a) * b.radius * 0.62, b.radius * 0.5, b.radius * 0.28, a, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(0, 0, b.radius * 0.52, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-2, -2, b.radius * 0.18, 0, TAU);
    ctx.fill();
    ctx.restore();
    if (b.pulse > 0) {
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = b.pulse * 2.2;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.range * (1 - b.pulse / 0.35) + 20, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

function drawHeart(ctx, game) {
  const h = game.heart;
  const pulse = 1 + h.pulse * 0.18 + Math.sin(game.time * 2.2) * 0.04;
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.scale(pulse, pulse);
  // Petals open and close slowly.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + game.time * 0.12;
    ctx.fillStyle = k % 2 === 0 ? PALETTE.heartPetal : '#ff7ab8';
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * h.radius * 0.78, Math.sin(a) * h.radius * 0.78, h.radius * 0.52, h.radius * 0.3, a, 0, TAU);
    ctx.fill();
  }
  const core = ctx.createRadialGradient(0, 0, 2, 0, 0, h.radius * 0.62);
  core.addColorStop(0, '#fff6d6');
  core.addColorStop(0.6, PALETTE.heartCore);
  core.addColorStop(1, 'rgba(255, 157, 92, 0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, h.radius * 0.62, 0, TAU);
  ctx.fill();
  ctx.restore();
  // Health ring.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.radius + 12, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = h.hp / h.maxHp > 0.35 ? '#ff9ecf' : '#ff5d73';
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.radius + 12, -Math.PI / 2, -Math.PI / 2 + TAU * (h.hp / h.maxHp));
  ctx.stroke();
}

function drawEnemies(ctx, game) {
  for (const e of game.enemies) {
    const scaleIn = e.spawnBurst > 0 ? 1 - e.spawnBurst / 0.3 : 1;
    const r = e.radius * Math.max(0.2, scaleIn);
    const wob = Math.sin(game.time * 6 + e.wobble) * 0.06;
    ctx.save();
    ctx.translate(e.x, e.y);
    // Body: a blight blob.
    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * (1 + wob), r * (1 - wob), 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.35, r * 0.7, r * 0.4, 0, 0, TAU);
    ctx.fill();
    // Spikes for brutes, crown for the king.
    if (e.type === 'brute') {
      ctx.fillStyle = '#ffd6db';
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
        ctx.lineTo(Math.cos(a + 0.25) * r * 1.35, Math.sin(a + 0.25) * r * 1.35);
        ctx.lineTo(Math.cos(a + 0.5) * r * 0.9, Math.sin(a + 0.5) * r * 0.9);
        ctx.fill();
      }
    }
    if (e.type === 'king') {
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, -r * 0.75);
      ctx.lineTo(-r * 0.35, -r * 1.25);
      ctx.lineTo(0, -r * 0.85);
      ctx.lineTo(r * 0.35, -r * 1.25);
      ctx.lineTo(r * 0.7, -r * 0.75);
      ctx.closePath();
      ctx.fill();
    }
    // Eyes look toward the Heartbloom.
    const look = Math.atan2(game.heart.y - e.y, game.heart.x - e.x);
    const ex = Math.cos(look) * r * 0.25;
    const ey = Math.sin(look) * r * 0.25;
    ctx.fillStyle = e.eye;
    ctx.beginPath();
    ctx.arc(ex - r * 0.32, ey - r * 0.18, r * 0.2, 0, TAU);
    ctx.arc(ex + r * 0.32, ey - r * 0.18, r * 0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1a1030';
    ctx.beginPath();
    ctx.arc(ex - r * 0.32, ey - r * 0.18, r * 0.09, 0, TAU);
    ctx.arc(ex + r * 0.32, ey - r * 0.18, r * 0.09, 0, TAU);
    ctx.fill();
    // Hit flash.
    if (e.flash > 0) {
      ctx.globalAlpha = Math.min(1, e.flash * 8);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Elite ring.
    if (e.elite) {
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r + 5, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    // Health bar for the tough ones.
    if (e.maxHp >= 100 || e.elite) {
      const w = e.radius * 2;
      bar(ctx, e.x - w / 2, e.y - e.radius - 14, w, 5, e.hp / e.maxHp, e.elite ? PALETTE.gold : '#ff5d73', 'rgba(0,0,0,0.5)');
    }
  }
  // Title-screen wisps drift behind the menu.
  if (game.mode === 'title') {
    for (const w of game.titleWisps) {
      ctx.fillStyle = '#b678ff';
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.radius, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#e9d5ff';
      ctx.beginPath();
      ctx.arc(w.x - 4, w.y - 2, 2.5, 0, TAU);
      ctx.arc(w.x + 4, w.y - 2, 2.5, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function drawBolts(ctx, game) {
  ctx.globalCompositeOperation = 'lighter';
  for (const b of game.bolts) {
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius + 3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius * 0.55, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawPlayer(ctx, game) {
  const p = game.player;
  const blink = p.invuln > 0 && Math.floor(game.time * 14) % 2 === 0;
  if (blink) return;
  const bob = Math.sin(p.walkPhase) * 1.5;
  // Lantern glow.
  const glow = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 130);
  glow.addColorStop(0, 'rgba(255, 214, 106, 0.30)');
  glow.addColorStop(1, 'rgba(255, 214, 106, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 130, 0, TAU);
  ctx.fill();
  // Body: a gardener in a warm cloak.
  ctx.fillStyle = PALETTE.playerTrim;
  ctx.beginPath();
  ctx.arc(p.x, p.y + bob, p.radius, 0, TAU);
  ctx.fill();
  ctx.fillStyle = PALETTE.player;
  ctx.beginPath();
  ctx.arc(p.x, p.y + bob, p.radius * 0.72, 0, TAU);
  ctx.fill();
  // Hood point toward the aim.
  ctx.fillStyle = PALETTE.playerTrim;
  ctx.beginPath();
  ctx.moveTo(p.x + Math.cos(p.aim) * p.radius * 1.15, p.y + Math.sin(p.aim) * p.radius * 1.15 + bob);
  ctx.lineTo(p.x + Math.cos(p.aim + 2.6) * p.radius * 0.7, p.y + Math.sin(p.aim + 2.6) * p.radius * 0.7 + bob);
  ctx.lineTo(p.x + Math.cos(p.aim - 2.6) * p.radius * 0.7, p.y + Math.sin(p.aim - 2.6) * p.radius * 0.7 + bob);
  ctx.closePath();
  ctx.fill();
  // Eyes.
  ctx.fillStyle = '#2a1a08';
  const ex = Math.cos(p.aim) * 4;
  const ey = Math.sin(p.aim) * 4;
  ctx.beginPath();
  ctx.arc(p.x - 5 + ex, p.y - 2 + ey + bob, 2.2, 0, TAU);
  ctx.arc(p.x + 5 + ex, p.y - 2 + ey + bob, 2.2, 0, TAU);
  ctx.fill();
  // Dash cooldown ring, when unlocked.
  if (p.dashCooldown > 0) {
    const frac = p.dashTimer > 0 ? 0 : 1;
    ctx.strokeStyle = frac === 1 ? '#7ae0a3' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y + bob, p.radius + 8, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
    ctx.stroke();
  }
}

function drawParticles(ctx, game) {
  ctx.globalCompositeOperation = 'lighter';
  for (const pt of game.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawFloaters(ctx, game) {
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of game.floaters) {
    ctx.globalAlpha = Math.min(1, (f.life / f.maxLife) * 1.6);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function drawGlow(ctx, game) {
  // Warm light pooling around the Heartbloom.
  const h = game.heart;
  const glow = ctx.createRadialGradient(h.x, h.y, 10, h.x, h.y, 260);
  glow.addColorStop(0, 'rgba(255, 158, 207, 0.14)');
  glow.addColorStop(1, 'rgba(255, 158, 207, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(h.x, h.y, 260, 0, TAU);
  ctx.fill();
}

function drawVignette(ctx, w, h, game) {
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(4, 6, 18, 0)');
  v.addColorStop(1, 'rgba(4, 6, 18, 0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  if (game.hurtFlash > 0) {
    ctx.fillStyle = `rgba(255, 60, 80, ${game.hurtFlash * 0.5})`;
    ctx.fillRect(0, 0, w, h);
  }
  const lowHp = game.mode === 'playing' && game.player.hp / game.player.maxHp < 0.3;
  if (lowHp) {
    const pulse = 0.10 + 0.08 * Math.sin(game.time * 5);
    ctx.fillStyle = `rgba(255, 40, 60, ${pulse})`;
    ctx.fillRect(0, 0, w, h);
  }
}

// ---- HUD and screens (screen space) --------------------------------------

function drawHud(ctx, game, w, h, view) {
  ctx.textBaseline = 'middle';
  // Top bar.
  ctx.fillStyle = PALETTE.uiPanel;
  rr(ctx, 12, 10, w - 24, 46, 10);
  ctx.fill();
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 19px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`WAVE ${Math.max(1, game.wave)} / ${TOTAL_WAVES}`, 28, 33);
  ctx.fillStyle = PALETTE.gold;
  ctx.fillText(`SCORE ${game.score}`, 190, 33);
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText(`BEST ${game.best}`, 330, 33);
  // Heart bar, centre.
  const hw = 220;
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('HEARTBLOOM', w / 2, 22);
  bar(ctx, w / 2 - hw / 2, 30, hw, 12, game.heart.hp / game.heart.maxHp, '#ff9ecf', 'rgba(255,255,255,0.16)');
  // Seeds, right.
  ctx.fillStyle = PALETTE.seed;
  ctx.font = 'bold 19px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`◆ ${game.seeds}`, w - 28, 33);

  // Player health, bottom left.
  ctx.fillStyle = PALETTE.uiPanel;
  rr(ctx, 12, h - 52, 250, 40, 10);
  ctx.fill();
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('GARDENER', 26, h - 40);
  bar(ctx, 26, h - 28, 222, 10, game.player.hp / game.player.maxHp,
    game.player.hp / game.player.maxHp > 0.3 ? '#7ae0a3' : '#ff5d73', 'rgba(255,255,255,0.16)');

  // Bloom slots, bottom centre.
  const slotW = 184;
  const slotH = 56;
  const startX = w / 2 - (slotW * 3 + 16) / 2;
  BLOOM_ORDER.forEach((type, i) => {
    const def = BLOOMS[type];
    const x = startX + i * (slotW + 8);
    const y = h - 68;
    const selected = game.selectedBloom === type;
    const afford = game.seeds >= def.cost;
    ctx.fillStyle = selected ? 'rgba(122, 224, 163, 0.25)' : PALETTE.uiPanel;
    rr(ctx, x, y, slotW, slotH, 10);
    ctx.fill();
    ctx.strokeStyle = selected ? '#7ae0a3' : PALETTE.uiLine;
    ctx.lineWidth = selected ? 2.5 : 1.5;
    rr(ctx, x, y, slotW, slotH, 10);
    ctx.stroke();
    ctx.fillStyle = afford ? def.color : '#6a7396';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`[${i + 1}] ${def.name}`, x + 10, y + 19);
    ctx.fillStyle = afford ? PALETTE.text : '#6a7396';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`◆ ${def.cost}  ·  ${def.blurb}`, x + 10, y + 40);
  });

  // Hint, bottom right.
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('WASD move · mouse aim · click: plant · P pause · M mute', w - 16, h - 16);

  // Wave banner.
  if (game.banner && game.bannerTimer > 0) {
    const a = Math.min(1, game.bannerTimer / 0.5, (game.banner.dur - game.bannerTimer) / 0.3 + 0.4);
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(game.banner.title, w / 2, 150);
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = '19px system-ui, sans-serif';
    ctx.fillText(game.banner.sub, w / 2, 188);
    ctx.globalAlpha = 1;
  }
}

function drawTitle(ctx, game, w, h) {
  ctx.fillStyle = 'rgba(6, 9, 24, 0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.fillText('VOIDGARDEN', w / 2, h * 0.30);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '21px system-ui, sans-serif';
  ctx.fillText('The blight comes at night. Grow your garden. Hold the light.', w / 2, h * 0.30 + 44);
  if (game.best > 0) {
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(`BEST SCORE  ${game.best}`, w / 2, h * 0.30 + 82);
  }
  // Controls card.
  const cw = 520;
  const ch = 200;
  const cx = w / 2 - cw / 2;
  const cy = h * 0.44;
  ctx.fillStyle = PALETTE.uiPanel;
  rr(ctx, cx, cy, cw, ch, 14);
  ctx.fill();
  ctx.strokeStyle = PALETTE.uiLine;
  ctx.lineWidth = 1.5;
  rr(ctx, cx, cy, cw, ch, 14);
  ctx.stroke();
  ctx.fillStyle = PALETTE.text;
  ctx.font = '17px system-ui, sans-serif';
  const lines = [
    'WASD / arrows — move the gardener',
    'Mouse — aim · hold click / Space — shoot bolts of light',
    '1 / 2 / 3 — pick a bloom, click the soil to plant it',
    'Defend the Heartbloom for 15 waves.',
    'If it falls — or you do — the garden is lost.',
  ];
  lines.forEach((line, i) => ctx.fillText(line, w / 2, cy + 34 + i * 32));
  // Start button.
  const bw = 260;
  const bh = 56;
  const bx = w / 2 - bw / 2;
  const by = cy + ch + 28;
  ctx.fillStyle = '#2f7a4d';
  rr(ctx, bx, by, bw, bh, 12);
  ctx.fill();
  ctx.strokeStyle = '#7ae0a3';
  ctx.lineWidth = 2;
  rr(ctx, bx, by, bw, bh, 12);
  ctx.stroke();
  ctx.fillStyle = '#eafff1';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText('▶  START THE NIGHT', w / 2, by + bh / 2 + 1);
  game.buttons = [{ id: 'start', x: bx, y: by, w: bw, h: bh }];
}

function drawUpgrade(ctx, game, w, h) {
  ctx.fillStyle = 'rgba(6, 9, 24, 0.72)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText(`Wave ${game.wave} cleared — choose a boon`, w / 2, h * 0.24);
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillText('Click a card, or press 1, 2 or 3', w / 2, h * 0.24 + 34);
  const cw = 250;
  const ch = 210;
  const gap = 24;
  const total = cw * 3 + gap * 2;
  const x0 = w / 2 - total / 2;
  const y0 = h * 0.34;
  game.cards = [];
  game.offer.forEach((up, i) => {
    const x = x0 + i * (cw + gap);
    ctx.fillStyle = PALETTE.uiPanel;
    rr(ctx, x, y0, cw, ch, 14);
    ctx.fill();
    ctx.strokeStyle = PALETTE.uiLine;
    ctx.lineWidth = 2;
    rr(ctx, x, y0, cw, ch, 14);
    ctx.stroke();
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '44px system-ui, sans-serif';
    ctx.fillText(up.icon, x + cw / 2, y0 + 62);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(up.name, x + cw / 2, y0 + 108);
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = '15px system-ui, sans-serif';
    wrapText(ctx, up.desc, x + cw / 2, y0 + 140, cw - 36, 22);
    ctx.fillStyle = '#6a7396';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(`[${i + 1}]`, x + cw / 2, y0 + ch - 22);
    game.cards.push({ x, y: y0, w: cw, h: ch });
  });
}

function wrapText(ctx, text, cx, y, maxW, lineH) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lineH));
}

function drawPaused(ctx, w, h) {
  ctx.fillStyle = 'rgba(6, 9, 24, 0.6)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', w / 2, h / 2 - 10);
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText('Press P to keep gardening', w / 2, h / 2 + 30);
}

function drawEnd(ctx, game, w, h, won) {
  ctx.fillStyle = won ? 'rgba(10, 26, 16, 0.78)' : 'rgba(24, 6, 14, 0.78)';
  ctx.fillRect(0, 0, w, h);
  const s = game.endStats || { score: 0, wave: 0, kills: 0, timeSec: 0, accuracy: 0, planted: 0 };
  ctx.textAlign = 'center';
  ctx.fillStyle = won ? '#7ae0a3' : '#ff5d73';
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.fillText(won ? 'THE GARDEN BLOOMS AGAIN' : 'THE GARDEN FALLS', w / 2, h * 0.26);
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillText(
    won ? 'Fifteen waves held. The Heartbloom opens to the dawn.' : 'The blight takes the Heartbloom. The night keeps the garden.',
    w / 2, h * 0.26 + 40,
  );
  // Stats.
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.fillText(`SCORE  ${s.score}`, w / 2, h * 0.42);
  ctx.font = '19px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.textDim;
  const rows = [
    `Wave reached  ${s.wave} / ${TOTAL_WAVES}`,
    `Blights banished  ${s.kills}`,
    `Time in the garden  ${Math.floor(s.timeSec / 60)}:${String(s.timeSec % 60).padStart(2, '0')}`,
    `Bolt accuracy  ${s.accuracy}%   ·   Blooms planted  ${s.planted}`,
    `Best score  ${game.best}`,
  ];
  rows.forEach((row, i) => ctx.fillText(row, w / 2, h * 0.42 + 38 + i * 30));
  // Again button.
  const bw = 280;
  const bh = 56;
  const bx = w / 2 - bw / 2;
  const by = h * 0.42 + 38 + rows.length * 30 + 26;
  ctx.fillStyle = '#2f7a4d';
  rr(ctx, bx, by, bw, bh, 12);
  ctx.fill();
  ctx.strokeStyle = '#7ae0a3';
  ctx.lineWidth = 2;
  rr(ctx, bx, by, bw, bh, 12);
  ctx.stroke();
  ctx.fillStyle = '#eafff1';
  ctx.font = 'bold 21px system-ui, sans-serif';
  ctx.fillText('↻  PLANT AGAIN  (R)', w / 2, by + bh / 2 + 1);
  game.buttons = [{ id: 'again', x: bx, y: by, w: bw, h: bh }];
}
