/**
 * Post-repair audit + integrity vs rollback snapshot.
 * Read-only. npx tsx scripts/audit-ml-url-repair-post.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  isMercadoLibreBareItemPathUrl,
  isMercadoLibreNavigableProductUrl,
} from '../lib/offers/resolveMercadoLibreItem';

const LIVE_ID = '13ba7460-c56b-45bc-a69f-c3d603f314f8';

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

function isMlish(url: string | null | undefined): boolean {
  const u = (url ?? '').toLowerCase();
  return u.includes('mercadolibre.') || u.includes('meli.la');
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const snapDir = path.join(process.cwd(), 'tmp', 'ml-url-repair');
  const snapFile = fs
    .readdirSync(snapDir)
    .filter((f) => f.startsWith('rollback-snapshot-'))
    .sort()
    .pop();
  if (!snapFile) throw new Error('no rollback snapshot');
  const snap = JSON.parse(fs.readFileSync(path.join(snapDir, snapFile), 'utf8')) as {
    rows: Array<{
      offer_id: string;
      offer_url: string | null;
      original_offer_url: string | null;
      status: string;
      planned_offer_url: string | null;
    }>;
  };

  const ids = snap.rows.map((r) => r.offer_id);
  const integrityBefore = new Map(snap.rows.map((r) => [r.offer_id, r]));

  // Fetch repaired rows with integrity fields
  const repairedNow: Array<Record<string, unknown>> = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error } = await supabase
      .from('offers')
      .select('id, status, offer_url, original_offer_url, created_at, expires_at, link_mod_ok')
      .in('id', chunk);
    if (error) throw new Error(error.message);
    repairedNow.push(...((data ?? []) as Record<string, unknown>[]));
  }

  // Also need created_at/expires from before — re-fetch wasn't in snapshot.
  // Compare original_offer_url + status vs snapshot; offer_url should equal planned.

  let originalChanged = 0;
  let statusChanged = 0;
  let offerUrlMismatch = 0;
  let stillBare = 0;
  for (const row of repairedNow) {
    const before = integrityBefore.get(String(row.id));
    if (!before) continue;
    if (row.original_offer_url !== before.original_offer_url) originalChanged += 1;
    if (row.status !== before.status) statusChanged += 1;
    if (row.offer_url !== before.planned_offer_url) offerUrlMismatch += 1;
    if (typeof row.offer_url === 'string' && isMercadoLibreBareItemPathUrl(row.offer_url)) {
      stillBare += 1;
    }
  }

  // Full ML classification
  const all: Array<{
    id: string;
    status: string;
    offer_url: string | null;
    original_offer_url: string | null;
  }> = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('offers')
      .select('id, status, offer_url, original_offer_url')
      .or(
        'offer_url.ilike.%mercadolibre%,offer_url.ilike.%meli.la%,original_offer_url.ilike.%mercadolibre%,original_offer_url.ilike.%meli.la%',
      )
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < 1000) break;
    from += 1000;
  }

  let VALID = 0;
  let BARE_INVALID = 0;
  let RECOVERABLE_REMAINING = 0;
  let UNKNOWN = 0;
  for (const o of all) {
    const cur = (o.offer_url ?? '').trim();
    const orig = (o.original_offer_url ?? '').trim();
    if (!isMlish(cur) && !isMlish(orig)) continue;
    if (cur && isMercadoLibreNavigableProductUrl(cur) && !isMercadoLibreBareItemPathUrl(cur)) {
      VALID += 1;
      continue;
    }
    if (cur && isMercadoLibreBareItemPathUrl(cur)) {
      BARE_INVALID += 1;
      if (orig && isMercadoLibreNavigableProductUrl(orig)) RECOVERABLE_REMAINING += 1;
      continue;
    }
    UNKNOWN += 1;
  }

  const { data: live } = await supabase
    .from('offers')
    .select('id, status, offer_url, original_offer_url, created_at, expires_at, link_mod_ok')
    .eq('id', LIVE_ID)
    .maybeSingle();

  const applyWindow = '2026-09-15T02:00:00Z';
  const [
    { count: eventsSince },
    { count: clicksSince },
    { count: votesOnRepaired },
    { data: ledgerRows },
    { count: rewardsRows },
    { count: payoutRows },
  ] = await Promise.all([
    supabase
      .from('offer_events')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', applyWindow),
    supabase
      .from('reward_outbound_clicks')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', applyWindow),
    supabase.from('offer_votes').select('*', { count: 'exact', head: true }).in('offer_id', ids),
    supabase.from('affiliate_ledger_entries').select('id, amount_cents, meta, external_ref'),
    supabase.from('creator_rewards').select('*', { count: 'exact', head: true }),
    supabase.from('reward_payouts').select('*', { count: 'exact', head: true }),
  ]);

  const liveRow = live as {
    status?: string;
    expires_at?: string | null;
    offer_url?: string;
  } | null;
  const feedEligible = Boolean(
    liveRow &&
      liveRow.status === 'approved' &&
      (!liveRow.expires_at || liveRow.expires_at >= new Date().toISOString()),
  );

  console.log(
    JSON.stringify(
      {
        snapshot: snapFile,
        repaired_rows_checked: repairedNow.length,
        integrity: {
          original_offer_url_changed: originalChanged,
          status_changed: statusChanged,
          offer_url_vs_planned_mismatch: offerUrlMismatch,
          still_bare_among_repaired: stillBare,
        },
        post_classification: {
          TOTAL_ML: all.length,
          VALID,
          BARE_INVALID,
          RECOVERABLE_REMAINING,
          UNKNOWN,
        },
        LIVE: live,
        feed_eligible: feedEligible,
        money_probe: {
          offer_events_since_apply: eventsSince,
          reward_outbound_clicks_since_apply: clicksSince,
          offer_votes_on_repaired_set: votesOnRepaired,
          affiliate_ledger_rows: ledgerRows?.length ?? 0,
          creator_rewards_rows: rewardsRows,
          reward_payouts_rows: payoutRows,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
