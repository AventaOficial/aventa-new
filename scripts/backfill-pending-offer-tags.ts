/**
 * Backfill category + tags en ofertas pending (cola de moderación).
 *
 * Uso:
 *   npx tsx scripts/backfill-pending-offer-tags.ts
 *   npx tsx scripts/backfill-pending-offer-tags.ts --dry-run
 *   npx tsx scripts/backfill-pending-offer-tags.ts --limit=20
 *
 * Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { inferOfferAutogroup } from '../lib/offers/inferOfferAutogroup';
import { normalizeCategoryForStorage } from '../lib/categories';

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = val;
  }
}

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number.parseInt(limitArg.split('=')[1] ?? '', 10) : 500;
  return { dryRun, limit: Number.isFinite(limit) ? limit : 500 };
}

type OfferRow = {
  id: string;
  title: string;
  store: string | null;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  status: string;
};

async function main() {
  loadEnvLocal();
  const { dryRun, limit } = parseArgs();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (.env.local)');
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from('offers')
    .select('id, title, store, description, category, tags, status')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error leyendo offers:', error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as OfferRow[];
  console.log(`Pending encontradas: ${rows.length}${dryRun ? ' (dry-run)' : ''}`);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
  const autogroup = inferOfferAutogroup({
    title: row.title,
    store: row.store,
    category: null,
    description: row.description,
  });

    const nextCategory = autogroup.category ?? normalizeCategoryForStorage(row.category);
    const nextTags = autogroup.tags;

    const sameCategory = (row.category ?? null) === (nextCategory ?? null);
    const prevTags = [...(row.tags ?? [])].sort().join('|');
    const newTags = [...nextTags].sort().join('|');
    const sameTags = prevTags === newTags;

    if (sameCategory && sameTags) {
      skipped++;
      continue;
    }

    const patch: Record<string, unknown> = {};
    if (!sameCategory && nextCategory) patch.category = nextCategory;
    if (!sameTags && nextTags.length > 0) patch.tags = nextTags;

    if (Object.keys(patch).length === 0) {
      skipped++;
      continue;
    }

    console.log(
      `- ${row.id.slice(0, 8)}… ${row.title.slice(0, 60)}` +
        (patch.category ? ` → cat=${patch.category}` : '') +
        (patch.tags ? ` tags=[${(patch.tags as string[]).slice(0, 5).join(', ')}${nextTags.length > 5 ? '…' : ''}]` : '')
    );

    if (!dryRun) {
      const { error: upErr } = await supabase.from('offers').update(patch).eq('id', row.id);
      if (upErr) {
        console.error(`  ✗ ${upErr.message}`);
        continue;
      }
    }
    updated++;
  }

  console.log(`Listo. Actualizadas: ${updated}, sin cambios: ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
