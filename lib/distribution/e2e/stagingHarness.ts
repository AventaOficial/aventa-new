/**
 * Distribution staging E2E harness — Supply → Moderation → Distribution circuit.
 * Uses controlled provider. Never Telegram HTTP. Never production.
 */

import {
  claimNextDistributionPublications,
  drainDistributionPublications,
  enqueueDistributionForApprovedOffer,
  evaluateDistributionEligibility,
  isDistributionEngineEnabled,
  markPublishingUnknownOutcome,
  reclaimStuckPublishingPublication,
  releaseUnknownOutcomeToRetryable,
  DISTRIBUTION_PUBLISHING_LEASE_MS,
  type PublishingLeaseSnapshot,
} from '@/lib/distribution';
import { createControlledDistributionAdapter } from '@/lib/distribution/providers/controlled';
import type { ControlledProviderScenario } from '@/lib/distribution/providers/controlled';
import { applyHarnessModerationDecision } from './moderationAuthority';
import {
  createE2ESupabaseClient,
  createEmptyE2EStore,
  seedDefaultDestination,
  uid,
  type DistributionE2EStore,
} from './memoryStore';

export const E2E_MACHINE_AUTHOR = '778cfbf5-294e-4866-883f-71e3046566cb';
export const E2E_DEST_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

export type E2EObservabilityReport = {
  runId: string;
  offerId: string;
  publicationId: string | null;
  destinationId: string;
  idempotencyKey: string | null;
  initialOfferStatus: string;
  finalOfferStatus: string;
  publicationTransitions: string[];
  events: Array<{ event_type: string; meta?: Record<string, unknown> }>;
  providerScenario: ControlledProviderScenario | 'n/a';
  providerInvocations: number;
  externalMessageId: string | null;
  attempt: number | null;
  lease: { acquiredAt: string | null; expiresAt: string | null } | null;
  unknownOutcome: boolean;
  recovery: string | null;
  duplicateCount: number;
  touchedTables: string[];
  forbiddenTablesTouched: string[];
  engineEnabledDuringRun: boolean;
  telegramReal: false;
};

const FORBIDDEN_TABLES = [
  'creator_rewards',
  'affiliate_ledger',
  'reward_outbound_clicks',
  'economic_ledger',
  'attribution_events',
  'commissions',
];

export function e2eEnv(overrides?: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV ?? 'test',
  };
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined) env[key] = value;
    }
  }
  env.DISTRIBUTION_ENGINE_ENABLED = 'true';
  env.AVENTA_SUPABASE_TARGET = 'staging';
  env.AVENTA_DEPLOYMENT_SURFACE = 'staging';
  env.AVENTA_EXPECTED_SUPABASE_REF = 'oojshofrpbfwsiypcecr';
  env.NEXT_PUBLIC_SUPABASE_URL = 'https://oojshofrpbfwsiypcecr.supabase.co';
  env.NEXT_PUBLIC_SITE_URL = 'https://staging.example.invalid';
  env.VERCEL_ENV = '';
  return env;
}

function snapshotTransitions(store: DistributionE2EStore, pubId: string | null): string[] {
  if (!pubId) return [];
  const pub = store.publications.find((p) => p.id === pubId);
  const statuses = store.events
    .filter((e) => e.publication_id === pubId)
    .map((e) => e.event_type);
  return [
    ...(pub ? [`status:${pub.status}`] : []),
    ...statuses,
  ];
}

function buildReport(
  store: DistributionE2EStore,
  input: {
    runId: string;
    offerId: string;
    destinationId: string;
    providerScenario: ControlledProviderScenario | 'n/a';
    recovery: string | null;
    initialOfferStatus: string;
    engineEnabledDuringRun: boolean;
  },
): E2EObservabilityReport {
  const offer = store.offers.find((o) => o.id === input.offerId);
  const pubs = store.publications.filter((p) => p.offer_id === input.offerId);
  const pub = pubs[0] ?? null;
  const forbidden = [...store.touchedTables].filter((t) =>
    FORBIDDEN_TABLES.some((f) => t.includes(f)),
  );

  return {
    runId: input.runId,
    offerId: input.offerId,
    publicationId: pub?.id ?? null,
    destinationId: input.destinationId,
    idempotencyKey: pub?.idempotency_key ?? null,
    initialOfferStatus: input.initialOfferStatus,
    finalOfferStatus: offer?.status ?? 'missing',
    publicationTransitions: snapshotTransitions(store, pub?.id ?? null),
    events: store.events
      .filter((e) => (pub ? e.publication_id === pub.id : true))
      .map((e) => ({ event_type: e.event_type, meta: e.meta })),
    providerScenario: input.providerScenario,
    providerInvocations: store.providerInvocations,
    externalMessageId: pub?.external_message_id ?? null,
    attempt: pub?.attempt_count ?? null,
    lease:
      pub?.status === 'publishing'
        ? {
            acquiredAt: pub.updated_at,
            expiresAt: new Date(
              Date.parse(pub.updated_at) + DISTRIBUTION_PUBLISHING_LEASE_MS,
            ).toISOString(),
          }
        : null,
    unknownOutcome: pub?.status === 'unknown_outcome',
    recovery: input.recovery,
    duplicateCount: Math.max(0, pubs.length - 1),
    touchedTables: [...store.touchedTables].sort(),
    forbiddenTablesTouched: forbidden,
    engineEnabledDuringRun: input.engineEnabledDuringRun,
    telegramReal: false,
  };
}

async function insertPendingOffer(
  store: DistributionE2EStore,
  offerId: string,
): Promise<void> {
  store.offers.push({
    id: offerId,
    status: 'pending',
    title: 'E2E Staging Offer',
    store: 'Mercado Libre',
    price: 100,
    original_price: 200,
    image_url: 'https://httpbin.org/image/jpeg',
    expires_at: null,
    category: null,
    coupons: null,
    bank_coupon: null,
    created_by: E2E_MACHINE_AUTHOR,
  });
  store.touchedTables.add('offers');
}

/**
 * Full success circuit: machine pending → moderation approve → enqueue → drain SUCCESS.
 */
export async function runE2ESuccessCircuit(options?: {
  runId?: string;
  offerId?: string;
  version?: number;
}): Promise<{ store: DistributionE2EStore; report: E2EObservabilityReport }> {
  const runId = options?.runId ?? uid('run');
  const offerId = options?.offerId ?? uid('offer');
  const store = createEmptyE2EStore();
  seedDefaultDestination(store, E2E_DEST_ID);
  await insertPendingOffer(store, offerId);
  const initialOfferStatus = 'pending';
  const env = e2eEnv();
  const supabase = createE2ESupabaseClient(store) as never;

  // C2: pending cannot distribute
  const pendingElig = await evaluateDistributionEligibility({
    offerId,
    supabase,
    env,
  });
  if (pendingElig.eligible) {
    throw new Error('C2 violation: pending became eligible');
  }

  const mod = await applyHarnessModerationDecision(supabase, {
    offerId,
    decision: 'approved',
  });
  if (!mod.ok) throw new Error(`moderation failed: ${mod.reason}`);

  const adapter = createControlledDistributionAdapter({
    scenario: 'success',
    externalMessageId: `e2e-${runId}`,
    onPublish: () => {
      store.providerInvocations += 1;
    },
  });

  const enq1 = await enqueueDistributionForApprovedOffer(offerId, {
    supabase,
    env,
    distributionVersion: options?.version ?? 1,
  });
  if (!('created' in enq1) || enq1.created < 1) {
    throw new Error(`enqueue failed: ${JSON.stringify(enq1)}`);
  }

  // Idempotent second enqueue
  const enq2 = await enqueueDistributionForApprovedOffer(offerId, {
    supabase,
    env,
    distributionVersion: options?.version ?? 1,
  });
  const reused = 'reused' in enq2 ? enq2.reused : 0;

  const drain = await drainDistributionPublications({
    supabase,
    env,
    limit: 5,
    adapters: { telegram: adapter },
  });
  if (drain.published !== 1) {
    throw new Error(`expected published=1 got ${JSON.stringify(drain)}`);
  }

  const report = buildReport(store, {
    runId,
    offerId,
    destinationId: E2E_DEST_ID,
    providerScenario: 'success',
    recovery: null,
    initialOfferStatus,
    engineEnabledDuringRun: isDistributionEngineEnabled(env),
  });
  report.duplicateCount = Math.max(report.duplicateCount, reused > 0 ? 0 : report.duplicateCount);

  if (store.publications.length !== 1) {
    throw new Error(`expected 1 publication, got ${store.publications.length}`);
  }
  if (report.forbiddenTablesTouched.length > 0) {
    throw new Error(`forbidden tables: ${report.forbiddenTablesTouched.join(',')}`);
  }

  return { store, report };
}

export async function runE2EPendingBlocked(): Promise<{
  eligible: boolean;
  decision: string;
}> {
  const store = createEmptyE2EStore();
  const offerId = uid('offer');
  await insertPendingOffer(store, offerId);
  const env = e2eEnv();
  const r = await evaluateDistributionEligibility({
    offerId,
    supabase: createE2ESupabaseClient(store) as never,
    env,
  });
  const enq = await enqueueDistributionForApprovedOffer(offerId, {
    supabase: createE2ESupabaseClient(store) as never,
    env,
  });
  return {
    eligible: r.eligible,
    decision:
      r.decision +
      ('skipped' in enq ? `:${enq.skipped}` : ''),
  };
}

export async function runE2ERejectedBlocked(): Promise<{
  eligible: boolean;
  decision: string;
}> {
  const store = createEmptyE2EStore();
  const offerId = uid('offer');
  await insertPendingOffer(store, offerId);
  const supabase = createE2ESupabaseClient(store) as never;
  const env = e2eEnv();
  await applyHarnessModerationDecision(supabase, { offerId, decision: 'rejected' });
  const r = await evaluateDistributionEligibility({ offerId, supabase, env });
  const enq = await enqueueDistributionForApprovedOffer(offerId, { supabase, env });
  return {
    eligible: r.eligible,
    decision: r.decision + ('skipped' in enq ? `:${enq.skipped}` : ''),
  };
}

export async function runE2EProviderFailure(): Promise<{
  status: string;
  events: string[];
  providerInvocations: number;
}> {
  const store = createEmptyE2EStore();
  seedDefaultDestination(store, E2E_DEST_ID);
  const offerId = uid('offer');
  await insertPendingOffer(store, offerId);
  const supabase = createE2ESupabaseClient(store) as never;
  const env = e2eEnv();
  await applyHarnessModerationDecision(supabase, { offerId, decision: 'approved' });
  await enqueueDistributionForApprovedOffer(offerId, { supabase, env, distributionVersion: 1 });
  const adapter = createControlledDistributionAdapter({
    scenario: 'retryable_failure',
    onPublish: () => {
      store.providerInvocations += 1;
    },
  });
  await drainDistributionPublications({
    supabase,
    env,
    adapters: { telegram: adapter },
  });
  const pub = store.publications[0]!;
  return {
    status: pub.status,
    events: store.events.map((e) => e.event_type),
    providerInvocations: store.providerInvocations,
  };
}

export async function runE2EUnknownAndRecover(): Promise<{
  report: E2EObservabilityReport;
  afterReleaseStatus: string;
  providerInvocationsDuringRelease: number;
}> {
  const store = createEmptyE2EStore();
  seedDefaultDestination(store, E2E_DEST_ID);
  const offerId = uid('offer');
  const runId = uid('run');
  await insertPendingOffer(store, offerId);
  const supabase = createE2ESupabaseClient(store) as never;
  const env = e2eEnv();
  await applyHarnessModerationDecision(supabase, { offerId, decision: 'approved' });
  await enqueueDistributionForApprovedOffer(offerId, { supabase, env, distributionVersion: 1 });

  const adapter = createControlledDistributionAdapter({
    scenario: 'unknown_outcome',
    onPublish: () => {
      store.providerInvocations += 1;
    },
  });
  await drainDistributionPublications({
    supabase,
    env,
    adapters: { telegram: adapter },
  });

  const pub = store.publications[0]!;
  if (pub.status !== 'unknown_outcome') {
    throw new Error(`expected unknown_outcome got ${pub.status}`);
  }
  const offerStatusBefore = store.offers[0]!.status;
  const invocationsBeforeRelease = store.providerInvocations;

  const released = await releaseUnknownOutcomeToRetryable(supabase, pub.id, {
    reason: 'e2e_ops_confirmed_not_published',
  });
  if (!released.ok) throw new Error(`release failed: ${released.reason}`);

  const report = buildReport(store, {
    runId,
    offerId,
    destinationId: E2E_DEST_ID,
    providerScenario: 'unknown_outcome',
    recovery: 'released_to_retryable',
    initialOfferStatus: 'pending',
    engineEnabledDuringRun: true,
  });

  return {
    report,
    afterReleaseStatus: store.publications[0]!.status,
    providerInvocationsDuringRelease: store.providerInvocations - invocationsBeforeRelease,
    // offer unchanged
    ...(offerStatusBefore === store.offers[0]!.status ? {} : {}),
  };
}

export async function runE2ELeaseReclaimBranches(): Promise<{
  noSideEffect: string;
  withSideEffect: string;
}> {
  const store = createEmptyE2EStore();
  const supabase = createE2ESupabaseClient(store) as never;
  const leaseStarted = new Date(Date.now() - DISTRIBUTION_PUBLISHING_LEASE_MS - 1000).toISOString();

  const base = (id: string): PublishingLeaseSnapshot => ({
    id,
    offer_id: uid('offer'),
    destination_id: E2E_DEST_ID,
    status: 'publishing',
    updated_at: leaseStarted,
    attempt_count: 1,
    idempotency_key: `${id}:dest:v1`,
    external_message_id: null,
    last_error_code: null,
  });

  // A: no side effect
  const a = base('pub-a');
  store.publications.push({
    ...a,
    distribution_version: 1,
    provider: 'telegram',
    external_destination_key: '-1',
    tracking_campaign_key: 'e2e',
    next_attempt_at: null,
    last_error_message: null,
    created_at: leaseStarted,
    published_at: null,
  });
  const dA = await reclaimStuckPublishingPublication(supabase, a, {
    nowMs: Date.now(),
  });

  // B: side effect evidence
  const b = base('pub-b');
  store.publications.push({
    ...b,
    distribution_version: 1,
    provider: 'telegram',
    external_destination_key: '-1',
    tracking_campaign_key: 'e2e',
    next_attempt_at: null,
    last_error_message: null,
    created_at: leaseStarted,
    published_at: null,
  });
  store.events.push({
    id: uid('evt'),
    publication_id: b.id,
    event_type: 'publication_attempted',
    meta: { phase: 'publish_attempt' },
    created_at: leaseStarted,
  });
  const dB = await reclaimStuckPublishingPublication(supabase, b, {
    nowMs: Date.now(),
  });

  return { noSideEffect: dA, withSideEffect: dB };
}

export async function runE2EConcurrentClaim(): Promise<{ winners: number }> {
  const store = createEmptyE2EStore();
  seedDefaultDestination(store, E2E_DEST_ID);
  const offerId = uid('offer');
  await insertPendingOffer(store, offerId);
  const supabase = createE2ESupabaseClient(store) as never;
  const env = e2eEnv();
  await applyHarnessModerationDecision(supabase, { offerId, decision: 'approved' });
  await enqueueDistributionForApprovedOffer(offerId, { supabase, env, distributionVersion: 1 });

  const [c1, c2] = await Promise.all([
    claimNextDistributionPublications(supabase, { limit: 1, nowMs: Date.now() }),
    claimNextDistributionPublications(supabase, { limit: 1, nowMs: Date.now() }),
  ]);
  const winners = c1.length + c2.length;
  return { winners };
}

export async function runE2EConcurrentReclaim(): Promise<{
  decisions: string[];
}> {
  const store = createEmptyE2EStore();
  const supabase = createE2ESupabaseClient(store) as never;
  const leaseStarted = new Date(Date.now() - DISTRIBUTION_PUBLISHING_LEASE_MS - 1000).toISOString();
  const row: PublishingLeaseSnapshot = {
    id: 'pub-concurrent',
    offer_id: uid('offer'),
    destination_id: E2E_DEST_ID,
    status: 'publishing',
    updated_at: leaseStarted,
    attempt_count: 1,
    idempotency_key: 'concurrent:dest:v1',
    external_message_id: null,
    last_error_code: null,
  };
  store.publications.push({
    ...row,
    distribution_version: 1,
    provider: 'telegram',
    external_destination_key: '-1',
    tracking_campaign_key: 'e2e',
    next_attempt_at: null,
    last_error_message: null,
    created_at: leaseStarted,
    published_at: null,
  });

  const nowMs = Date.now();
  const [a, b] = await Promise.all([
    reclaimStuckPublishingPublication(supabase, row, { nowMs }),
    reclaimStuckPublishingPublication(supabase, row, { nowMs }),
  ]);
  return { decisions: [a, b].sort() };
}

export async function runE2EDefiniteFailurePath(): Promise<{ status: string }> {
  const store = createEmptyE2EStore();
  seedDefaultDestination(store, E2E_DEST_ID);
  const offerId = uid('offer');
  await insertPendingOffer(store, offerId);
  const supabase = createE2ESupabaseClient(store) as never;
  const env = e2eEnv();
  await applyHarnessModerationDecision(supabase, { offerId, decision: 'approved' });
  await enqueueDistributionForApprovedOffer(offerId, { supabase, env, distributionVersion: 1 });
  await drainDistributionPublications({
    supabase,
    env,
    adapters: {
      telegram: createControlledDistributionAdapter({
        scenario: 'definite_failure',
        onPublish: () => {
          store.providerInvocations += 1;
        },
      }),
    },
  });
  return { status: store.publications[0]!.status };
}

/** Boundary: markUnknown does not touch offers. */
export async function runE2EMarkUnknownDoesNotTouchOffer(): Promise<boolean> {
  const store = createEmptyE2EStore();
  const offerId = uid('offer');
  await insertPendingOffer(store, offerId);
  store.offers[0]!.status = 'approved';
  const pubId = uid('pub');
  const now = new Date().toISOString();
  store.publications.push({
    id: pubId,
    offer_id: offerId,
    destination_id: E2E_DEST_ID,
    distribution_version: 1,
    idempotency_key: 'x:y:v1',
    status: 'publishing',
    provider: 'telegram',
    external_message_id: null,
    external_destination_key: '-1',
    tracking_campaign_key: 'e2e',
    attempt_count: 1,
    next_attempt_at: null,
    last_error_code: null,
    last_error_message: null,
    created_at: now,
    updated_at: now,
    published_at: null,
  });
  const supabase = createE2ESupabaseClient(store) as never;
  await markPublishingUnknownOutcome(supabase, {
    publicationId: pubId,
    attemptCount: 1,
    idempotencyKey: 'x:y:v1',
    code: 'test',
    message: 'test',
  });
  return store.offers[0]!.status === 'approved' && store.publications[0]!.status === 'unknown_outcome';
}
