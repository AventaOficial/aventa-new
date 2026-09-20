import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    const key = m[1].trim();
    if (process.env[key] == null) process.env[key] = v;
  }
}

async function main() {
  loadEnvFile(join(process.cwd(), '.env.local'));
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } },
  );
  for (const t of [
    'affiliate_conversions',
    'affiliate_commissions',
    'affiliate_ledger_entries',
    'affiliate_economic_events',
  ]) {
    const c = await sb.from(t).select('*', { count: 'exact', head: true });
    console.log(
      JSON.stringify({
        table: t,
        count: c.count,
        err: c.error?.message ?? null,
        code: c.error?.code ?? null,
      }),
    );
  }
}

main();
