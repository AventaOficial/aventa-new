/**
 * P0 — Repair Mercado Libre bare-ID offer_url using the app canonical resolver.
 *
 * Uso:
 *   npx tsx scripts/repair-ml-bare-offer-urls.ts --dry-run
 *   npx tsx scripts/repair-ml-bare-offer-urls.ts --apply --live-first
 *   npx tsx scripts/repair-ml-bare-offer-urls.ts --apply --limit=20
 *
 * Solo escribe offers.offer_url. No toca original_offer_url / status / money.
 * Requiere NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en .env.local
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveAndNormalizeAffiliateOfferUrl } from '../lib/affiliate/resolveAffiliateOfferUrl';
import {
  isMercadoLibreBareItemPathUrl,
  isMercadoLibreNavigableProductUrl,
  resolveMercadoLibreItem,
} from '../lib/offers/resolveMercadoLibreItem';

const LIVE_PRIORITY_ID = '13ba7460-c56b-45bc-a69f-c3d603f314f8';

type Classification =
  | 'REPAIRABLE'
  | 'SKIP_ALREADY_VALID'
  | 'SKIP_UNKNOWN'
  | 'SKIP_INVALID_SOURCE'
  | 'SKIP_RESOLUTION_FAILURE'
  | 'SKIP_NO_CHANGE'
  | 'SKIP_NOT_ML';

type OfferRow = {
  id: string;
  status: string;
  offer_url: string | null;
  original_offer_url: string | null;
  created_at: string;
  expires_at: string | null;
  link_mod_ok: boolean | null;
};

type DryRow = {
  offer_id: string;
  status: string;
  current_offer_url: string | null;
  original_offer_url: string | null;
  resolved_canonical_url: string | null;
  resolved_affiliate_url: string | null;
  classification: Classification;
  reason: string;
};

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
  const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply');
  const apply = process.argv.includes('--apply');
  const liveFirst = process.argv.includes('--live-first');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
  return {
    dryRun: apply ? false : dryRun,
    apply,
    liveFirst,
    limit: Number.isFinite(limit) && limit != null && limit > 0 ? Math.floor(limit) : null,
  };
}

function isMlish(url: string | null | undefined): boolean {
  const u = (url ?? '').toLowerCase();
  return u.includes('mercadolibre.') || u.includes('meli.la');
}

function looksNavigableOriginal(url: string): boolean {
  return isMercadoLibreNavigableProductUrl(url);
}

const ML_AFFILIATE_PARAM_KEYS = ['tag', 'matt_word', 'matt_tool'] as const;

/** Extrae params de afiliado ML presentes en una URL (sin inventar). */
function extractMlAffiliateParams(url: string): Record<string, string> {
  try {
    const u = new URL(url);
    const out: Record<string, string> = {};
    for (const key of ML_AFFILIATE_PARAM_KEYS) {
      const v = u.searchParams.get(key)?.trim();
      if (v) out[key] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Tras el resolver canónico: si el env local no aplicó tags, conserva los params
 * históricos ya presentes en el offer_url bare (sin inventar valores nuevos).
 */
function preserveHistoricalAffiliateParams(sourceUrl: string, resolvedUrl: string): string {
  const fromSource = extractMlAffiliateParams(sourceUrl);
  if (Object.keys(fromSource).length === 0) return resolvedUrl;
  try {
    const u = new URL(resolvedUrl);
    for (const [key, value] of Object.entries(fromSource)) {
      if (!u.searchParams.get(key)?.trim()) {
        u.searchParams.set(key, value);
      }
    }
    return u.toString();
  } catch {
    return resolvedUrl;
  }
}

function hasExpectedAffiliateParams(url: string, expectedFrom: string): boolean {
  const expected = extractMlAffiliateParams(expectedFrom);
  if (Object.keys(expected).length === 0) return true;
  const actual = extractMlAffiliateParams(url);
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) return false;
  }
  return true;
}

async function classifyRow(row: OfferRow): Promise<DryRow> {
  const current = (row.offer_url ?? '').trim() || null;
  const original = (row.original_offer_url ?? '').trim() || null;

  if (!isMlish(current) && !isMlish(original)) {
    return {
      offer_id: row.id,
      status: row.status,
      current_offer_url: current,
      original_offer_url: original,
      resolved_canonical_url: null,
      resolved_affiliate_url: null,
      classification: 'SKIP_NOT_ML',
      reason: 'not_ml',
    };
  }

  if (current && isMercadoLibreNavigableProductUrl(current) && !isMercadoLibreBareItemPathUrl(current)) {
    return {
      offer_id: row.id,
      status: row.status,
      current_offer_url: current,
      original_offer_url: original,
      resolved_canonical_url: null,
      resolved_affiliate_url: null,
      classification: 'SKIP_ALREADY_VALID',
      reason: 'offer_url_already_navigable',
    };
  }

  if (!current || !isMercadoLibreBareItemPathUrl(current)) {
    return {
      offer_id: row.id,
      status: row.status,
      current_offer_url: current,
      original_offer_url: original,
      resolved_canonical_url: null,
      resolved_affiliate_url: null,
      classification: 'SKIP_UNKNOWN',
      reason: 'offer_url_not_bare_invalid',
    };
  }

  if (!original) {
    return {
      offer_id: row.id,
      status: row.status,
      current_offer_url: current,
      original_offer_url: original,
      resolved_canonical_url: null,
      resolved_affiliate_url: null,
      classification: 'SKIP_UNKNOWN',
      reason: 'missing_original_offer_url',
    };
  }

  if (!looksNavigableOriginal(original)) {
    return {
      offer_id: row.id,
      status: row.status,
      current_offer_url: current,
      original_offer_url: original,
      resolved_canonical_url: null,
      resolved_affiliate_url: null,
      classification: 'SKIP_INVALID_SOURCE',
      reason: 'original_not_navigable_permalink',
    };
  }

  const resolved = resolveMercadoLibreItem(original);
  const canonical = resolved?.canonicalUrl?.trim() || null;
  if (!canonical || isMercadoLibreBareItemPathUrl(canonical) || !isMercadoLibreNavigableProductUrl(canonical)) {
    return {
      offer_id: row.id,
      status: row.status,
      current_offer_url: current,
      original_offer_url: original,
      resolved_canonical_url: canonical,
      resolved_affiliate_url: null,
      classification: 'SKIP_RESOLUTION_FAILURE',
      reason: 'canonical_null_or_bare',
    };
  }

  // Pathname must remain under /p/ or articulo MLM- form from original.
  try {
    const origPath = new URL(original).pathname;
    const canPath = new URL(canonical).pathname;
    const origHasP = /\/p\//i.test(origPath);
    const canHasP = /\/p\//i.test(canPath);
    const origArticulo = /\/ML[A-Z]{1,3}-\d+/i.test(origPath);
    const canArticulo = /\/ML[A-Z]{1,3}-\d+/i.test(canPath);
    if (origHasP && !canHasP) {
      return {
        offer_id: row.id,
        status: row.status,
        current_offer_url: current,
        original_offer_url: original,
        resolved_canonical_url: canonical,
        resolved_affiliate_url: null,
        classification: 'SKIP_RESOLUTION_FAILURE',
        reason: 'pathname_p_not_preserved',
      };
    }
    if (origArticulo && !canArticulo && !canHasP) {
      return {
        offer_id: row.id,
        status: row.status,
        current_offer_url: current,
        original_offer_url: original,
        resolved_canonical_url: canonical,
        resolved_affiliate_url: null,
        classification: 'SKIP_RESOLUTION_FAILURE',
        reason: 'pathname_articulo_not_preserved',
      };
    }
  } catch {
    return {
      offer_id: row.id,
      status: row.status,
      current_offer_url: current,
      original_offer_url: original,
      resolved_canonical_url: canonical,
      resolved_affiliate_url: null,
      classification: 'SKIP_RESOLUTION_FAILURE',
      reason: 'pathname_parse_error',
    };
  }

  let affiliate: string;
  try {
    // Camino canónico de app: original → resolver → affiliate tags (env si existe).
    affiliate = await resolveAndNormalizeAffiliateOfferUrl(original);
  } catch (err) {
    return {
      offer_id: row.id,
      status: row.status,
      current_offer_url: current,
      original_offer_url: original,
      resolved_canonical_url: canonical,
      resolved_affiliate_url: null,
      classification: 'SKIP_RESOLUTION_FAILURE',
      reason: `affiliate_resolve_threw:${err instanceof Error ? err.message : 'error'}`,
    };
  }

  // Sin env local de tags, el resolver no añade tracking; preservar params del bare actual.
  affiliate = preserveHistoricalAffiliateParams(current, affiliate);

  if (!affiliate || isMercadoLibreBareItemPathUrl(affiliate) || !isMercadoLibreNavigableProductUrl(affiliate)) {
    return {
      offer_id: row.id,
      status: row.status,
      current_offer_url: current,
      original_offer_url: original,
      resolved_canonical_url: canonical,
      resolved_affiliate_url: affiliate || null,
      classification: 'SKIP_RESOLUTION_FAILURE',
      reason: 'affiliate_url_not_navigable',
    };
  }

  if (!hasExpectedAffiliateParams(affiliate, current)) {
    return {
      offer_id: row.id,
      status: row.status,
      current_offer_url: current,
      original_offer_url: original,
      resolved_canonical_url: canonical,
      resolved_affiliate_url: affiliate,
      classification: 'SKIP_RESOLUTION_FAILURE',
      reason: 'affiliate_tags_not_preserved',
    };
  }

  if (affiliate === current) {
    return {
      offer_id: row.id,
      status: row.status,
      current_offer_url: current,
      original_offer_url: original,
      resolved_canonical_url: canonical,
      resolved_affiliate_url: affiliate,
      classification: 'SKIP_NO_CHANGE',
      reason: 'same_as_current',
    };
  }

  return {
    offer_id: row.id,
    status: row.status,
    current_offer_url: current,
    original_offer_url: original,
    resolved_canonical_url: canonical,
    resolved_affiliate_url: affiliate,
    classification: 'REPAIRABLE',
    reason: 'bare_offer_url_recoverable_from_original',
  };
}

async function fetchMlOffers(supabase: SupabaseClient): Promise<OfferRow[]> {
  const pageSize = 1000;
  const out: OfferRow[] = [];
  let from = 0;
  for (;;) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('offers')
      .select('id, status, offer_url, original_offer_url, created_at, expires_at, link_mod_ok')
      .or(
        'offer_url.ilike.%mercadolibre%,offer_url.ilike.%meli.la%,original_offer_url.ilike.%mercadolibre%,original_offer_url.ilike.%meli.la%',
      )
      .order('created_at', { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as OfferRow[];
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function applyRepair(
  supabase: SupabaseClient,
  row: DryRow,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (row.classification !== 'REPAIRABLE' || !row.resolved_affiliate_url) {
    return { ok: false, error: 'not_repairable' };
  }

  // Optimistic: only update if offer_url still matches the bare URL we classified.
  const { data, error } = await supabase
    .from('offers')
    .update({ offer_url: row.resolved_affiliate_url })
    .eq('id', row.offer_id)
    .eq('offer_url', row.current_offer_url)
    .select('id, offer_url, original_offer_url, status, created_at, expires_at')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'no_row_updated_race_or_changed' };

  const updated = data as {
    offer_url?: string;
    original_offer_url?: string | null;
    status?: string;
  };
  if (updated.original_offer_url !== row.original_offer_url) {
    return { ok: false, error: 'original_offer_url_changed_unexpectedly' };
  }
  if (updated.status !== row.status) {
    return { ok: false, error: 'status_changed_unexpectedly' };
  }
  return { ok: true };
}

async function main() {
  loadEnvLocal();
  const args = parseArgs();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(process.cwd(), 'tmp', 'ml-url-repair');
  fs.mkdirSync(outDir, { recursive: true });

  console.log(JSON.stringify({ mode: args.apply ? 'APPLY' : 'DRY_RUN', liveFirst: args.liveFirst, limit: args.limit }));

  const offers = await fetchMlOffers(supabase);
  console.log(JSON.stringify({ fetched_ml_offers: offers.length }));

  const classified: DryRow[] = [];
  for (const offer of offers) {
    classified.push(await classifyRow(offer));
  }

  let repairable = classified.filter((r) => r.classification === 'REPAIRABLE');
  if (args.liveFirst) {
    repairable = [
      ...repairable.filter((r) => r.offer_id === LIVE_PRIORITY_ID),
      ...repairable.filter((r) => r.offer_id !== LIVE_PRIORITY_ID),
    ];
  }
  if (args.limit != null) {
    repairable = repairable.slice(0, args.limit);
  }

  const summary = {
    TOTAL_CANDIDATES: classified.length,
    REPAIRABLE: classified.filter((r) => r.classification === 'REPAIRABLE').length,
    SKIP_ALREADY_VALID: classified.filter((r) => r.classification === 'SKIP_ALREADY_VALID').length,
    SKIP_UNKNOWN: classified.filter((r) => r.classification === 'SKIP_UNKNOWN').length,
    SKIP_INVALID_SOURCE: classified.filter((r) => r.classification === 'SKIP_INVALID_SOURCE').length,
    SKIP_RESOLUTION_FAILURE: classified.filter((r) => r.classification === 'SKIP_RESOLUTION_FAILURE')
      .length,
    SKIP_NO_CHANGE: classified.filter((r) => r.classification === 'SKIP_NO_CHANGE').length,
    SKIP_NOT_ML: classified.filter((r) => r.classification === 'SKIP_NOT_ML').length,
    REPAIRABLE_IN_SCOPE: repairable.length,
  };

  const dryPath = path.join(outDir, `dry-run-${stamp}.json`);
  fs.writeFileSync(
    dryPath,
    JSON.stringify({ summary, live: classified.find((r) => r.offer_id === LIVE_PRIORITY_ID) ?? null, rows: classified }, null, 2),
  );
  console.log(JSON.stringify({ dry_run_written: dryPath, summary }, null, 2));

  const live = classified.find((r) => r.offer_id === LIVE_PRIORITY_ID);
  if (live) {
    console.log(
      JSON.stringify(
        {
          LIVE: {
            offer_id: live.offer_id,
            classification: live.classification,
            BEFORE: live.current_offer_url,
            AFTER: live.resolved_affiliate_url,
            original_offer_url: live.original_offer_url,
            reason: live.reason,
          },
        },
        null,
        2,
      ),
    );
  }

  if (!args.apply) {
    console.log(JSON.stringify({ stopped: 'dry_run_only', hint: 'Re-run with --apply --live-first' }));
    return;
  }

  // Snapshot for rollback BEFORE writes
  const snapshot = repairable.map((r) => ({
    offer_id: r.offer_id,
    offer_url: r.current_offer_url,
    original_offer_url: r.original_offer_url,
    status: r.status,
    planned_offer_url: r.resolved_affiliate_url,
  }));
  const snapPath = path.join(outDir, `rollback-snapshot-${stamp}.json`);
  fs.writeFileSync(snapPath, JSON.stringify({ created_at: new Date().toISOString(), rows: snapshot }, null, 2));
  console.log(JSON.stringify({ rollback_snapshot: snapPath, rows: snapshot.length }));

  let repaired = 0;
  let errors = 0;
  const results: Array<{ offer_id: string; ok: boolean; error?: string }> = [];

  for (const row of repairable) {
    const res = await applyRepair(supabase, row);
    if (res.ok) {
      repaired += 1;
      results.push({ offer_id: row.offer_id, ok: true });
    } else {
      errors += 1;
      results.push({ offer_id: row.offer_id, ok: false, error: res.error });
      console.error(JSON.stringify({ repair_failed: row.offer_id, error: res.error }));
    }
  }

  const applyPath = path.join(outDir, `apply-result-${stamp}.json`);
  fs.writeFileSync(
    applyPath,
    JSON.stringify({ repaired, errors, results, snapshot: snapPath }, null, 2),
  );
  console.log(JSON.stringify({ apply_written: applyPath, repaired, errors }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
