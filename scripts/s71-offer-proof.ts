import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

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

async function main() {
  load('.env.local');
  const ids = [
    '2af71ce8-1dfa-4c6f-ba59-242da382370e',
    '29d3a499-c76b-4bd0-8a33-47b3d4b8f228',
    '8c92bbcf-f411-4226-8523-0ea06d880ea2',
  ];
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await sb
    .from('offers')
    .select(
      'id,status,created_by,product_fingerprint,offer_url,original_offer_url,price,original_price,image_url,store,bot_meta,moderator_comment,created_at,locked_by',
    )
    .in('id', ids);

  const tables = [
    'creator_rewards',
    'affiliate_ledger_entries',
    'affiliate_conversions',
    'affiliate_commissions',
    'reward_outbound_clicks',
    'offer_events',
  ] as const;
  const counts: Record<string, { count: number | null; err: string | null }> = {};
  for (const t of tables) {
    const r = await sb.from(t).select('*', { count: 'exact', head: true });
    counts[t] = { count: r.count ?? null, err: r.error?.message ?? null };
  }

  const out = {
    error: error?.message ?? null,
    rows: (data || []).map((o) => {
      const meta = (o.bot_meta ?? {}) as Record<string, unknown>;
      const signals = (meta.signals ?? {}) as Record<string, unknown>;
      return {
        id: o.id,
        status: o.status,
        fp: o.product_fingerprint,
        price: o.price,
        original_price: o.original_price,
        hasImage: Boolean(o.image_url),
        hasUrl: Boolean(o.offer_url),
        created_by: String(o.created_by).slice(0, 8),
        comment: String(o.moderator_comment || '').slice(0, 60),
        provenance: signals.originalPriceProvenance ?? null,
        currentProv: signals.currentPriceProvenance ?? null,
        gateAction: meta.gateAction ?? null,
        gateReason: meta.gateReason ?? null,
        source: meta.source ?? null,
        locked_by: o.locked_by,
      };
    }),
    counts,
  };
  const dir = join(process.cwd(), 'scripts/_s71_reports');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 's71-offer-proof-latest.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
