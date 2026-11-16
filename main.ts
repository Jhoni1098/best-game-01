// Voidgarden — the entry program (Node 22, standard library only).
//
// What it does: it hands the game in. It copies this repository's game/ and
// screenshots/ into the output directory and writes dossier.json there, the
// summary the judge reads, built by the vendored make.fun library.
//
// The grader runs it as `node /bot/main.ts` with no network, a read-only
// /bot and a writable /output, twice, and both runs must write the same
// bytes. Copying files and building the dossier from them is deterministic,
// so the two runs agree.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// and `node serve.ts` serves game/ on http://localhost:8080 to play it.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps for this bounty (see the kit's RULES.txt): the dossier
// text is capped at 160 KiB, at most 4 screenshots of 256 KiB each, and
// game/ holds at most 993 files totalling 48 MiB with no path over 1000
// bytes. The dossier builder enforces them and fails loudly if breached.
const DOSSIER_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function handIn() {
  mkdirSync(outDir, { recursive: true });
  cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });
  if (existsSync(join(repoRoot, 'screenshots'))) {
    cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
  }
  const dossier = buildDossier(outDir, DOSSIER_LIMITS);
  writeFileSync(join(outDir, 'dossier.json'), dossier);
}

handIn();
