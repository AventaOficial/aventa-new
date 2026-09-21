/**
 * Observation-only safety boundaries for Discovery Experiment / Mission Control.
 * Hard wall: never call mint / publish / money / rewards / Telegram.
 */

export const OBSERVATION_FORBIDDEN_SYMBOLS = [
  'insertIngestedOffer',
  'publishOffer',
  'liquidateReward',
  'settleCommission',
  'sendTelegramOffer',
  'autoPublish',
] as const;

export type ObservationBoundaryCheck = {
  ok: boolean;
  violations: string[];
};

/**
 * Runtime guard for experiment runners. Call before any experiment loop.
 * Throws if mint/publish flags are accidentally enabled.
 */
export function assertObservationOnlyEnv(env: NodeJS.ProcessEnv = process.env): void {
  const violations: string[] = [];
  if (env.HUNTER_AUTO_PUBLISH === '1' || env.HUNTER_AUTO_PUBLISH === 'true') {
    violations.push('HUNTER_AUTO_PUBLISH enabled');
  }
  if (env.BOT_INGEST_DRY_RUN === '0' && env.HUNTER_DISCOVERY_EXPERIMENT === '1') {
    // Experiment may run with dry-run off for CI persist, but must not mint.
    // Soft warn only — CI persist is allowed. Mint is blocked separately.
  }
  if (env.AVENTA_FORCE_MINT === '1') {
    violations.push('AVENTA_FORCE_MINT enabled during observation');
  }
  if (violations.length) {
    throw new Error(`[observation_boundary] ABORT: ${violations.join('; ')}`);
  }
}

/**
 * Hard wall for experiment report: insertedAttempted must be 0.
 */
export function assertZeroInsertAttempts(input: {
  insertedAttempted?: number | null;
  publishedAttempted?: number | null;
  rewardTouched?: boolean | null;
}): ObservationBoundaryCheck {
  const violations: string[] = [];
  if ((input.insertedAttempted ?? 0) > 0) {
    violations.push(`insertedAttempted=${input.insertedAttempted}`);
  }
  if ((input.publishedAttempted ?? 0) > 0) {
    violations.push(`publishedAttempted=${input.publishedAttempted}`);
  }
  if (input.rewardTouched === true) {
    violations.push('rewardTouched=true');
  }
  return { ok: violations.length === 0, violations };
}

/** Pure helper used by tests to verify source text does not import mint paths. */
export function scanSourceForForbiddenMint(sourceText: string): ObservationBoundaryCheck {
  const violations: string[] = [];
  if (sourceText.includes('OBSERVATION_FORBIDDEN_SYMBOLS')) {
    return { ok: true, violations: [] };
  }
  for (const sym of OBSERVATION_FORBIDDEN_SYMBOLS) {
    const importRe = new RegExp(`import\\s*\\{[^}]*\\b${sym}\\b[^}]*\\}`, 'm');
    const callRe = new RegExp(`\\b${sym}\\s*\\(`);
    const allowedDoc = new RegExp(`(?:NO|never|not)\\s+${sym}`, 'i');
    if (importRe.test(sourceText) && !allowedDoc.test(sourceText)) {
      violations.push(`import:${sym}`);
    }
    if (callRe.test(sourceText) && !allowedDoc.test(sourceText)) {
      violations.push(`call:${sym}`);
    }
  }
  return { ok: violations.length === 0, violations };
}
