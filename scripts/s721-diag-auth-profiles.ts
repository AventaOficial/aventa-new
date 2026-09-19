/**
 * S7.2.1 — Diagnose staging profiles schema + Auth createUser failure.
 * STAGING ONLY. No writes to production.
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

async function main() {
  load(join(process.cwd(), '.env.local'));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const ref = url.match(/https:\/\/([^.]+)/)?.[1] ?? null;
  const target = process.env.AVENTA_SUPABASE_TARGET;
  const expected = process.env.AVENTA_EXPECTED_SUPABASE_REF;

  if (target !== 'staging' || ref !== expected || ref !== 'oojshofrpbfwsiypcecr') {
    console.error('STOP: not staging', { target, ref, expected });
    process.exit(1);
  }

  const outDir = join(process.cwd(), 'scripts/_s721_reports');
  mkdirSync(outDir, { recursive: true });

  const openapiRes = await fetch(`${url}/rest/v1/`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/openapi+json',
    },
  });
  const openapi = (await openapiRes.json()) as {
    definitions?: Record<string, { properties?: Record<string, unknown>; required?: string[] }>;
    components?: { schemas?: Record<string, { properties?: Record<string, unknown>; required?: string[] }> };
  };
  const profiles =
    openapi.definitions?.profiles || openapi.components?.schemas?.profiles;
  const props = profiles?.properties ?? {};
  const required = profiles?.required ?? [];

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data: existingProfile } = await sb
    .from('profiles')
    .select('*')
    .eq('id', '6aa733d4-02cb-4c64-92fc-cf45fdcee344')
    .maybeSingle();

  const fake = '11111111-2222-4333-8444-555555555555';
  const insertProbes = [];
  for (const row of [
    { id: fake },
    { id: fake, display_name: 'probe', role: 'user' },
    {
      id: fake,
      display_name: 'probe',
      role: 'user',
      username: `probe_${Date.now()}`,
      level: 1,
    },
    {
      id: fake,
      display_name: 'probe',
      full_name: 'probe',
      role: 'user',
      username: `probe2_${Date.now()}`,
      level: 1,
      join_number: 999999,
      user_number: 999999,
    },
  ] as Record<string, unknown>[]) {
    const { error } = await sb.from('profiles').insert(row);
    insertProbes.push({
      keys: Object.keys(row),
      error: error
        ? {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
          }
        : null,
    });
    if (!error) await sb.from('profiles').delete().eq('id', fake);
  }

  // Auth create with minimal payload
  const email = `s721-diag-${Date.now()}@example.com`;
  const created = await sb.auth.admin.createUser({
    email,
    password: `Diag_${Date.now()}_Aa1!`,
    email_confirm: true,
  });

  const report = {
    at: new Date().toISOString(),
    safety: { target, ref, expected },
    openapiRequired: required,
    openapiColCount: Object.keys(props).length,
    openapiCols: Object.keys(props).sort(),
    existingProfileKeys: existingProfile ? Object.keys(existingProfile).sort() : null,
    existingProfileSample: existingProfile
      ? {
          role: existingProfile.role,
          level: existingProfile.level,
          join_number: existingProfile.join_number,
          user_number: existingProfile.user_number,
          username: existingProfile.username,
          display_name: existingProfile.display_name,
          full_name: existingProfile.full_name,
        }
      : null,
    insertProbes,
    createUser: {
      email,
      userId: created.data.user?.id ?? null,
      error: created.error
        ? {
            message: created.error.message,
            status: created.error.status,
            code: (created.error as { code?: string }).code,
            name: created.error.name,
          }
        : null,
    },
  };

  if (created.data.user?.id) {
    await sb.auth.admin.deleteUser(created.data.user.id);
    report.createUser = { ...report.createUser, cleanedUp: true } as typeof report.createUser;
  }

  writeFileSync(join(outDir, 's721-diag-latest.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
