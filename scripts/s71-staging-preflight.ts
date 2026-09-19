/**
 * S7.1 — read-only staging precondition check (no writes).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { isMachinePendingWriteEnabled } from '../lib/bots/ingest/machineLiveInsertEligibility';
import { isDistributionEngineEnabled } from '../lib/distribution/constants';

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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const ref = url.match(/https:\/\/([^.]+)/)?.[1] ?? null;
  const expected = process.env.AVENTA_EXPECTED_SUPABASE_REF ?? null;
  const target = process.env.AVENTA_SUPABASE_TARGET ?? null;
  const author =
    process.env.S67_STAGING_CANARY_AUTHOR_ID?.trim() ||
    '6aa733d4-02cb-4c64-92fc-cf45fdcee344';

  const safety = {
    target,
    ref,
    expected,
    refOk: Boolean(expected && ref === expected),
    stagingOnly: target === 'staging',
    writesFlag: isMachinePendingWriteEnabled(),
    distributionEnabled: isDistributionEngineEnabled(process.env),
    authorPrefix: author.slice(0, 8),
    hasUrl: Boolean(url),
    hasServiceRole: Boolean(key),
  };

  if (!safety.stagingOnly || !safety.refOk || !key) {
    console.log(JSON.stringify({ ok: false, safety }, null, 2));
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: profile, error: pErr } = await sb
    .from('profiles')
    .select('id,username,display_name,role')
    .eq('id', author)
    .maybeSingle();

  let authOk: boolean | null = null;
  let authErr: string | null = null;
  try {
    const { data, error } = await sb.auth.admin.getUserById(author);
    authOk = Boolean(data?.user);
    authErr = error?.message ?? null;
  } catch (e) {
    authOk = false;
    authErr = e instanceof Error ? e.message : String(e);
  }

  const { count: pendingCount } = await sb
    .from('offers')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .is('deleted_at', null);

  const { count: authorOffers } = await sb
    .from('offers')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', author);

  console.log(
    JSON.stringify(
      {
        ok: Boolean(profile || authOk),
        safety,
        author: {
          idPrefix: author.slice(0, 8),
          profile: profile
            ? {
                username: profile.username,
                display_name: profile.display_name,
                role: profile.role,
              }
            : null,
          profileError: pErr?.message ?? null,
          authUserExists: authOk,
          authError: authErr,
        },
        stagingPendingCount: pendingCount ?? null,
        authorOfferCount: authorOffers ?? null,
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
