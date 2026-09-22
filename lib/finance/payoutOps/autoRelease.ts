/**
 * Auto-release (V5) — política pura. Solo evalúa; no ejecuta.
 * Habilitación explícita por env PAYOUT_AUTO_RELEASE_ENABLED; en producción sigue
 * subordinada a MONEY_PATH_FROZEN / REWARDS_PROGRAM_ACTIVE / proveedor real.
 */

import type { BatchPreview, PayoutOpsRuntime, PipelineStage } from './types';

export type AutoReleaseEvaluation = {
  enabled: boolean;
  eligible: boolean;
  blockers: string[];
  policy: string[];
};

export const AUTO_RELEASE_ENV_KEY = 'PAYOUT_AUTO_RELEASE_ENABLED';

export function isAutoReleaseEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env[AUTO_RELEASE_ENV_KEY] ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function evaluateAutoRelease(
  runtime: PayoutOpsRuntime,
  batch: BatchPreview,
  stages: PipelineStage[],
  env: NodeJS.ProcessEnv = process.env,
): AutoReleaseEvaluation {
  const enabled = isAutoReleaseEnabled(env);
  const blockers: string[] = [];
  if (!enabled) blockers.push('auto_release_disabled');
  if (runtime.moneyPathFrozen) blockers.push('money_path_frozen');
  if (!runtime.rewardsProgramActive) blockers.push('rewards_program_off');
  if (runtime.payoutProvider.mode !== 'real') blockers.push('provider_not_real');

  const ingest = stages.find((s) => s.id === 'ingest');
  if (!ingest || (ingest.automation !== 'auto' && ingest.automation !== 'semi')) {
    blockers.push('ingest_evidence_missing');
  }
  if (batch.totals.payableCount === 0) blockers.push('no_payable_lines');
  if (batch.totals.reviewCount > 0) blockers.push('review_pending');

  return {
    enabled,
    eligible: blockers.length === 0,
    blockers,
    policy: [
      'Solo líneas pass; review/fail nunca se auto-liberan.',
      'Primer pago y cambio de CLABE siempre pasan por humano (gate review).',
      'Requiere proveedor SPEI real + webhook firmado; sandbox/manual no cuentan.',
      'Requiere evidencia de red del periodo (ingest auto o semi).',
      'Cualquier excepción crítica abierta pausa el auto-release.',
    ],
  };
}
