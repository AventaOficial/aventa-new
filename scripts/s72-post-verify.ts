/**
 * Quick post-S7.2 DB proof for the 5 inserted offers (read-only).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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

async function main() {
  load('.env.local');
  const MACHINE = '778cfbf5-294e-4866-883f-71e3046566cb';
  const ids = [
    '776b4432-057e-4627-aba7-e6f17fe4d5f6',
    'ee0779cb-2df6-47f4-b994-1cc4f8409177',
    'f13920f9-358a-445f-9988-6a3e45b98e59',
    'a1d7c34f-e45d-4dd8-96e8-38d3d83e8ac5',
    'cdb95720-f097-440b-8a9e-af7bd1f3cff9',
  ];
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await sb
    .from('offers')
    .select(
      'id,status,created_by,product_fingerprint,offer_url,price,original_price,image_url,bot_meta,moderator_comment,locked_by',
    )
    .in('id', ids);

  const rows = (data ?? []).map((o) => {
    const meta = (o.bot_meta ?? {}) as Record<string, unknown>;
    const signals = (meta.signals ?? {}) as Record<string, unknown>;
    return {
      id: o.id,
      status: o.status,
      created_by: o.created_by,
      authorOk: o.created_by === MACHINE,
      fp: o.product_fingerprint,
      price: o.price,
      original_price: o.original_price,
      hasUrl: Boolean(o.offer_url),
      hasImage: Boolean(o.image_url),
      provenance: signals.originalPriceProvenance ?? null,
      currentProv: signals.currentPriceProvenance ?? null,
      gateAction: meta.gateAction ?? null,
      source: meta.source ?? null,
      commentPrefix: String(o.moderator_comment || '').slice(0, 40),
      locked_by: o.locked_by,
    };
  });

  const out = {
    error: error?.message ?? null,
    allPending: rows.every((r) => r.status === 'pending'),
    allAuthorOk: rows.every((r) => r.authorOk),
    count: rows.length,
    rows,
    flags: {
      machineWrites: isMachinePendingWriteEnabled(),
      distribution: isDistributionEngineEnabled(),
    },
  };
  mkdirSync('scripts/_s72_reports', { recursive: true });
  writeFileSync(
    'scripts/_s72_reports/s72-post-verify-latest.json',
    JSON.stringify(out, null, 2),
  );
  console.log(JSON.stringify(out, null, 2));
  if (!out.allPending || !out.allAuthorOk || out.count !== 5 || out.flags.machineWrites) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
