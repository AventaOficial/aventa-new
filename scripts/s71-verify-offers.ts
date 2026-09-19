/**
 * S7.1 — post-canary verification of inserted offers + surface deltas.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { isMachinePendingWriteEnabled } from '../lib/bots/ingest/machineLiveInsertEligibility';
import { isDistributionEngineEnabled } from '../lib/distribution/constants';

function load(p: string) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    if (process.env[m[1].trim()] == null) process.env[m[1].trim()] = v;
  }
}

async function count(sb: ReturnType<typeof createClient>, table: string) {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
  return { count: count ?? null, error: error?.message ?? null, missing: Boolean(error) };
}

async function main() {
  load('.env.local');
  const offerIds = [
    '2af71ce8-1dfa-4c6f-ba59-242da382370e',
    '29d3a499-c76b-4bd0-8a33-47b3d4b8f228',
    '8c92bbcf-f411-4226-8523-0ea06d880ea2',
  ];
  const beforePath = join(
    process.cwd(),
    'scripts/_s71_reports/s71-snap-before-latest.json',
  );
  const before = existsSync(beforePath)
    ? (JSON.parse(readFileSync(beforePath, 'utf8')) as { counts: Record<string, number | null> })
    : null;

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: rows, error } = await sb
    .from('offers')
    .select(
      'id,status,created_by,product_fingerprint,offer_url,original_offer_url,price,original_price,discount_percent,image_url,store,bot_meta,moderator_comment,source,created_at,locked_by,locked_at',
    )
    .in('id', offerIds);

  const surfaces = [
    'offers',
    'distribution_publications',
    'distribution_events',
    'distribution_destinations',
    'creator_rewards',
    'affiliate_ledger_entries',
    'affiliate_conversions',
    'affiliate_commissions',
    'reward_outbound_clicks',
    'offer_events',
  ];
  const afterCounts: Record<string, number | null> = {};
  const surfaceErrors: Record<string, string> = {};
  for (const t of surfaces) {
    const r = await count(sb, t);
    afterCounts[t] = r.count;
    if (r.error) surfaceErrors[t] = r.error;
  }
  const pending = await sb
    .from('offers')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .is('deleted_at', null);
  afterCounts.offers_pending = pending.count ?? null;

  const deltas: Record<string, number | null> = {};
  if (before?.counts) {
    for (const k of Object.keys(afterCounts)) {
      const a = before.counts[k];
      const b = afterCounts[k];
      // map before snap keys
      const beforeKey =
        k === 'offers'
          ? 'offers'
          : k === 'offers_pending'
            ? 'offers_pending'
            : k;
      const a2 = before.counts[beforeKey] ?? a;
      deltas[k] = a2 != null && b != null ? b - a2 : null;
    }
  }

  const proofs = (rows ?? []).map((o) => {
    const meta = (o.bot_meta ?? {}) as Record<string, unknown>;
    const gate = meta.gate ?? meta.machineGate ?? meta.quality ?? null;
    return {
      id: o.id,
      status: o.status,
      created_by_prefix: String(o.created_by || '').slice(0, 8),
      product_fingerprint: o.product_fingerprint,
      offer_url: o.offer_url ? '[present]' : null,
      original_offer_url: o.original_offer_url ? '[present]' : null,
      price: o.price,
      original_price: o.original_price,
      discount_percent: o.discount_percent,
      image_url: o.image_url ? '[present]' : null,
      store: o.store,
      has_bot_meta: Boolean(o.bot_meta),
      moderator_comment_prefix: String(o.moderator_comment || '').slice(0, 40),
      bot_meta_keys: o.bot_meta ? Object.keys(o.bot_meta as object).slice(0, 30) : [],
      provenance:
        (meta.originalPriceProvenance as string | undefined) ??
        (meta.priceProvenance as string | undefined) ??
        ((meta.signals as Record<string, unknown> | undefined)?.originalPriceProvenance as
          | string
          | undefined) ??
        null,
      gateDecision:
        (gate as Record<string, unknown> | null)?.qualityDecision ??
        meta.qualityDecision ??
        meta.gateReason ??
        null,
      locked_by: o.locked_by,
    };
  });

  const report = {
    campaign: 'S7.1',
    at: new Date().toISOString(),
    flags: {
      machineWrites: isMachinePendingWriteEnabled(),
      distribution: isDistributionEngineEnabled(),
    },
    offerFetchError: error?.message ?? null,
    offerCount: rows?.length ?? 0,
    allPending: (rows ?? []).every((r) => r.status === 'pending'),
    proofs,
    afterCounts,
    surfaceErrors,
    deltasVsBeforeSnap: deltas,
  };

  const dir = join(process.cwd(), 'scripts/_s71_reports');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `s71-verify-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  writeFileSync(join(dir, 's71-verify-latest.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ path, ...report }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
