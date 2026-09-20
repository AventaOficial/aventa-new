/**
 * M5.6 — Classify confirmation rejects for automation.
 */

export function classifyConfirmReject(reason: string): {
  class: 'deferred' | 'rejected' | 'invalid_evidence' | 'reused';
  terminal: boolean;
} {
  switch (reason) {
    case 'money_path_frozen':
    case 'program_inactive':
    case 'provider_not_configured':
    case 'provider_forbidden_in_production':
    case 'credentials_missing':
    case 'api_url_missing':
      return { class: 'deferred', terminal: false };
    case 'amount_mismatch':
    case 'currency_mismatch':
    case 'idempotency_key_mismatch':
    case 'provider_reference_mismatch':
    case 'provider_mismatch':
    case 'reward_mismatch':
    case 'evidence_missing':
      return { class: 'invalid_evidence', terminal: true };
    case 'already_resolved':
    case 'already_terminal':
      return { class: 'reused', terminal: true };
    default:
      return { class: 'rejected', terminal: true };
  }
}

/** Intent eligible for automated confirmation reconcile. */
export function isConfirmableIntentStatus(
  status: string,
  meta?: Record<string, unknown> | null,
): boolean {
  if (status === 'UNKNOWN') return true;
  if (status === 'SUBMITTED') {
    // Awaiting confirmation OR crash recovery after submit dispatch
    if (meta?.awaiting_confirmation === true) return true;
    if (meta?.submit_dispatched === true) return true;
    return true; // SUBMITTED always reconcile-eligible (M4 contract)
  }
  return false;
}
