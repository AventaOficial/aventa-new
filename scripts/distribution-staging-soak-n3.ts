/**
 * Thin batch wrapper: N≤3 soak using existing single-offer canary script.
 * No second architecture — only orchestrates + aggregates evidence.
 *
 *   npx tsx scripts/distribution-staging-soak-n3.ts --execute
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  assertStagingSoakCanaryGuards,
  buildStagingSoakCanaryEnv,
  STAGING_SOAK_CANARY_DESTINATION_ID,
} from '../lib/distribution/stagingCanary';
import { isDistributionEngineEnabled } from '../lib/distribution/constants';
import { isMachinePendingWriteEnabled } from '../lib/bots/ingest/machineLiveInsertEligibility';
import { listDistributionOpsPublications } from '../lib/distribution/opsSurface';

const VERSION = 20260920;
const MAX_N = 3;

/** Approved staging offers without this version on allowlisted dest (selected). */
const OFFER_IDS = [
  'd3333333-3333-4333-8333-3333333333a4',
  'd3333333-3333-4333-8333-3333333333a1',
  'd3333333-3333-4333-8333-333333333301',
] as const;

function loadEnvFile(p: string) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]!] !== undefined) continue;
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

function delta(a: number | null, b: number | null): number | 'not measured' {
  if (a == null || b == null) return 'not measured';
  return b - a;
}

async function main() {
  loadEnvFile(join(process.cwd(), '.env.local'));
  const execute = process.argv.includes('--execute');

  if (OFFER_IDS.length > MAX_N) {
    console.error('FAIL: offer list exceeds cap 3');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) {
    console.error('FAIL: missing supabase env');
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const canaryEnv = buildStagingSoakCanaryEnv(process.env);
  const guards = await assertStagingSoakCanaryGuards(supabase, canaryEnv);
  if (!guards.ok) {
    console.error(JSON.stringify({ ok: false, blocker: true, reason: guards.reason }, null, 2));
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

  if (!execute) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: 'dry-run',
          n: OFFER_IDS.length,
          version: VERSION,
          offers: OFFER_IDS,
          destinationId: STAGING_SOAK_CANARY_DESTINATION_ID,
          guards,
          before,
          processFlag: isDistributionEngineEnabled(process.env),
        },
        null,
        2,
      ),
    );
    return;
  }

  const runs: Array<Record<string, unknown>> = [];
  for (const offerId of OFFER_IDS) {
    const r = spawnSync(
      'npx',
      [
        'tsx',
        'scripts/distribution-staging-soak-canary.ts',
        '--execute',
        `--offer=${offerId}`,
        `--version=${VERSION}`,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        shell: true,
        env: process.env,
      },
    );
    if (r.status !== 0) {
      console.error(r.stdout || r.stderr);
      process.exit(r.status ?? 1);
    }
    try {
      runs.push(JSON.parse(r.stdout) as Record<string, unknown>);
    } catch {
      runs.push({ raw: r.stdout, parseError: true });
    }
  }

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

  // Ops surface check for this version's pubs
  const ops = await listDistributionOpsPublications(supabase, {
    filter: 'published',
    limit: 20,
    env: process.env,
  });
  const soakPubs = ops.publications.filter((p) =>
    OFFER_IDS.includes(p.offerId as (typeof OFFER_IDS)[number]),
  ).filter((p) => p.distributionVersion === VERSION);

  // Extra idempotency proof on first offer (enqueue-only, no Telegram)
  const first = runs[0] as {
    idempotency?: { rowsForKey?: number; secondEnqueueReused?: boolean; sameKey?: boolean };
    publication?: { id?: string; status?: string; external_message_id?: string | null };
    offerId?: string;
  };

  const report = {
    ok: true,
    at: new Date().toISOString(),
    n: OFFER_IDS.length,
    version: VERSION,
    destinationId: STAGING_SOAK_CANARY_DESTINATION_ID,
    guards,
    offers: OFFER_IDS,
    executions: runs.map((run) => {
      const r = run as {
        offerId?: string;
        publication?: {
          id?: string;
          status?: string;
          external_message_id?: string | null;
          idempotency_key?: string;
        };
        idempotency?: Record<string, unknown>;
        drain?: Record<string, unknown>;
      };
      return {
        offerId: r.offerId,
        publicationId: r.publication?.id ?? null,
        status: r.publication?.status ?? null,
        externalMessageId: r.publication?.external_message_id ?? null,
        idempotencyKey: r.publication?.idempotency_key ?? null,
        idempotency: r.idempotency ?? null,
        drain: r.drain ?? null,
      };
    }),
    opsSurface: {
      engineEnabled: ops.engineEnabled,
      matched: soakPubs.map((p) => ({
        id: p.id,
        status: p.status,
        operatorStatus: p.operatorStatus,
        destinationId: p.destinationId,
        externalMessageId: p.externalMessageId,
        lastEvent: p.lastEvent?.eventType ?? null,
        requiresOperatorReconcile: p.requiresOperatorReconcile,
      })),
    },
    idempotencySample: first?.idempotency ?? null,
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
    distributionStagingStatus: 'CLOSED_PENDING_VALIDATION',
  };

  const dir = join(process.cwd(), 'scripts/_distribution_soak_reports');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'soak-n3-latest.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error('[soak-n3]', e instanceof Error ? e.message : e);
  process.exit(1);
});
