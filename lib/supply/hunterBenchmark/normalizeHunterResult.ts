import type { PriceProvenance } from '@/lib/hunter/dealQualification/types';
import { canonicalizeBenchmarkUrl, dedupeIdentitySignals } from './identity';
import type {
  HunterBenchmarkCandidate,
  HunterIdentitySignal,
  HunterPriceQuote,
  HunterResult,
  NormalizeHunterResultInput,
  NormalizeHunterResultOutcome,
} from './types';

const SCHEMA_VERSION = 'hunter_benchmark.v1' as const;

const PRICE_PROVENANCE_VALUES = new Set<PriceProvenance>([
  'source_explicit',
  'trusted_enrichment',
  'price_intel_derivation',
  'user_declared',
  'listing_card',
  'unknown',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readIsoTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return fallback;
  return new Date(parsed).toISOString();
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/,/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readPriceProvenance(value: unknown): PriceProvenance | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim() as PriceProvenance;
  return PRICE_PROVENANCE_VALUES.has(normalized) ? normalized : null;
}

function parsePriceQuote(
  raw: unknown,
  observedAtFallback: string,
): HunterPriceQuote | null {
  // Bare number / numeric string from hunters (e.g. price: 21699).
  if (typeof raw === 'number' || typeof raw === 'string') {
    const amount = readFiniteNumber(raw);
    if (amount === null || amount <= 0) return null;
    return {
      amount,
      currency: 'MXN',
      provenance: 'unknown',
      observedAt: observedAtFallback,
    };
  }
  if (!isRecord(raw)) return null;
  const amount = readFiniteNumber(raw.amount ?? raw.price ?? raw.value);
  if (amount === null || amount <= 0) return null;
  const currency = readString(raw.currency) ?? 'MXN';
  const provenance =
    readPriceProvenance(raw.provenance) ??
    readPriceProvenance(raw.priceProvenance) ??
    'unknown';
  const observedAt = readIsoTimestamp(raw.observedAt ?? raw.detectedAt, observedAtFallback);
  return { amount, currency, provenance, observedAt };
}

function parseIdentitySignals(raw: unknown): HunterIdentitySignal[] {
  if (!Array.isArray(raw)) return [];
  const signals: HunterIdentitySignal[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const kind = readString(item.kind ?? item.type);
    const value = readString(item.value);
    if (!kind || !value) continue;
    if (
      kind !== 'url' &&
      kind !== 'canonical_url' &&
      kind !== 'sku' &&
      kind !== 'asin' &&
      kind !== 'external_id' &&
      kind !== 'fingerprint' &&
      kind !== 'title'
    ) {
      continue;
    }
    const confidence = readFiniteNumber(item.confidence) ?? 0.5;
    signals.push({
      kind,
      value,
      confidence,
    });
  }
  return dedupeIdentitySignals(signals);
}

function buildSignalsFromFields(input: {
  url: string | null;
  sku: string | null;
  asin: string | null;
  externalId: string | null;
  fingerprint: string | null;
  title: string | null;
}): HunterIdentitySignal[] {
  const signals: HunterIdentitySignal[] = [];
  if (input.url) signals.push({ kind: 'url', value: input.url, confidence: 0.9 });
  if (input.sku) signals.push({ kind: 'sku', value: input.sku, confidence: 0.85 });
  if (input.asin) signals.push({ kind: 'asin', value: input.asin, confidence: 0.95 });
  if (input.externalId) {
    signals.push({ kind: 'external_id', value: input.externalId, confidence: 0.8 });
  }
  if (input.fingerprint) {
    signals.push({ kind: 'fingerprint', value: input.fingerprint, confidence: 0.95 });
  }
  if (input.title) signals.push({ kind: 'title', value: input.title, confidence: 0.4 });
  return dedupeIdentitySignals(signals);
}

function parseCandidate(
  raw: unknown,
  index: number,
  runId: string,
  collectedAt: string,
): { candidate: HunterBenchmarkCandidate | null; error: string | null } {
  if (!isRecord(raw)) {
    return { candidate: null, error: `candidates[${index}] must be an object` };
  }

  const sourceUrl =
    readString(raw.sourceUrl) ??
    readString(raw.url) ??
    readString(raw.link) ??
    readString(raw.productUrl);
  const canonicalUrl = sourceUrl ? canonicalizeBenchmarkUrl(sourceUrl) : null;
  const title = readString(raw.title) ?? readString(raw.name);
  const discoveredAt = readIsoTimestamp(
    raw.discoveredAt ?? raw.detectedAt ?? raw.foundAt,
    collectedAt,
  );

  const identitySignals = [
    ...parseIdentitySignals(raw.identitySignals ?? raw.signals),
    ...buildSignalsFromFields({
      url: sourceUrl,
      sku: readString(raw.sku),
      asin: readString(raw.asin),
      externalId: readString(raw.externalId ?? raw.id),
      fingerprint: readString(raw.fingerprint),
      title,
    }),
  ];

  if (!canonicalUrl && identitySignals.length === 0) {
    return {
      candidate: null,
      error: `candidates[${index}] missing url or identity signals`,
    };
  }

  const currentPrice = parsePriceQuote(
    raw.currentPrice ?? raw.price ?? (isRecord(raw.prices) ? raw.prices.current : null),
    discoveredAt,
  );
  const originalPrice = parsePriceQuote(
    raw.originalPrice ??
      raw.listPrice ??
      (isRecord(raw.prices) ? raw.prices.original : null),
    discoveredAt,
  );

  const candidateId =
    readString(raw.candidateId) ??
    readString(raw.id) ??
    `${runId}:candidate:${index}`;

  const metadata: Record<string, unknown> = {};
  if (typeof raw.store === 'string' && raw.store.trim()) metadata.store = raw.store.trim();
  if (typeof raw.retailer === 'string' && raw.retailer.trim()) {
    metadata.retailer = raw.retailer.trim();
  }
  if (typeof raw.category === 'string' && raw.category.trim()) {
    metadata.category = raw.category.trim();
  }
  const imageUrl =
    readString(raw.imageUrl) ??
    readString(raw.image) ??
    readString(raw.image_url) ??
    (isRecord(raw.metadata) ? readString(raw.metadata.imageUrl) ?? readString(raw.metadata.image) : null);
  if (imageUrl) metadata.imageUrl = imageUrl;

  return {
    candidate: {
      candidateId,
      sourceUrl,
      canonicalUrl,
      title,
      currentPrice,
      originalPrice,
      identitySignals,
      discoveredAt,
      metadata,
    },
    error: null,
  };
}

function extractCandidateArray(payload: Record<string, unknown>): unknown[] | null {
  if (Array.isArray(payload.candidates)) return payload.candidates;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.deals)) return payload.deals;
  if (Array.isArray(payload.opportunities)) return payload.opportunities;
  if (Array.isArray(payload.results)) return payload.results;
  return null;
}

/**
 * Normalize external hunter payloads into the benchmark contract.
 * Fail-closed: garbage input yields `{ ok: false, errors }`.
 */
export function normalizeHunterResult(
  input: NormalizeHunterResultInput,
): NormalizeHunterResultOutcome {
  const errors: string[] = [];

  if (!readString(input.hunterId)) errors.push('hunterId is required');
  if (!readString(input.runId)) errors.push('runId is required');
  if (!readString(input.sourceId)) errors.push('sourceId is required');
  if (!readString(input.collectedAt)) errors.push('collectedAt is required');
  if (!readString(input.completedAt)) errors.push('completedAt is required');

  if (!isRecord(input.payload)) {
    errors.push('payload must be an object');
    return { ok: false, errors };
  }

  const candidateArray = extractCandidateArray(input.payload);
  if (!candidateArray) {
    errors.push('payload must include a candidates array');
    return { ok: false, errors };
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const candidateErrors: string[] = [];
  const candidates: HunterBenchmarkCandidate[] = [];
  for (let i = 0; i < candidateArray.length; i += 1) {
    const parsed = parseCandidate(candidateArray[i], i, input.runId, input.collectedAt);
    if (parsed.error) {
      candidateErrors.push(parsed.error);
      continue;
    }
    if (parsed.candidate) candidates.push(parsed.candidate);
  }

  if (candidateArray.length > 0 && candidates.length === 0) {
    return {
      ok: false,
      errors: candidateErrors.length > 0 ? candidateErrors : ['no valid candidates after normalization'],
    };
  }

  const payloadOk = input.payload.ok;
  const ok = (payloadOk === undefined || payloadOk === true) && candidateErrors.length === 0;

  const result: HunterResult = {
    schemaVersion: SCHEMA_VERSION,
    hunterId: input.hunterId,
    runId: input.runId,
    sourceId: input.sourceId,
    collectedAt: input.collectedAt,
    completedAt: input.completedAt,
    ok,
    candidates,
    errorCode: readString(input.payload.errorCode),
    errorMessageSafe:
      readString(input.payload.errorMessageSafe ?? input.payload.error) ??
      (candidateErrors.length > 0 ? candidateErrors.join('; ') : null),
  };

  return { ok: true, result };
}

/** Map a normalized candidate into the S8 evaluateOpportunity input shape. */
export function hunterCandidateToS8Input(candidate: HunterBenchmarkCandidate) {
  return {
    candidateId: candidate.candidateId,
    sourceUrl: candidate.canonicalUrl ?? candidate.sourceUrl,
    title: candidate.title,
    currentPrice: candidate.currentPrice?.amount ?? null,
    originalPrice: candidate.originalPrice?.amount ?? null,
    currency: candidate.currentPrice?.currency ?? candidate.originalPrice?.currency ?? null,
    currentPriceProvenance: candidate.currentPrice?.provenance ?? 'unknown',
    originalPriceProvenance: candidate.originalPrice?.provenance ?? 'unknown',
    identitySignals: candidate.identitySignals,
    discoveredAt: candidate.discoveredAt,
    metadata: candidate.metadata,
  };
}
