/**
 * Safe backfill: align link_mod_ok with canonical affiliate readiness.
 *
 * ONLY updates:
 *   status = pending
 *   link_mod_ok IS DISTINCT FROM true
 *   offer_url passes evaluateAffiliateReadiness (platform_tagged)
 *
 * Does NOT change status, created_at, expires_at, original_offer_url,
 * money, quality, or evidence fields.
 *
 * Usage:
 *   npx tsx scripts/backfill-affiliate-readiness.ts --dry-run
 *   npx tsx scripts/backfill-affiliate-readiness.ts --apply
 */

import { createClient } from '@supabase/supabase-js';
import {
  evaluateAffiliateReadiness,
  shouldPersistLinkModOk,
} from '../lib/moderation/affiliateReadinessContract';

type Row = {
  id: string;
  offer_url: string | null;
  original_offer_url: string | null;
  link_mod_ok: boolean | null;
  status: string;
};

function loadEnvLocal() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const envPath = path.join(process.cwd(), '.env.local');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      const key = m[1]!;
      let val = m[2]!;
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* ignore */
  }
}

async function main() {
  loadEnvLocal();
  const dryRun = !process.argv.includes('--apply');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE URL / SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from('offers')
    .select('id, offer_url, original_offer_url, link_mod_ok, status')
    .eq('status', 'pending')
    .or('link_mod_ok.is.null,link_mod_ok.eq.false');

  if (error) {
    console.error('select failed', error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as Row[];
  const alreadyReady = 0; // we only selected not-true
  let eligible: Row[] = [];
  let notEligible = 0;
  let unknown = 0;

  for (const row of rows) {
    try {
      const ok = shouldPersistLinkModOk({
        offerUrl: row.offer_url,
        originalOfferUrl: row.original_offer_url,
        linkModOk: false,
      });
      const ev = evaluateAffiliateReadiness({
        offerUrl: row.offer_url,
        originalOfferUrl: row.original_offer_url,
        linkModOk: false,
      });
      if (ok && ev.source === 'platform_tagged') {
        eligible.push(row);
      } else {
        notEligible += 1;
      }
    } catch {
      unknown += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? 'dry-run' : 'apply',
        scanned_not_true: rows.length,
        eligible: eligible.length,
        not_eligible: notEligible,
        already_ready_skipped: alreadyReady,
        unknown_error: unknown,
        sample_eligible_ids: eligible.slice(0, 10).map((r) => r.id),
      },
      null,
      2
    )
  );

  if (dryRun) {
    console.log('Dry-run only. Re-run with --apply to update.');
    return;
  }

  let updated = 0;
  const chunk = 50;
  for (let i = 0; i < eligible.length; i += chunk) {
    const ids = eligible.slice(i, i + chunk).map((r) => r.id);
    const { data: touched, error: updErr } = await supabase
      .from('offers')
      .update({ link_mod_ok: true })
      .in('id', ids)
      .eq('status', 'pending')
      .or('link_mod_ok.is.null,link_mod_ok.eq.false')
      .select('id');
    if (updErr) {
      console.error('update failed', updErr.message);
      process.exit(1);
    }
    updated += (touched ?? []).length;
  }

  console.log(JSON.stringify({ applied: updated }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
