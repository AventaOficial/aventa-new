#!/usr/bin/env node
/**
 * Launcher — real smoke lives in staging-p0d3-1-attribution-smoke.ts
 * Prefer: npx tsx scripts/staging-p0d3-1-attribution-smoke.ts
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const tsRel = 'scripts/staging-p0d3-1-attribution-smoke.ts';

// shell:true required on Windows; quote path so spaces in cwd don't break argv.
const r = spawnSync(`npx tsx "${tsRel}"`, {
  stdio: 'inherit',
  cwd: root,
  shell: true,
  env: process.env,
});
process.exit(r.status ?? 1);
