#!/usr/bin/env node
/** Launcher → staging-p0d3-2-soak.ts */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const r = spawnSync('npx tsx "scripts/staging-p0d3-2-soak.ts"', {
  stdio: 'inherit',
  cwd: root,
  shell: true,
  env: process.env,
});
process.exit(r.status ?? 1);
