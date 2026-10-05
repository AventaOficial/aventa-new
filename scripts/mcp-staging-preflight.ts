/**
 * MCP Grok Bots — preflight de entorno. Sólo lectura.
 *
 * Evalúa variables (PRESENT / MISSING / INVALID, nunca valores) y, si hay Upstash, lee con GET
 * el marcador del entorno evaluado (`aventa:staging:environment` o `aventa:production:environment`).
 * No escribe en Redis, Supabase ni Vercel.
 *
 * Uso:
 *   vercel env pull .env.preview.local --environment=preview   (o el entorno del proyecto staging)
 *   npx tsx scripts/mcp-staging-preflight.ts --env-file .env.preview.local
 *   npx tsx scripts/mcp-staging-preflight.ts --target production --env-file <archivo de production>
 *
 * --target staging (por defecto) | production. Sin --env-file evalúa el entorno del proceso;
 * con --env-file evalúa SÓLO ese archivo.
 * Salida: 0 = READY, 1 = NOT_READY, 2 = BLOCKED (o error).
 */

import { existsSync, readFileSync } from 'node:fs';
import {
  evaluateMcpProductionPreflight,
  evaluateMcpStagingPreflight,
  type PreflightReport,
} from '@/lib/mcp/preflight';
import type { RedisEnvironment } from '@/lib/server/redisEnvironment';
import { readRedisEnvironmentMarker } from '@/lib/server/redisEnvironmentMarker';

function parseEnvFile(path: string): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

function resolveEnv(argv: string[]): NodeJS.ProcessEnv {
  const i = argv.indexOf('--env-file');
  if (i === -1) return process.env;
  const path = argv[i + 1];
  if (!path || !existsSync(path)) {
    console.error('BLOCKED: --env-file no existe');
    process.exit(2);
  }
  return parseEnvFile(path);
}

function resolveTarget(argv: string[]): RedisEnvironment {
  const i = argv.indexOf('--target');
  if (i === -1) return 'staging';
  const value = (argv[i + 1] ?? '').trim().toLowerCase();
  if (value === 'staging' || value === 'production') return value;
  console.error('BLOCKED: --target debe ser staging o production');
  process.exit(2);
}

function print(report: PreflightReport, target: RedisEnvironment) {
  const width = Math.max(...report.checks.map((c) => c.name.length));
  console.log(`MCP ${target} preflight (sólo lectura; sin valores secretos)\n`);
  for (const c of report.checks) {
    const mark = c.ok ? 'ok  ' : c.severity === 'block' ? 'FAIL' : 'wait';
    console.log(`${mark}  ${c.status.padEnd(7)}  ${c.name.padEnd(width)}  ${c.note}`);
  }
  console.log(`\nVERDICT: ${report.verdict}`);
  if (report.verdict === 'BLOCKED') console.log('Inseguro: no desplegar ni continuar.');
  if (report.verdict === 'NOT_READY') console.log('Se puede desplegar con MCP apagado; no está listo para crear el cliente ni activar.');
}

async function main() {
  const argv = process.argv.slice(2);
  const target = resolveTarget(argv);
  const env = resolveEnv(argv);
  const marker = await readRedisEnvironmentMarker(env, target);
  const evaluate = target === 'production' ? evaluateMcpProductionPreflight : evaluateMcpStagingPreflight;
  const report = evaluate(env, { redisMarker: marker });
  print(report, target);
  process.exit(report.verdict === 'READY' ? 0 : report.verdict === 'NOT_READY' ? 1 : 2);
}

main().catch(() => {
  console.error('BLOCKED: error inesperado en el preflight');
  process.exit(2);
});
