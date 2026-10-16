#!/usr/bin/env node
/**
 * Lectura solamente: compara variables económicas locales vs perfil esperado
 * para soft launch comunitario (prod con dinero congelado).
 *
 * Uso:
 *   vercel env pull .env.production.local --environment=production
 *   node scripts/launch/verify-prod-economic-flags.mjs
 *
 * Opcional: VERIFY_PROFILE=monetary_cohort_prep (solo documentación; sigue fail-closed en prod)
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

function loadEnvFile(relPath) {
  const full = join(root, relPath);
  if (!existsSync(full)) return {};
  const raw = readFileSync(full, 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    let v = t.slice(i + 1);
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[t.slice(0, i)] = v;
  }
  return env;
}

const fileEnv = {
  ...loadEnvFile('.env.local'),
  ...loadEnvFile('.env.production.local'),
};

/** @type {Record<string, string | undefined>} */
const env = { ...fileEnv, ...process.env };

function norm(name) {
  const v = (env[name] ?? '').trim();
  return v === '' ? '(ausente)' : v;
}

function isProductionRuntime() {
  const vercelEnv = (env.VERCEL_ENV ?? '').trim().toLowerCase();
  if (vercelEnv === 'production') return true;
  if (vercelEnv === 'preview' || vercelEnv === 'development') return false;
  return (env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
}

/** Mirrors lib/server/moneyPathFreeze.ts */
function isMoneyPathFrozen() {
  const v = (env.MONEY_PATH_FROZEN ?? '').trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
  if (isProductionRuntime()) return true;
  return false;
}

function envFlag(name) {
  const v = (env[name] ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

const PROFILE = (env.VERIFY_PROFILE ?? 'soft_launch_community').trim();

/** expected: boolean | 'any_true' | 'any_false' | 'absent_or_false' */
const SOFT_LAUNCH_COMMUNITY = [
  {
    key: 'MONEY_PATH_FROZEN',
    expected: 'frozen',
    note: 'Explícito true recomendado; ausente en prod runtime = congelado (fail-closed).',
  },
  {
    key: 'REWARDS_PAYOUT_ENABLED',
    expected: 'off',
    note: 'Pagos cohorte apagados.',
  },
  {
    key: 'REWARDS_PROGRAM_ACTIVE',
    expected: 'documented',
    note: 'Fase A doc: true (reconocimiento). Confirmar con Product/Ops.',
  },
  {
    key: 'REWARDS_BETA_UI_ENABLED',
    expected: 'off_unless_beta',
    note: 'ON solo si UX cohorte invitada; no autoriza pagos.',
  },
  {
    key: 'SETTLEMENT_BRIDGE_ENABLED',
    expected: 'off',
    note: 'Puente comisión→ledger apagado en prod soft launch.',
  },
  {
    key: 'COMMISSION_PROGRAM_ACTIVE',
    expected: 'off',
    note: 'Programa legacy comisiones separado de Rewards V1.',
  },
  {
    key: 'PAYOUT_PROVIDER',
    expected: 'absent_or_stub',
    note: 'Sin PSP real en prod hasta GO monetario.',
  },
];

function evaluate(row) {
  const raw = env[row.key];
  const present = raw !== undefined && String(raw).trim() !== '';
  const on = envFlag(row.key);
  const frozen = isMoneyPathFrozen();

  switch (row.expected) {
    case 'frozen':
      return {
        ok: frozen,
        detail: `isMoneyPathFrozen()=${frozen}, raw=${norm('MONEY_PATH_FROZEN')}`,
      };
    case 'off':
      return { ok: !on, detail: `raw=${norm(row.key)}` };
    case 'documented':
      return {
        ok: true,
        warn: !present,
        detail: `raw=${norm(row.key)} (confirmar en Vercel dashboard)`,
      };
    case 'off_unless_beta':
      return {
        ok: true,
        warn: on,
        detail: `raw=${norm(row.key)}${on ? ' — revisar si cohorte UX debe estar ON' : ''}`,
      };
    case 'absent_or_stub': {
      if (!present) return { ok: true, detail: 'ausente (fail-closed en prod)' };
      const v = (raw ?? '').trim().toLowerCase();
      const ok = v === 'stub' || v === 'sandbox' || v === 'manual';
      return { ok, detail: `raw=${v}`, fail: !ok };
    }
    default:
      return { ok: false, detail: 'regla desconocida' };
  }
}

const rows = SOFT_LAUNCH_COMMUNITY;
const runtime = {
  NODE_ENV: env.NODE_ENV ?? '(unset)',
  VERCEL_ENV: env.VERCEL_ENV ?? '(unset)',
  isProductionRuntime: isProductionRuntime(),
  isMoneyPathFrozen: isMoneyPathFrozen(),
};

console.log('── verify-prod-economic-flags (read-only) ──');
console.log(`profile: ${PROFILE}`);
console.log(`runtime: ${JSON.stringify(runtime)}`);
console.log('');
console.log('Si todas las filas muestran (ausente), ejecuta:');
console.log('  vercel link   # si hace falta');
console.log('  vercel env pull .env.production.local --environment=production');
console.log('');

let hardFail = false;
let warnings = 0;

for (const row of rows) {
  const { ok, detail, warn, fail } = evaluate(row);
  if (fail) hardFail = true;
  if (!ok) hardFail = true;
  if (warn) warnings += 1;
  const icon = !ok ? 'FAIL' : warn ? 'WARN' : 'OK';
  console.log(`${icon.padEnd(4)} ${row.key.padEnd(28)} ${detail}`);
  console.log(`     └ ${row.note}`);
}

console.log('');
if (!existsSync(join(root, '.env.production.local'))) {
  console.log('WARN: no existe .env.production.local — valores reales de Vercel = UNKNOWN');
  warnings += 1;
}

if (hardFail) {
  console.error('Resultado: NO-GO (flags críticos no coinciden con soft_launch_community).');
  process.exit(1);
}

if (warnings > 0) {
  console.log('Resultado: REVISAR (warnings; confirmación humana en Vercel/Supabase).');
  process.exit(0);
}

console.log('Resultado: OK según archivo local y reglas fail-closed (confirmar dashboard).');
process.exit(0);
