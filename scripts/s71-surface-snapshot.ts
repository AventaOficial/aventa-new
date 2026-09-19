/**
 * S7.1 — surface snapshot before/after canary (read-only counts).
 * Usage: npx tsx scripts/s71-surface-snapshot.ts [label]
 */
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

async function count(
  sb: ReturnType<typeof createClient>,
  table: string,
  filter?: (q: any) => any,
): Promise<{ count: number | null; error: string | null }> {
  let q = sb.from(table).select('id', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count, error } = await q;
  return { count: count ?? null, error: error?.message ?? null };
}

async function main() {
  load('.env.local');
  const label = process.argv[2] || 'snap';
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const tables = [
    'offers',
    'distribution_publications',
    'distribution_events',
    'distribution_destinations',
    'reward_ledger_entries',
    'rewards_ledger',
    'user_rewards',
    'economy_ledger_entries',
    'ledger_entries',
    'attribution_events',
    'click_attributions',
    'affiliate_attributions',
    'telegram_outbox',
    'publication_jobs',
  ];

  const out: Record<string, unknown> = {
    label,
    at: new Date().toISOString(),
    target: process.env.AVENTA_SUPABASE_TARGET,
    ref: (process.env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([^.]+)/)?.[1],
    counts: {} as Record<string, number | null>,
    errors: {} as Record<string, string>,
  };

  for (const t of tables) {
    const r = await count(sb, t);
    (out.counts as Record<string, number | null>)[t] = r.count;
    if (r.error) (out.errors as Record<string, string>)[t] = r.error;
  }

  const pending = await count(sb, 'offers', (q) =>
    q.eq('status', 'pending').is('deleted_at', null),
  );
  (out.counts as Record<string, number | null>).offers_pending = pending.count;
  if (pending.error) (out.errors as Record<string, string>).offers_pending = pending.error;

  const dir = join(process.cwd(), 'scripts/_s71_reports');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `s71-snap-${label}-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(out, null, 2));
  writeFileSync(join(dir, `s71-snap-${label}-latest.json`), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ path, ...out }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
