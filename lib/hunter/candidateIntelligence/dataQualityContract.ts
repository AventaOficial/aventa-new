/**
 * Data quality contract for candidate telemetry.
 * MISSING / INVALID / UNKNOWN / VALID — never coerce missing → zero.
 */

export type DqStatus = 'MISSING' | 'INVALID' | 'UNKNOWN' | 'VALID';

export type DqFieldResult = {
  field: string;
  status: DqStatus;
  detail: string | null;
};

export type CandidateDqInput = {
  canonicalUrl?: string | null;
  source?: string | null;
  identityType?: string | null;
  identityKey?: string | null;
  discoveredAt?: string | null;
  discountPercentage?: number | null;
  discountClass?: string | null;
  salePrice?: number | null;
  originalPrice?: number | null;
  decision?: string | null;
  reasonCode?: string | null;
  funnelStage?: string | null;
  experimentId?: string | null;
  experimentVariant?: string | null;
  rotQuery?: string | null;
  rotSeedId?: string | null;
  rotPage?: number | null;
};

export type CandidateDqReport = {
  overall: DqStatus;
  fields: DqFieldResult[];
  score: number;
};

function field(name: string, status: DqStatus, detail: string | null = null): DqFieldResult {
  return { field: name, status, detail };
}

export function validateCandidateTelemetry(input: CandidateDqInput): CandidateDqReport {
  const fields: DqFieldResult[] = [];

  const url = input.canonicalUrl?.trim();
  if (!url) fields.push(field('canonical_url', 'MISSING'));
  else if (!/^https?:\/\//i.test(url)) fields.push(field('canonical_url', 'INVALID', 'not http(s)'));
  else fields.push(field('canonical_url', 'VALID'));

  if (!input.source?.trim()) fields.push(field('source', 'MISSING'));
  else fields.push(field('source', 'VALID'));

  if (!input.identityType || input.identityType === 'unknown') {
    fields.push(field('identity', 'UNKNOWN', input.identityType ?? 'absent'));
  } else if (!input.identityKey) {
    fields.push(field('identity', 'INVALID', 'type without key'));
  } else {
    fields.push(field('identity', 'VALID', input.identityType));
  }

  if (!input.discoveredAt) fields.push(field('discovered_at', 'MISSING'));
  else if (!Number.isFinite(Date.parse(input.discoveredAt))) {
    fields.push(field('discovered_at', 'INVALID'));
  } else fields.push(field('discovered_at', 'VALID'));

  // Discount semantics
  if (input.discountPercentage === undefined) {
    fields.push(field('discount_percentage', 'MISSING'));
  } else if (input.discountPercentage === null) {
    fields.push(field('discount_percentage', 'UNKNOWN', 'null = UNKNOWN discount'));
  } else if (!Number.isFinite(input.discountPercentage)) {
    fields.push(field('discount_percentage', 'INVALID'));
  } else if (input.discountPercentage === 0) {
    fields.push(field('discount_percentage', 'VALID', 'REAL_ZERO'));
  } else {
    fields.push(field('discount_percentage', 'VALID'));
  }

  if (input.salePrice == null) fields.push(field('sale_price', 'MISSING'));
  else if (!(input.salePrice > 0)) fields.push(field('sale_price', 'INVALID'));
  else fields.push(field('sale_price', 'VALID'));

  if (input.originalPrice === undefined) fields.push(field('original_price', 'MISSING'));
  else if (input.originalPrice === null) fields.push(field('original_price', 'UNKNOWN'));
  else if (!(input.originalPrice > 0)) fields.push(field('original_price', 'INVALID'));
  else fields.push(field('original_price', 'VALID'));

  if (!input.decision?.trim()) fields.push(field('decision', 'MISSING'));
  else fields.push(field('decision', 'VALID'));

  if (!input.reasonCode?.trim() && input.decision && !['WOULD_INSERT', 'DISCOVERED'].includes(input.decision)) {
    fields.push(field('reason_code', 'MISSING', 'terminal without reason'));
  } else if (!input.reasonCode?.trim()) {
    fields.push(field('reason_code', 'UNKNOWN'));
  } else fields.push(field('reason_code', 'VALID'));

  if (!input.funnelStage?.trim()) fields.push(field('funnel_stage', 'UNKNOWN'));
  else fields.push(field('funnel_stage', 'VALID'));

  // Experiment metadata optional
  if (input.experimentId == null && input.experimentVariant == null) {
    fields.push(field('experiment', 'UNKNOWN', 'no experiment context'));
  } else if (input.experimentId && !input.experimentVariant) {
    fields.push(field('experiment', 'INVALID', 'id without variant'));
  } else fields.push(field('experiment', 'VALID'));

  for (const [name, val] of [
    ['rot_query', input.rotQuery],
    ['rot_seed_id', input.rotSeedId],
  ] as const) {
    if (val == null || val === '') fields.push(field(name, 'UNKNOWN'));
    else fields.push(field(name, 'VALID'));
  }
  if (input.rotPage == null) fields.push(field('rot_page', 'UNKNOWN'));
  else if (!Number.isFinite(input.rotPage)) fields.push(field('rot_page', 'INVALID'));
  else fields.push(field('rot_page', 'VALID'));

  const weights = { VALID: 1, UNKNOWN: 0.5, MISSING: 0, INVALID: 0 } as const;
  const score =
    fields.reduce((a, f) => a + weights[f.status], 0) / Math.max(fields.length, 1);

  let overall: DqStatus = 'VALID';
  if (fields.some((f) => f.status === 'INVALID')) overall = 'INVALID';
  else if (fields.some((f) => f.field === 'canonical_url' && f.status === 'MISSING')) overall = 'MISSING';
  else if (fields.some((f) => f.status === 'MISSING')) overall = 'UNKNOWN';
  else if (fields.some((f) => f.status === 'UNKNOWN')) overall = 'UNKNOWN';

  return { overall, fields, score: Math.round(score * 1000) / 1000 };
}
