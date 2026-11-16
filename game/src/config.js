// Voidgarden — tuning, definitions and wave composition.
// One job: every number that makes the game play the way it does.
// The simulation reads these; nothing here touches the canvas or the DOM.

export const WORLD_W = 1600;
export const WORLD_H = 900;
export const TOTAL_WAVES = 15;
export const STEP = 1 / 60;

// The garden's palette: a night garden lit by its own blooms.
export const PALETTE = {
  nightTop: '#0a0e24',
  nightBottom: '#131a3d',
  soil: '#1b2440',
  grass: '#1d3329',
  grassLight: '#274636',
  path: '#232c52',
  rock: '#3a4470',
  rockEdge: '#565f92',
  heartCore: '#ffd76a',
  heartPetal: '#ff9ecf',
  player: '#ffe9a8',
  playerTrim: '#ff9d5c',
  seed: '#b8ff7a',
  uiPanel: 'rgba(8, 12, 30, 0.82)',
  uiLine: '#4d5a8f',
  text: '#eef2ff',
  textDim: '#9aa6d6',
  danger: '#ff5d73',
  gold: '#ffd76a',
};

export const PLAYER_BASE = {
  hp: 100,
  speed: 265,
  radius: 15,
  fireRate: 4.2, // shots per second
  damage: 12,
  bulletSpeed: 640,
  bulletRadius: 5,
  pickupRadius: 95,
  armor: 0, // fraction of damage ignored
  pierce: 0,
  projectiles: 1,
  dashCooldown: 0, // 0 = no dash yet; upgrades unlock it
  dashTime: 0.16,
  dashSpeed: 900,
};

export const HEART_BASE = {
  x: WORLD_W / 2,
  y: WORLD_H / 2,
  radius: 34,
  maxHp: 120,
};

// Foes. hp and speed scale with the wave (see scaleEnemy); damage is flat.
// behaviour: 'chase' walks at the Heartbloom (and swats the player if close),
// 'zigzag' darts side to side, 'ranged' stops at range and spits globs,
// 'split' bursts into wisps when it dies, 'boss' is the wave-15 king.
export const ENEMIES = {
  wisp: {
    name: 'Wisp', hp: 20, speed: 72, radius: 14, damage: 8,
    score: 10, seeds: 2, behaviour: 'chase', color: '#b678ff', eye: '#e9d5ff',
  },
  skitter: {
    name: 'Skitter', hp: 12, speed: 138, radius: 11, damage: 6,
    score: 15, seeds: 2, behaviour: 'zigzag', color: '#ff7ad9', eye: '#ffe3f4',
  },
  spitter: {
    name: 'Spitter', hp: 28, speed: 56, radius: 14, damage: 10,
    score: 20, seeds: 3, behaviour: 'ranged', color: '#7ae0a3', eye: '#d9ffe9',
    range: 330, globSpeed: 230, globDamage: 9,
  },
  splitter: {
    name: 'Splitter', hp: 36, speed: 62, radius: 17, damage: 10,
    score: 25, seeds: 3, behaviour: 'split', color: '#ffb35c', eye: '#fff1d6',
  },
  brute: {
    name: 'Brute', hp: 170, speed: 40, radius: 27, damage: 22,
    score: 60, seeds: 8, behaviour: 'chase', color: '#ff5d73', eye: '#ffd6db',
  },
  king: {
    name: 'Blight King', hp: 1500, speed: 46, radius: 42, damage: 30,
    score: 500, seeds: 40, behaviour: 'boss', color: '#8f5cff', eye: '#ff5d73',
  },
};

// How a foe grows with the wave: +12% hp and +2% speed per wave after the first.
export function scaleEnemy(type, wave) {
  const base = ENEMIES[type];
  const hpMul = 1 + 0.12 * (wave - 1);
  const spMul = 1 + 0.02 * (wave - 1);
  return { ...base, hp: Math.round(base.hp * hpMul), speed: base.speed * spMul };
}

// Blooms the gardener plants. cost is paid in seeds. A bloom lives until the
// run ends; frost slows, thorn shoots, sun pulses area damage.
export const BLOOMS = {
  thorn: {
    name: 'Thornspitter', cost: 25, radius: 16, range: 265,
    rate: 1.15, damage: 15, bulletSpeed: 520, color: '#7ae0a3', petal: '#b8ff7a',
    blurb: 'Shoots the nearest foe.',
  },
  frost: {
    name: 'Frostbloom', cost: 30, radius: 18, range: 155,
    slow: 0.45, dps: 3, color: '#7ad9ff', petal: '#d6f4ff',
    blurb: 'Chills nearby blights.',
  },
  sun: {
    name: 'Sunburst', cost: 40, radius: 20, range: 140,
    rate: 2.2, damage: 30, color: '#ffd76a', petal: '#fff1b8',
    blurb: 'Pulses wide fire rings.',
  },
};

export const BLOOM_ORDER = ['thorn', 'frost', 'sun'];

// Upgrades offered between waves. Each apply() mutates the run's player or
// heart; the simulation passes its live state in.
export const UPGRADES = [
  {
    id: 'sharpshoot', name: 'Sharpshoot', icon: '◎',
    desc: '+25% bolt damage.',
    apply: (s) => { s.player.damage *= 1.25; },
  },
  {
    id: 'rapidfire', name: 'Rapidfire', icon: '≋',
    desc: '+20% fire rate.',
    apply: (s) => { s.player.fireRate *= 1.2; },
  },
  {
    id: 'swiftboots', name: 'Swiftboots', icon: '»',
    desc: '+15% move speed.',
    apply: (s) => { s.player.speed *= 1.15; },
  },
  {
    id: 'ironpetal', name: 'Ironpetal', icon: '⬡',
    desc: 'Take 20% less damage.',
    apply: (s) => { s.player.armor = Math.min(0.6, s.player.armor + 0.2); },
  },
  {
    id: 'pierce', name: 'Piercing Light', icon: '→',
    desc: 'Bolts pierce +1 blight.',
    apply: (s) => { s.player.pierce += 1; },
  },
  {
    id: 'twinshot', name: 'Twinshot', icon: '✦',
    desc: '+1 bolt per shot (max 3).',
    apply: (s) => { s.player.projectiles = Math.min(3, s.player.projectiles + 1); },
  },
  {
    id: 'heartmend', name: 'Heartmend', icon: '♥',
    desc: 'Heal 50 and +25 max health.',
    apply: (s) => {
      s.player.maxHp += 25;
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + 50);
    },
  },
  {
    id: 'bloomcare', name: 'Bloomcare', icon: '❀',
    desc: 'Repair the Heartbloom 50 and +25 max heart health.',
    apply: (s) => {
      s.heart.maxHp += 25;
      s.heart.hp = Math.min(s.heart.maxHp, s.heart.hp + 50);
    },
  },
  {
    id: 'magnet', name: 'Seed Magnet', icon: '◉',
    desc: 'Seeds fly to you from much further.',
    apply: (s) => { s.player.pickupRadius *= 1.8; },
  },
  {
    id: 'thorncraft', name: 'Thorncraft', icon: '✿',
    desc: 'Your planted blooms deal +35% damage.',
    apply: (s) => { s.bloomDamageMul *= 1.35; },
  },
  {
    id: 'seedcache', name: 'Seed Cache', icon: '◆',
    desc: '+40 seeds, right now.',
    apply: (s) => { s.seeds += 40; },
  },
  {
    id: 'blinkstep', name: 'Blinkstep', icon: '↯',
    desc: 'Unlock Shift to dash; further picks shorten its cooldown.',
    apply: (s) => {
      s.player.dashCooldown = s.player.dashCooldown === 0 ? 1.6 : Math.max(0.7, s.player.dashCooldown - 0.4);
    },
  },
];

// Wave composition: a list of { type, count, gap } spawn groups plus a
// headline for the banner. Elites (gold, tougher, richer) appear from wave 4.
export function waveComp(wave, rng) {
  const groups = [];
  const add = (type, count) => { if (count > 0) groups.push({ type, count }); };
  const base = 5 + wave * 2;
  add('wisp', Math.round(base * 0.55));
  add('skitter', Math.round(base * 0.22) + (wave >= 2 ? 1 : 0));
  add('spitter', wave >= 3 ? Math.round(base * 0.12) : 0);
  add('splitter', wave >= 4 ? Math.round(base * 0.11) : 0);
  if (wave >= 5 && wave % 5 === 0) add('brute', 1 + Math.floor(wave / 5));
  else if (wave >= 6) add('brute', Math.floor((wave - 5) / 3));
  if (wave === TOTAL_WAVES) add('king', 1);

  // Shuffle the groups so the wave never arrives in one tidy column.
  for (let i = groups.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [groups[i], groups[j]] = [groups[j], groups[i]];
  }
  const eliteChance = wave >= 4 ? Math.min(0.3, 0.06 + 0.02 * wave) : 0;
  const headline = wave === TOTAL_WAVES
    ? 'The Blight King comes'
    : wave % 5 === 0
      ? `Wave ${wave} — brutes in the dark`
      : `Wave ${wave}`;
  return { groups, eliteChance, headline };
}

// Seconds between spawns inside a wave; the night gets busier.
export function spawnGap(wave) {
  return Math.max(0.42, 0.95 - wave * 0.035);
}
