/**
 * M5.5 — Classify reject reasons for RESERVED → submit automation.
 */

export function classifySubmitReject(reason: string): {
  class: 'deferred' | 'rejected';
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
    case 'use_reconcile_for_unknown':
    case 'invalid_transition':
    case 'already_resolved':
    case 'intent_not_found':
    case 'schema_missing':
    default:
      return { class: 'rejected', terminal: true };
  }
}
