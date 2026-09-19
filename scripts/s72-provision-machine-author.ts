/**
 * S7.2 — Provision dedicated staging machine author (Auth user + profile).
 *
 * STAGING ONLY. Uses existing Auth authority (no new tables).
 * Does NOT touch production. Does NOT enable machine writes.
 *
 * Usage:
 *   npx tsx scripts/s72-provision-machine-author.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'scripts/_s72_reports');
const MACHINE_EMAIL = 'machine-supply-staging@aventa.internal';
const MACHINE_DISPLAY = 'Aventa Machine Supply (staging)';
const MACHINE_USERNAME = 'aventa_machine_supply';

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

function randomPassword(): string {
  return `ms_${globalThis.crypto.randomUUID().replace(/-/g, '')}_S72`;
}

async function main() {
  loadEnvFile(join(ROOT, '.env.local'));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const ref = url.match(/https:\/\/([^.]+)/)?.[1] ?? null;
  const expected = process.env.AVENTA_EXPECTED_SUPABASE_REF ?? null;
  const target = process.env.AVENTA_SUPABASE_TARGET ?? null;

  const safety = {
    target,
    ref,
    expected,
    refOk: Boolean(expected && ref === expected),
    stagingOnly: target === 'staging',
  };

  if (!safety.stagingOnly || !safety.refOk || !url || !key) {
    console.error('STOP: staging target + matching ref + service role required');
    console.error(JSON.stringify(safety, null, 2));
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  // Reuse if already provisioned (idempotent).
  const { data: listed, error: listErr } = await sb.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) {
    console.error('STOP: cannot list users', listErr.message);
    process.exit(1);
  }

  const existing = (listed.users ?? []).find(
    (u) =>
      u.email?.toLowerCase() === MACHINE_EMAIL ||
      u.user_metadata?.aventa_machine_author === true ||
      u.app_metadata?.aventa_machine_author === true,
  );

  let userId: string;
  let created = false;

  if (existing) {
    userId = existing.id;
  } else {
    const { data: createdUser, error: createErr } = await sb.auth.admin.createUser({
      email: MACHINE_EMAIL,
      password: randomPassword(),
      email_confirm: true,
      user_metadata: {
        aventa_machine_author: true,
        campaign: 'S7.2',
        display_name: MACHINE_DISPLAY,
      },
      app_metadata: {
        aventa_machine_author: true,
        role_hint: 'machine_ingest',
      },
    });
    if (createErr || !createdUser.user) {
      const stop = {
        ok: false,
        campaign: 'S7.2',
        reason: 'auth_create_user_database_error',
        error: createErr?.message ?? 'unknown',
        safety,
        externalActionRequired: [
          'Supabase Dashboard → project oojshofrpbfwsiypcecr (staging)',
          'Auth → Users: confirm only seed user exists',
          'Database → check trigger handle_new_user on auth.users',
          'Postgres logs: error on INSERT into profiles during Auth signup',
          'Repair trigger/profiles constraints so Auth Admin createUser succeeds',
          'Re-run: npx tsx scripts/s72-provision-machine-author.ts',
          'Do NOT reuse S7.1 seed admin 6aa733d4-… as permanent machine author',
        ],
      };
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(join(OUT_DIR, 's72-author-latest.json'), JSON.stringify(stop, null, 2));
      console.error('STOP: createUser failed');
      console.error(JSON.stringify(stop, null, 2));
      process.exit(1);
    }
    userId = createdUser.user.id;
    created = true;
  }

  // Wait briefly for handle_new_user trigger, then upsert profile fields.
  await new Promise((r) => setTimeout(r, 800));

  const { data: profileBefore } = await sb
    .from('profiles')
    .select('id,display_name,username,role')
    .eq('id', userId)
    .maybeSingle();

  if (!profileBefore) {
    const { error: insErr } = await sb.from('profiles').insert({
      id: userId,
      display_name: MACHINE_DISPLAY,
      username: MACHINE_USERNAME,
      role: 'user',
    });
    if (insErr) {
      // Retry update path if race with trigger
      const { error: upErr } = await sb
        .from('profiles')
        .update({
          display_name: MACHINE_DISPLAY,
          username: MACHINE_USERNAME,
        })
        .eq('id', userId);
      if (upErr) {
        console.error('STOP: profile missing and could not create', insErr.message, upErr.message);
        process.exit(1);
      }
    }
  } else {
    await sb
      .from('profiles')
      .update({
        display_name: MACHINE_DISPLAY,
        username: profileBefore.username || MACHINE_USERNAME,
      })
      .eq('id', userId);
  }

  const { data: profile } = await sb
    .from('profiles')
    .select('id,display_name,username,role')
    .eq('id', userId)
    .maybeSingle();

  const report = {
    campaign: 'S7.2',
    mode: 'provision_machine_author',
    at: new Date().toISOString(),
    safety,
    created,
    author: {
      id: userId,
      idPrefix: userId.slice(0, 8),
      email: MACHINE_EMAIL,
      display_name: profile?.display_name ?? MACHINE_DISPLAY,
      username: profile?.username ?? MACHINE_USERNAME,
      role: profile?.role ?? null,
      isAdminSeed: false,
      distinctFromS71Seed: userId !== '6aa733d4-02cb-4c64-92fc-cf45fdcee344',
    },
    envHint: {
      BOT_INGEST_USER_ID: userId,
      note: 'Set process-scoped for controlled window; optional staging Vercel later. Do NOT enable MACHINE_PENDING_WRITES permanently.',
    },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 's72-author-latest.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(OUT_DIR, `s72-author-${Date.now()}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
