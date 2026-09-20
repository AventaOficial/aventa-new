/**
 * S9 Policy — decision vocabulary and server-side caps.
 * Does NOT score opportunities (S8 owns scoring).
 */

export const SUPPLY_DECISION_CODES = [
  'ELIGIBLE',
  'REJECTED',
  'SUPPRESSED',
  'DUPLICATE',
  'BUDGET_REJECTED',
  'INVALID_PROVENANCE',
  'LOW_QUALITY',
  'RISK_REJECTED',
  'WRITE_BLOCKED',
  'S8_FAILURE',
  'MALFORMED_INPUT',
  'S9_DISABLED',
  'S7_WRITES_DISABLED',
  'INVALID_CONFIG',
  'INVALID_AUTHOR',
  'PRODUCTION_BLOCKED',
] as const;

export type SupplyDecisionCode = (typeof SUPPLY_DECISION_CODES)[number];

export type SupplyDecision = {
  code: SupplyDecisionCode;
  /** True only when code === ELIGIBLE */
  eligible: boolean;
  reasons: string[];
  /** Echo of S8 decision when available */
  s8Decision: string | null;
  s8Score: number | null;
  s8Confidence: number | null;
};

/** Server hard ceilings — CLI may only lower these. */
export const S9_HARD_MAX_CANDIDATES_PER_RUN = 50;
export const S9_HARD_MAX_WRITES_PER_RUN = 5;
export const S9_HARD_MAX_WRITES_PER_SOURCE = 5;

export const S9_DEFAULT_MAX_CANDIDATES_PER_RUN = 20;
export const S9_DEFAULT_MAX_WRITES_PER_RUN = 5;
export const S9_DEFAULT_MAX_WRITES_PER_SOURCE = 3;

export const S9_ENV_ENABLED = 'SUPPLY_AUTOMATION_ENABLED' as const;

export type SupplyAutomationCaps = {
  maxCandidatesPerRun: number;
  maxWritesPerRun: number;
  maxWritesPerSource: number;
};

export function isSupplyAutomationEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = (env[S9_ENV_ENABLED] ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function readIntEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
): number {
  const raw = (env[key] ?? '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return -1;
  return n;
}

/**
 * Resolve caps server-side. Invalid env → null (fail-closed INVALID_CONFIG).
 * `cliCap` may only lower maxWritesPerRun.
 */
export function resolveSupplyAutomationCaps(
  env: NodeJS.ProcessEnv = process.env,
  cliCap?: number | null,
): SupplyAutomationCaps | null {
  const candidates = readIntEnv(
    env,
    'S9_MAX_CANDIDATES_PER_RUN',
    S9_DEFAULT_MAX_CANDIDATES_PER_RUN,
  );
  const writes = readIntEnv(
    env,
    'S9_MAX_WRITES_PER_RUN',
    S9_DEFAULT_MAX_WRITES_PER_RUN,
  );
  const perSource = readIntEnv(
    env,
    'S9_MAX_WRITES_PER_SOURCE',
    S9_DEFAULT_MAX_WRITES_PER_SOURCE,
  );
  if (candidates < 0 || writes < 0 || perSource < 0) return null;

  let maxWritesPerRun = Math.min(writes, S9_HARD_MAX_WRITES_PER_RUN);
  if (cliCap != null && Number.isFinite(cliCap)) {
    const c = Math.max(0, Math.floor(cliCap));
    maxWritesPerRun = Math.min(maxWritesPerRun, c, S9_HARD_MAX_WRITES_PER_RUN);
  }

  return {
    maxCandidatesPerRun: Math.min(candidates, S9_HARD_MAX_CANDIDATES_PER_RUN),
    maxWritesPerRun,
    maxWritesPerSource: Math.min(perSource, S9_HARD_MAX_WRITES_PER_SOURCE),
  };
}

export function decision(
  code: SupplyDecisionCode,
  reasons: string[],
  s8?: { decision?: string | null; score?: number | null; confidence?: number | null },
): SupplyDecision {
  return {
    code,
    eligible: code === 'ELIGIBLE',
    reasons,
    s8Decision: s8?.decision ?? null,
    s8Score: s8?.score ?? null,
    s8Confidence: s8?.confidence ?? null,
  };
}
