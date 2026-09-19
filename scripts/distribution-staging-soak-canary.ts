/**
 * Distribution staging soak canary — exactly 1 offer × 1 staging destination × real Telegram.
 *
 * Usage:
 *   npx tsx scripts/distribution-staging-soak-canary.ts --dry-run
 *   npx tsx scripts/distribution-staging-soak-canary.ts --execute --offer=<uuid> --version=<n>
 *
 * Guardrails: staging target, allowlisted destination, max 1 publication, process-scoped flag.
 * Leaves process.env DISTRIBUTION_ENGINE_ENABLED unchanged (uses canary env copy).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  buildDistributionIdempotencyKey,
  drainDistributionPublications,
  enqueueDistributionForApprovedOffer,
  evaluateDistributionEligibility,
  isDistributionEngineEnabled,
} from '../lib/distribution';
import {
  STAGING_SOAK_CANARY_DESTINATION_ID,
  assertStagingSoakCanaryGuards,
  buildStagingSoakCanaryEnv,
  isStagingSoakCanaryOfferId,
} from '../lib/distribution/stagingCanary';
import { isMachinePendingWriteEnabled } from '../lib/bots/ingest/machineLiveInsertEligibility';
import { STAGING_SUPABASE_REF } from '../lib/supabase/projectRefs';

function loadEnvFile(p: string) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]!] === undefined) {
      let v = m[2]!;
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      process.env[m[1]!] = v;
    }
  }
}

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

async function countTable(
  supabase: ReturnType<typeof createClient>,
  table: string,
): Promise<number | null> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) return null;
  return count ?? 0;
}

async function main() {
  loadEnvFile(join(process.cwd(), '.env.local'));

  const execute = process.argv.includes('--execute');
  const offerId = (argValue('offer') ?? '').trim();
  const versionRaw = argValue('version');
  const version = versionRaw ? Number(versionRaw) : 20260919;

  if (!isStagingSoakCanaryOfferId(offerId)) {
    console.error('FAIL: --offer=<uuid> required');
    process.exit(1);
  }
  if (!Number.isFinite(version) || version < 1) {
    console.error('FAIL: --version must be >= 1');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) {
    console.error('FAIL: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  // Base client (process env still has Distribution OFF typically)
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const canaryEnv = buildStagingSoakCanaryEnv(process.env);

  const guards = await assertStagingSoakCanaryGuards(supabase, canaryEnv);
  if (!guards.ok) {
    const report = {
      ok: false,
      blocker: true,
      reason: guards.reason,
      at: new Date().toISOString(),
    };
    console.error(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const before = {
    publications: await countTable(supabase, 'distribution_publications'),
    events: await countTable(supabase, 'distribution_events'),
    offers: await countTable(supabase, 'offers'),
    creatorRewards: await countTable(supabase, 'creator_rewards'),
    affiliateLedger: await countTable(supabase, 'affiliate_ledger'),
    rewardOutboundClicks: await countTable(supabase, 'reward_outbound_clicks'),
    economicLedger: await countTable(supabase, 'economic_ledger'),
    attributionEvents: await countTable(supabase, 'attribution_events'),
  };

  const eligibility = await evaluateDistributionEligibility({
    offerId,
    supabase,
    env: canaryEnv,
  });

  const idempotencyKey = buildDistributionIdempotencyKey({
    offerId,
    destinationId: STAGING_SOAK_CANARY_DESTINATION_ID,
    distributionVersion: version,
  });

  const dry = {
    ok: true,
    mode: execute ? 'execute' : 'dry-run',
    guards,
    offerId,
    distributionVersion: version,
    idempotencyKey,
    eligibility,
    processDistributionFlag: isDistributionEngineEnabled(process.env),
    canaryEnvDistributionFlag: isDistributionEngineEnabled(canaryEnv),
    machineWrites: isMachinePendingWriteEnabled(),
    before,
  };

  if (!execute) {
    const dir = join(process.cwd(), 'scripts/_distribution_soak_reports');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'soak-canary-dry-latest.json'), JSON.stringify(dry, null, 2));
    console.log(JSON.stringify(dry, null, 2));
    return;
  }

  if (!eligibility.eligible) {
    console.error(
      JSON.stringify({ ok: false, reason: 'offer_not_eligible', eligibility }, null, 2),
    );
    process.exit(3);
  }

  // Existing row for this triple?
  const { data: existingBefore } = await supabase
    .from('distribution_publications')
    .select('id, status, idempotency_key, external_message_id')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  const enq1 = await enqueueDistributionForApprovedOffer(offerId, {
    supabase,
    env: canaryEnv,
    distributionVersion: version,
  });

  if (!('created' in enq1) && !('reused' in enq1)) {
    console.error(JSON.stringify({ ok: false, phase: 'enqueue', enq1 }, null, 2));
    process.exit(4);
  }

  const created = 'created' in enq1 ? enq1.created : 0;
  const reused = 'reused' in enq1 ? enq1.reused : 0;
  if (created + reused !== 1) {
    console.error(
      JSON.stringify({
        ok: false,
        reason: 'expected_exactly_one_publication_logical',
        enq1,
      }, null, 2),
    );
    process.exit(5);
  }

  // Idempotent second enqueue before drain
  const enq2 = await enqueueDistributionForApprovedOffer(offerId, {
    supabase,
    env: canaryEnv,
    distributionVersion: version,
  });

  const { data: pubsAfterEnq } = await supabase
    .from('distribution_publications')
    .select('id, status, idempotency_key, external_message_id, attempt_count, destination_id')
    .eq('idempotency_key', idempotencyKey);

  if ((pubsAfterEnq ?? []).length !== 1) {
    console.error(
      JSON.stringify({
        ok: false,
        reason: 'duplicate_publication_rows',
        count: (pubsAfterEnq ?? []).length,
      }, null, 2),
    );
    process.exit(6);
  }

  const pub = pubsAfterEnq![0]!;
  if (pub.destination_id !== STAGING_SOAK_CANARY_DESTINATION_ID) {
    console.error(JSON.stringify({ ok: false, reason: 'wrong_destination' }, null, 2));
    process.exit(7);
  }

  // Only drain if still pending/retryable — avoid re-publishing already published
  let drainResult: unknown = { skipped: 'already_terminal' };
  if (pub.status === 'pending' || pub.status === 'retryable') {
    drainResult = await drainDistributionPublications({
      supabase,
      env: canaryEnv,
      limit: 1,
      // Real Telegram adapter via registry (no overrides)
    });
  }

  const { data: pubFinal } = await supabase
    .from('distribution_publications')
    .select(
      'id, status, idempotency_key, external_message_id, attempt_count, destination_id, last_error_code, last_error_message, updated_at, published_at',
    )
    .eq('id', pub.id)
    .maybeSingle();

  const { data: events } = await supabase
    .from('distribution_events')
    .select('event_type, created_at, meta')
    .eq('publication_id', pub.id)
    .order('created_at', { ascending: true })
    .limit(50);

  // Safe event projection — strip secret-like keys
  const safeEvents = (events ?? []).map((e) => {
    const meta = { ...((e.meta as Record<string, unknown>) ?? {}) };
    for (const k of Object.keys(meta)) {
      if (/token|secret|password|credential|authorization|api[_-]?key/i.test(k)) {
        delete meta[k];
      }
    }
    return { event_type: e.event_type, created_at: e.created_at, meta };
  });

  const after = {
    publications: await countTable(supabase, 'distribution_publications'),
    events: await countTable(supabase, 'distribution_events'),
    offers: await countTable(supabase, 'offers'),
    creatorRewards: await countTable(supabase, 'creator_rewards'),
    affiliateLedger: await countTable(supabase, 'affiliate_ledger'),
    rewardOutboundClicks: await countTable(supabase, 'reward_outbound_clicks'),
    economicLedger: await countTable(supabase, 'economic_ledger'),
    attributionEvents: await countTable(supabase, 'attribution_events'),
  };

  const delta = (a: number | null, b: number | null): number | 'not measured' => {
    if (a == null || b == null) return 'not measured';
    return b - a;
  };

  const report = {
    ok: true,
    at: new Date().toISOString(),
    stagingRef: STAGING_SUPABASE_REF,
    guards,
    offerId,
    destinationId: STAGING_SOAK_CANARY_DESTINATION_ID,
    distributionVersion: version,
    idempotencyKey,
    existingBefore,
    enqueue: { first: enq1, second: enq2 },
    drain: drainResult,
    publication: pubFinal,
    events: safeEvents,
    idempotency: {
      rowsForKey: (pubsAfterEnq ?? []).length,
      secondEnqueueReused: 'reused' in enq2 ? enq2.reused >= 1 : false,
      sameKey: pubFinal?.idempotency_key === idempotencyKey,
    },
    firewall: {
      processDistributionFlagAfter: isDistributionEngineEnabled(process.env),
      machineWritesAfter: isMachinePendingWriteEnabled(),
      before,
      after,
      deltas: {
        publications: delta(before.publications, after.publications),
        events: delta(before.events, after.events),
        offers: delta(before.offers, after.offers),
        creatorRewards: delta(before.creatorRewards, after.creatorRewards),
        affiliateLedger: delta(before.affiliateLedger, after.affiliateLedger),
        rewardOutboundClicks: delta(
          before.rewardOutboundClicks,
          after.rewardOutboundClicks,
        ),
        economicLedger: delta(before.economicLedger, after.economicLedger),
        attributionEvents: delta(before.attributionEvents, after.attributionEvents),
      },
    },
    telegramReal: true,
    note: 'Provider call used TELEGRAM_BOT_TOKEN_STAGING against allowlisted staging destination only.',
  };

  const dir = join(process.cwd(), 'scripts/_distribution_soak_reports');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'soak-canary-latest.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error('[soak-canary]', e instanceof Error ? e.message : e);
  process.exit(1);
});
