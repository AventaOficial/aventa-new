/**
 * Day 2 staging canary — classification + safety helpers.
 * Live writes stay in scripts/day2-staging-ingestion-canary.ts.
 */

export type Day2CandidateClass =
  | 'READY'
  | 'PARTIAL'
  | 'BLOCKED'
  | 'FAILED'
  | 'RETRYABLE'
  | 'DUPLICATE';

export type Day2FunnelCounts = {
  candidates: number;
  extracted: number;
  identified: number;
  price_memory_ready: number;
  offer_standard_pass: number;
  dqe_pass: number;
  s61_pass: number;
  s7_pass: number;
  observations_created: number;
  pending_created: number;
  duplicates: number;
  blocked: number;
  failed: number;
  retryable: number;
  ready: number;
  partial: number;
};

export function emptyDay2FunnelCounts(): Day2FunnelCounts {
  return {
    candidates: 0,
    extracted: 0,
    identified: 0,
    price_memory_ready: 0,
    offer_standard_pass: 0,
    dqe_pass: 0,
    s61_pass: 0,
    s7_pass: 0,
    observations_created: 0,
    pending_created: 0,
    duplicates: 0,
    blocked: 0,
    failed: 0,
    retryable: 0,
    ready: 0,
    partial: 0,
  };
}

export function classifyDay2Candidate(input: {
  extracted: boolean;
  identified: boolean;
  historyReady: boolean;
  offerStandardRanked: boolean;
  dqePass: boolean;
  s61Pass: boolean;
  liveStatus?: string | null;
  skipReason?: string | null;
}): Day2CandidateClass {
  const status = (input.liveStatus || '').toLowerCase();
  const reason = (input.skipReason || '').toLowerCase();

  if (status === 'duplicate' || reason.includes('duplicate')) return 'DUPLICATE';
  if (status === 'inserted') return 'READY';
  if (
    reason.includes('retry') ||
    reason.includes('timeout') ||
    reason.includes('rate_limit') ||
    reason.includes('source_blocked')
  ) {
    return 'RETRYABLE';
  }
  if (!input.extracted || status === 'error' || reason.includes('fail_closed')) {
    return 'FAILED';
  }
  if (input.s61Pass && input.dqePass && status !== 'inserted') {
    return 'BLOCKED';
  }
  if (input.extracted && input.identified && !input.s61Pass) {
    return input.historyReady ? 'BLOCKED' : 'PARTIAL';
  }
  if (input.extracted && !input.identified) return 'PARTIAL';
  return 'BLOCKED';
}

export type Day2SafetySnapshot = {
  target: string | null;
  ref: string | null;
  expected: string | null;
  stagingOnly: boolean;
  refOk: boolean;
  writesFlagBefore: boolean;
  moneyPathFlags: {
    REWARDS_PROGRAM_ACTIVE: string;
    COMMISSION_PROGRAM_ACTIVE: string;
    SETTLEMENT_BRIDGE_ENABLED: string;
    DISTRIBUTION_ENGINE_ENABLED: string;
    MONEY_PATH_FROZEN: string;
    BOT_INGEST_MACHINE_PENDING_WRITES: string;
    HUNTER_AUTO_PUBLISH: string;
  };
};

export function readDay2SafetySnapshot(env: NodeJS.ProcessEnv = process.env): Day2SafetySnapshot {
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const ref = url.match(/https:\/\/([^.]+)/)?.[1] ?? null;
  const expected = env.AVENTA_EXPECTED_SUPABASE_REF ?? null;
  const target = env.AVENTA_SUPABASE_TARGET ?? null;
  return {
    target,
    ref,
    expected,
    stagingOnly: target === 'staging',
    refOk: Boolean(expected && ref === expected),
    writesFlagBefore: (() => {
      const v = (env.BOT_INGEST_MACHINE_PENDING_WRITES ?? '').trim().toLowerCase();
      return v === '1' || v === 'true' || v === 'yes';
    })(),
    moneyPathFlags: {
      REWARDS_PROGRAM_ACTIVE: env.REWARDS_PROGRAM_ACTIVE ?? '(unset)',
      COMMISSION_PROGRAM_ACTIVE: env.COMMISSION_PROGRAM_ACTIVE ?? '(unset)',
      SETTLEMENT_BRIDGE_ENABLED: env.SETTLEMENT_BRIDGE_ENABLED ?? '(unset)',
      DISTRIBUTION_ENGINE_ENABLED: env.DISTRIBUTION_ENGINE_ENABLED ?? '(unset)',
      MONEY_PATH_FROZEN: env.MONEY_PATH_FROZEN ?? '(unset)',
      BOT_INGEST_MACHINE_PENDING_WRITES: env.BOT_INGEST_MACHINE_PENDING_WRITES ?? '(unset)',
      HUNTER_AUTO_PUBLISH: env.HUNTER_AUTO_PUBLISH ?? '(unset)',
    },
  };
}

export function assertDay2StagingWritable(safety: Day2SafetySnapshot): {
  ok: boolean;
  error: string | null;
} {
  if (!safety.stagingOnly) {
    return { ok: false, error: 'AVENTA_SUPABASE_TARGET must be staging' };
  }
  if (!safety.refOk) {
    return { ok: false, error: 'Supabase ref must match AVENTA_EXPECTED_SUPABASE_REF' };
  }
  if (safety.writesFlagBefore) {
    return {
      ok: false,
      error: 'BOT_INGEST_MACHINE_PENDING_WRITES already ON — refuse canary',
    };
  }
  const moneyOn = (v: string) => {
    const x = v.trim().toLowerCase();
    return x === '1' || x === 'true' || x === 'yes' || x === 'on';
  };
  if (moneyOn(safety.moneyPathFlags.REWARDS_PROGRAM_ACTIVE)) {
    return { ok: false, error: 'REWARDS_PROGRAM_ACTIVE must be OFF' };
  }
  if (moneyOn(safety.moneyPathFlags.COMMISSION_PROGRAM_ACTIVE)) {
    return { ok: false, error: 'COMMISSION_PROGRAM_ACTIVE must be OFF' };
  }
  if (moneyOn(safety.moneyPathFlags.SETTLEMENT_BRIDGE_ENABLED)) {
    return { ok: false, error: 'SETTLEMENT_BRIDGE_ENABLED must be OFF' };
  }
  if (moneyOn(safety.moneyPathFlags.DISTRIBUTION_ENGINE_ENABLED)) {
    return { ok: false, error: 'DISTRIBUTION_ENGINE_ENABLED must be OFF' };
  }
  if (moneyOn(safety.moneyPathFlags.HUNTER_AUTO_PUBLISH)) {
    return { ok: false, error: 'HUNTER_AUTO_PUBLISH must be OFF' };
  }
  return { ok: true, error: null };
}
