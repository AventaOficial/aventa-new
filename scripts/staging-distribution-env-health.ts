/**
 * Safe Distribution env health from .env.local — no secret values printed.
 * Usage: npx tsx scripts/staging-distribution-env-health.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildDistributionEnvHealth } from '../lib/distribution/cronSafety';

function loadEnvLocal(): Record<string, string> {
  const raw = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || out[m[1]] !== undefined) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const env = { ...process.env, ...loadEnvLocal() };
console.log(JSON.stringify(buildDistributionEnvHealth(env), null, 2));
