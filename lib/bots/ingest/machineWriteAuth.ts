/**
 * S9.1 — Machine write authorization for insertIngestedOffer.
 *
 * Separates:
 * - Quality / auto-approve *decision* (scoring)
 * - Authorization to mint a machine offer row (kill-switch + runtime)
 *
 * BOT_INGEST_AUTO_APPROVE must NEVER imply write permission.
 */

import { isMachinePendingWriteEnabled } from './machineLiveInsertEligibility';
import { isProductionRuntime } from '@/lib/server/moneyPathFreeze';

export type MachineWriteAuthFailure = {
  ok: false;
  error: string;
  code: 'MACHINE_WRITES_DISABLED' | 'PRODUCTION_BLOCKED';
};

export type MachineWriteAuthOk = { ok: true };

/**
 * Authorization required before any machine offer INSERT via insertIngestedOffer.
 * Manual/UGC writes use app/api/offers — not this path.
 *
 * Does NOT grant `approved` status. Callers may still *decide* auto_approve
 * via scoring; insertIngestedOffer always mints `pending`.
 */
export function assertMachineOfferWriteAuthorized(): MachineWriteAuthOk | MachineWriteAuthFailure {
  if (isProductionRuntime()) {
    return {
      ok: false,
      error: 'machine_writes_production_blocked',
      code: 'PRODUCTION_BLOCKED',
    };
  }

  if (!isMachinePendingWriteEnabled()) {
    return {
      ok: false,
      error: 'BOT_INGEST_MACHINE_PENDING_WRITES_off',
      code: 'MACHINE_WRITES_DISABLED',
    };
  }

  return { ok: true };
}

/** Machine mint is always pending — approval decision ≠ write authorization. */
export function resolveMachineInsertStatus(
  _requested?: 'pending' | 'approved',
): 'pending' {
  void _requested;
  return 'pending';
}
