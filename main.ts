// FJORDWING — Make.fun submission packaging entrypoint (Node 22 stdlib only).
// Copies static offline browser assets from game/ and screenshots/ into MAKEFUN_OUTPUT_DIR
// (or /output inside the grader container) and emits a deterministic dossier.json.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function packageEntry(): void {
  mkdirSync(outputDir, { recursive: true });

  const gameDest = join(outputDir, 'game');
  cpSync(join(repoRoot, 'game'), gameDest, { recursive: true });

  const shotsSrc = join(repoRoot, 'screenshots');
  const shotsDest = join(outputDir, 'screenshots');
  mkdirSync(shotsDest, { recursive: true });
  if (existsSync(shotsSrc)) {
    cpSync(shotsSrc, shotsDest, { recursive: true });
  }

  const dossierBytes = buildDossier(outputDir, DOSSIER_CAPS);
  writeFileSync(join(outputDir, 'dossier.json'), dossierBytes);
}

packageEntry();
