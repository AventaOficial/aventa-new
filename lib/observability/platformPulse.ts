/**
 * Platform Pulse — aggregate operational snapshot (read-only).
 * Counters only; no secrets, no PII, no money mutation.
 */

export type PlatformPulseDomainStatus = 'ok' | 'degraded' | 'unavailable';

export type PlatformPulseSupply = {
  available: boolean;
  status: PlatformPulseDomainStatus;
  candidates: number | null;
  pending: number | null;
  /** High-level buckets (duplicate, price, link, quality, expired, other, …). */
  rejectionReasons: Record<string, number> | null;
  note: string | null;
};

export type PlatformPulseDistribution = {
  available: boolean;
  status: PlatformPulseDomainStatus;
  enqueue: number | null;
  claim: number | null;
  published: number | null;
  retryable: number | null;
  failed: number | null;
  unknown: number | null;
  engineEnabled: boolean;
  note: string | null;
};

export type PlatformPulseAttribution = {
  available: boolean;
  status: PlatformPulseDomainStatus;
  clicks: number | null;
  attributed: number | null;
  unattributed: number | null;
  unresolved: number | null;
  conversions: number | null;
  note: string | null;
};

export type PlatformPulseMoney = {
  available: boolean;
  status: PlatformPulseDomainStatus;
  commissionsReported: number | null;
  commissionsApproved: number | null;
  settlementEligible: number | null;
  ledgerEntries: number | null;
  /** Runtime flag only — never exposes env values. */
  settlementBridgeEnabled: boolean;
  note: string | null;
};

export type PlatformPulseSnapshot = {
  generatedAt: string;
  windowHours: number;
  supply: PlatformPulseSupply;
  distribution: PlatformPulseDistribution;
  attribution: PlatformPulseAttribution;
  money: PlatformPulseMoney;
};

export const PLATFORM_PULSE_DEFAULT_WINDOW_HOURS = 24;

export const PLATFORM_PULSE_SECRET_KEY_RE =
  /(token|secret|password|credential|cookie|authorization|api[_-]?key|bearer|service_role)/i;

/** Strip secret-like keys from nested objects before API responses. */
export function sanitizePlatformPulsePayload<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePlatformPulsePayload(item)) as T;
  }
  if (typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (PLATFORM_PULSE_SECRET_KEY_RE.test(k)) continue;
    if (typeof v === 'string' && PLATFORM_PULSE_SECRET_KEY_RE.test(v)) continue;
    out[k] = sanitizePlatformPulsePayload(v);
  }
  return out as T;
}
