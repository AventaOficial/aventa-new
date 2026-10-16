/**
 * READ-ONLY: diagnóstico de calidad del catálogo (sin INSERT/UPDATE/DELETE).
 *
 * Uso con fixtures (sin DB):
 *   npx tsx scripts/catalog-quality-report.ts --fixtures
 *
 * Uso con Supabase (solo lectura; requiere .env.local):
 *   npx tsx --env-file=.env.local scripts/catalog-quality-report.ts --limit=500
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  buildCatalogQualityReport,
  type CatalogOfferRow,
} from '../lib/offers/catalogQuality';

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function argNum(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split('=')[1]);
  return Number.isFinite(n) ? n : fallback;
}

function env(name: string): string {
  const v = process.env[name]?.trim() ?? '';
  if (!v) throw new Error(`Falta ${name}`);
  return v;
}

function pct(n: number, total: number): string {
  if (total <= 0) return '0.0%';
  return `${((100 * n) / total).toFixed(1)}%`;
}

async function loadFromSupabase(limit: number): Promise<{ rows: CatalogOfferRow[]; limitation: string | null }> {
  const url = env('NEXT_PUBLIC_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from('offers')
    .select(
      'id, status, title, store, category, price, original_price, image_url, description, hunter_comment, moderator_comment, bot_meta',
    )
    .in('status', ['pending', 'approved', 'published'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`SELECT offers failed: ${error.message}`);
  return {
    rows: (data ?? []) as CatalogOfferRow[],
    limitation: `Muestra de las ${limit} ofertas públicas más recientes (no auditoría completa).`,
  };
}

function loadFixtures(): { rows: CatalogOfferRow[]; limitation: string | null } {
  const path = join(process.cwd(), 'tests/fixtures/catalog-quality-sample.json');
  const raw = JSON.parse(readFileSync(path, 'utf8')) as CatalogOfferRow[];
  return {
    rows: raw,
    limitation: 'Datos de fixture local; no representa producción.',
  };
}

async function main(): Promise<void> {
  const sampleLimit = argNum('samples', 25);
  const useFixtures = argFlag('fixtures') || !process.env.NEXT_PUBLIC_SUPABASE_URL;
  let rows: CatalogOfferRow[];
  let dataSource: 'fixtures' | 'supabase';
  let limitation: string | null;

  if (useFixtures) {
    ({ rows, limitation } = loadFixtures());
    dataSource = 'fixtures';
    if (!argFlag('fixtures') && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      limitation = `${limitation ?? ''} Sin NEXT_PUBLIC_SUPABASE_URL: se usaron fixtures.`.trim();
    }
  } else {
    const limit = argNum('limit', 500);
    ({ rows, limitation } = await loadFromSupabase(limit));
    dataSource = 'supabase';
  }

  const report = buildCatalogQualityReport({
    rows,
    dataSource,
    limitation,
    sampleLimit,
  });

  const outDir = join(process.cwd(), 'scripts/_catalog_quality_reports');
  mkdirSync(outDir, { recursive: true });
  const outJson = join(outDir, 'catalog-quality-latest.json');
  writeFileSync(outJson, JSON.stringify(report, null, 2), 'utf8');

  console.log('=== AVENTA catalog quality (read-only) ===');
  console.log(`Fuente: ${dataSource}`);
  if (limitation) console.log(`Limitación: ${limitation}`);
  console.log(`Inspeccionadas: ${report.inspected}`);
  console.log(`Con hallazgos: ${report.withFindings} (${pct(report.withFindings, report.inspected)})`);
  console.log('Por severidad:', report.bySeverity);
  console.log('Por tipo:', report.byType);
  console.log(`JSON: ${outJson}`);
  for (const sample of report.samples.slice(0, 8)) {
    console.log(`\n— ${sample.offerId} (${sample.status ?? '?'})`);
    for (const f of sample.findings) {
      console.log(`  [${f.severity}/${f.kind}] ${f.type}: ${f.evidence}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
