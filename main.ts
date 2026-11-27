// Puffin Air Rally — the hand-in program (Node 22, standard library only).
//
// The game itself is the static site in game/: plain files a desktop browser
// opens offline, no build step and no network. This program copies game/ and
// screenshots/ into the output directory and writes dossier.json there with
// buildDossier from the vendored make.fun library, byte for byte the way the
// scorer rebuilds it. In the grader the output is /output; anywhere else the
// MAKEFUN_OUTPUT_DIR environment variable names it instead:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The caps passed to buildDossier mirror the gate's own limits, so a tree
// that would be refused there is refused here first with the same numbers.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outputDir, 'game'), { recursive: true });

const shotsDir = join(outputDir, 'screenshots');
mkdirSync(shotsDir, { recursive: true });
if (existsSync(join(repoDir, 'screenshots'))) {
  cpSync(join(repoDir, 'screenshots'), shotsDir, { recursive: true });
}

const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`Puffin Air Rally handed in to ${outputDir} (game/, screenshots/, dossier.json).`);
