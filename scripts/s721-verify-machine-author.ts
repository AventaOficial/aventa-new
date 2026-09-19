/**
 * S7.2.1 — Verify machine author after Auth repair (no supply execute).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { resolveBotAuthorUserId } from '../lib/bots/ingest/resolveBotAuthorUserId';
import type { BotIngestConfig } from '../lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '../lib/bots/ingest/fetchParsedOfferMetadata';
import { isMachinePendingWriteEnabled } from '../lib/bots/ingest/machineLiveInsertEligibility';
import { isDistributionEngineEnabled } from '../lib/distribution/constants';
import {
  S71_SEED_AUTHOR_ID,
  assertDedicatedMachineAuthor,
} from '../lib/bots/ingest/stagingSupplyWindow';

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
  const authorPath = join(process.cwd(), 'scripts/_s72_reports/s72-author-latest.json');
  const authorJson = JSON.parse(readFileSync(authorPath, 'utf8')) as {
    author: { id: string };
  };
  const machineId = authorJson.author.id;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const ref = url.match(/https:\/\/([^.]+)/)?.[1];
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: authUser, error: authErr } = await sb.auth.admin.getUserById(machineId);
  const { data: profile, error: pErr } = await sb
    .from('profiles')
    .select('id,display_name,username,role,full_name')
    .eq('id', machineId)
    .maybeSingle();

  const { data: listed } = await sb.auth.admin.listUsers({ page: 1, perPage: 100 });
  const users = listed?.users ?? [];

  const cfg = {
    botUserId: machineId,
    botUserIdTech: null,
    botUserIdStaples: null,
    botAuthorDualMode: false,
    techCategoryIdSet: new Set<string>(),
  } as Pick<
    BotIngestConfig,
    | 'botUserId'
    | 'botUserIdTech'
    | 'botUserIdStaples'
    | 'botAuthorDualMode'
    | 'techCategoryIdSet'
  > as BotIngestConfig;

  const meta = {
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1',
    title: 'x',
    store: 'Mercado Libre',
    imageUrl: 'https://x',
    discountPrice: 1,
    originalPrice: 2,
    discountPercent: 50,
  } as ParsedOfferMetadata;

  const resolved = resolveBotAuthorUserId(cfg, meta);
  const dedicated = assertDedicatedMachineAuthor(machineId);

  const report = {
    campaign: 'S7.2.1',
    at: new Date().toISOString(),
    target: process.env.AVENTA_SUPABASE_TARGET,
    ref,
    machineId,
    authUserExists: Boolean(authUser?.user),
    authEmail: authUser?.user?.email ?? null,
    authError: authErr?.message ?? null,
    profile,
    profileError: pErr?.message ?? null,
    roleIsUser: profile?.role === 'user',
    notSeedAdmin: machineId !== S71_SEED_AUTHOR_ID,
    dedicatedCheck: dedicated,
    resolveBotAuthorUserId: resolved,
    resolveMatches: resolved === machineId,
    authUserCount: users.length,
    authUserIds: users.map((u) => ({
      idPrefix: u.id.slice(0, 8),
      email: u.email,
    })),
    exactlyTwoUsers: users.length === 2,
    flags: {
      machineWrites: isMachinePendingWriteEnabled(),
      distribution: isDistributionEngineEnabled(),
    },
  };

  mkdirSync(join(process.cwd(), 'scripts/_s721_reports'), { recursive: true });
  writeFileSync(
    join(process.cwd(), 'scripts/_s721_reports/s721-verify-latest.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));

  if (
    !report.authUserExists ||
    !report.profile ||
    !report.roleIsUser ||
    !report.resolveMatches ||
    !report.dedicatedCheck.ok ||
    report.flags.machineWrites ||
    report.flags.distribution
  ) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
