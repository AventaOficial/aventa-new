/**
 * Contrato MCP de Aventa para proveedores de candidatos (Grok Bots).
 * Ver docs/SYSTEMS/MCP_GROK_BOTS.md.
 *
 * Un cliente MCP sólo propone candidatos. No es autor comunitario, moderador,
 * publicador, Hunter ni actor económico.
 */

export const MCP_SCOPES = ['candidates:submit', 'candidates:read', 'catalog:read'] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

export const MCP_TOOLS = [
  'submit_deal_candidates',
  'get_submission_status',
  'check_offer_exists',
  'get_submission_rules',
] as const;
export type McpToolName = (typeof MCP_TOOLS)[number];

export const MCP_TOOL_SCOPE: Readonly<Record<McpToolName, McpScope>> = {
  submit_deal_candidates: 'candidates:submit',
  get_submission_status: 'candidates:read',
  check_offer_exists: 'catalog:read',
  get_submission_rules: 'candidates:read',
};

export const MACHINE_CLIENT_STATUSES = ['active', 'paused', 'revoked'] as const;
export type MachineClientStatus = (typeof MACHINE_CLIENT_STATUSES)[number];

export const MCP_MAX_CANDIDATES_PER_CALL = 20;
export const MCP_TITLE_MAX = 200;
export const MCP_NOTE_MAX = 280;
export const MCP_URL_MAX = 2048;
export const MCP_IDEMPOTENCY_KEY_MIN = 8;
export const MCP_IDEMPOTENCY_KEY_MAX = 128;
export const MCP_RUN_ID_MAX = 128;
export const MCP_DEFAULT_DAILY_CANDIDATE_CAP = 200;
export const MCP_MAX_DAILY_CANDIDATE_CAP = 1000;
export const MCP_CALLS_PER_MINUTE = 10;
export const MCP_MAX_BODY_BYTES = 64 * 1024;
export const MCP_CURRENCY = 'MXN' as const;
export const MCP_MAX_PRICE = 10_000_000;
/** observedAt no puede venir del futuro más allá de este margen de reloj. */
export const MCP_OBSERVED_AT_FUTURE_SKEW_MS = 10 * 60 * 1000;
/** observedAt más viejo que esto ya no es una pista útil. */
export const MCP_OBSERVED_AT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const MCP_ERROR_CODES = [
  'FORBIDDEN_SCOPE',
  'INGEST_PAUSED',
  'CLIENT_PAUSED',
  'QUOTA_EXCEEDED',
  'IDEMPOTENCY_CONFLICT',
  'INVALID_INPUT',
  'TOO_MANY_CANDIDATES',
  'NOT_FOUND',
  'INTERNAL_ERROR',
] as const;
export type McpErrorCode = (typeof MCP_ERROR_CODES)[number];

export const CANDIDATE_REJECTION_CODES = [
  'INVALID_CANDIDATE',
  'INVALID_URL',
  'UNSUPPORTED_HOST',
  'INVALID_TITLE',
  'INVALID_PRICE',
  'INVALID_ORIGINAL_PRICE',
  'INVALID_CURRENCY',
  'INVALID_NOTE',
  'INVALID_OBSERVED_AT',
  'DUPLICATE_IN_REQUEST',
  'ALREADY_IN_REVIEW',
] as const;
export type CandidateRejectionCode = (typeof CANDIDATE_REJECTION_CODES)[number];

/** Estado público de un candidato. No expone estados internos del pipeline. */
export const SUBMISSION_CANDIDATE_STATES = [
  'received',
  'processing',
  'in_review',
  'accepted',
  'published',
  'rejected',
  'invalid',
  'duplicate',
] as const;
export type SubmissionCandidateState = (typeof SUBMISSION_CANDIDATE_STATES)[number];

/**
 * INGESTED→received, PROCESSING→processing, READY/NEEDS_REVIEW→in_review,
 * APPROVED→accepted, PUBLISHED→published, REJECTED→rejected, ERROR→invalid,
 * duplicado detectado→duplicate.
 */
export function mapBatchItemToCandidateState(item: {
  status: string;
  duplicate_status?: string | null;
}): SubmissionCandidateState {
  if (item.status === 'PUBLISHED') return 'published';
  if (item.status === 'APPROVED') return 'accepted';
  if (item.status === 'REJECTED') return 'rejected';
  if (item.duplicate_status === 'duplicate' || item.duplicate_status === 'in_batch') return 'duplicate';
  switch (item.status) {
    case 'INGESTED':
      return 'received';
    case 'PROCESSING':
      return 'processing';
    case 'READY':
    case 'NEEDS_REVIEW':
      return 'in_review';
    case 'ERROR':
      return 'invalid';
    default:
      return 'processing';
  }
}

export function isMcpScope(value: unknown): value is McpScope {
  return typeof value === 'string' && (MCP_SCOPES as readonly string[]).includes(value);
}

export function isMcpToolName(value: unknown): value is McpToolName {
  return typeof value === 'string' && (MCP_TOOLS as readonly string[]).includes(value);
}
