import type { HunterBenchmarkCandidate, HunterIdentitySignal } from './types';

const TRUSTED_PRICE_PROVENANCE = new Set([
  'source_explicit',
  'trusted_enrichment',
  'user_declared',
]);

export function canonicalizeBenchmarkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.href;
  } catch {
    return null;
  }
}

export function candidateIdentityKey(candidate: HunterBenchmarkCandidate): string | null {
  const urlSignal = candidate.identitySignals.find(
    (s) => s.kind === 'canonical_url' || s.kind === 'url',
  );
  if (urlSignal?.value) {
    const canonical = canonicalizeBenchmarkUrl(urlSignal.value);
    if (canonical) return `url:${canonical}`;
  }
  if (candidate.canonicalUrl) {
    const canonical = canonicalizeBenchmarkUrl(candidate.canonicalUrl);
    if (canonical) return `url:${canonical}`;
  }
  if (candidate.sourceUrl) {
    const canonical = canonicalizeBenchmarkUrl(candidate.sourceUrl);
    if (canonical) return `url:${canonical}`;
  }

  for (const kind of ['fingerprint', 'asin', 'sku', 'external_id'] as const) {
    const signal = candidate.identitySignals.find((s) => s.kind === kind);
    if (signal?.value.trim()) return `${kind}:${signal.value.trim().toLowerCase()}`;
  }

  const title = candidate.title?.trim().toLowerCase();
  if (title) return `title:${title}`;
  return null;
}

export function hasVerifiedOpportunitySignals(candidate: HunterBenchmarkCandidate): boolean {
  const key = candidateIdentityKey(candidate);
  if (!key) return false;
  const price = candidate.currentPrice;
  if (!price) return false;
  if (!Number.isFinite(price.amount) || price.amount <= 0) return false;
  return TRUSTED_PRICE_PROVENANCE.has(price.provenance);
}

export function dedupeIdentitySignals(signals: HunterIdentitySignal[]): HunterIdentitySignal[] {
  const seen = new Set<string>();
  const out: HunterIdentitySignal[] = [];
  for (const signal of signals) {
    const value = signal.value.trim();
    if (!value) continue;
    const key = `${signal.kind}:${value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const confidence = Number.isFinite(signal.confidence)
      ? Math.min(1, Math.max(0, signal.confidence))
      : 0;
    out.push({ kind: signal.kind, value, confidence });
  }
  return out;
}
