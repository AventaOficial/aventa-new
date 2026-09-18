#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = spawnSync('npx tsx "scripts/staging-distribution-env-health.ts"', {
  stdio: 'inherit',
  cwd: root,
  shell: true,
  env: process.env,
});
process.exit(r.status ?? 1);
