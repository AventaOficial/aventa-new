/**
 * When ML live fetch is blocked, rebuild honest listing-card meta from Day2
 * discovery evidence keyed by product_id discovered via Price Memory (no URL paste).
 * Evidence rows are real census extracts — not invented discounts.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import { normalizeMlProductId } from '@/lib/bots/ingest/mlPriceEngine';
import { extractMercadoLibreItemId } from '@/lib/offers/offerUrlFingerprint';

export type DiscoveryEvidenceRow = {
  product_id?: string;
  url?: string;
  canonicalUrl?: string;
  title?: string;
  imageUrl?: string;
  discountPrice?: number;
  originalPrice?: number | null;
  discountPercent?: number | null;
  cardDiscountSource?: string | null;
  signals?: Record<string, unknown> | null;
};

let cachedEvidence: Map<string, DiscoveryEvidenceRow> | null = null;

function productIdFromEvidence(row: DiscoveryEvidenceRow): string | null {
  if (row.product_id) {
    return (
      normalizeMlProductId(String(row.product_id))?.toUpperCase() ??
      String(row.product_id).replace(/-/g, '').toUpperCase()
    );
  }
  const url = row.canonicalUrl || row.url || '';
  const fromUrl = extractMercadoLibreItemId(url);
  return fromUrl ? fromUrl.toUpperCase() : null;
}

function loadDiscoveryEvidenceMap(): Map<string, DiscoveryEvidenceRow> {
  if (cachedEvidence) return cachedEvidence;
  const map = new Map<string, DiscoveryEvidenceRow>();
  const path = join(process.cwd(), 'scripts/_day2_discovery.json');
  if (!existsSync(path)) {
    cachedEvidence = map;
    return map;
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as {
      candidates?: DiscoveryEvidenceRow[];
    };
    for (const row of raw.candidates ?? []) {
      const id = productIdFromEvidence(row);
      if (!id) continue;
      map.set(id, row);
    }
  } catch {
    /* empty */
  }
  cachedEvidence = map;
  return map;
}

/** Test helper — reset cache between tests. */
export function resetDiscoveryEvidenceCacheForTests(): void {
  cachedEvidence = null;
}

/**
 * Optional enrichment from Day2 discovery evidence when live ML fetch is blocked.
 * Returns null if no evidence or incomplete — never invents prices.
 */
export function metaFromDiscoveryEvidenceForProduct(
  productId: string,
  fallbackUrl: string,
): ParsedOfferMetadata | null {
  const id =
    normalizeMlProductId(productId)?.toUpperCase() ?? productId.replace(/-/g, '').toUpperCase();
  const row = loadDiscoveryEvidenceMap().get(id);
  if (!row) return null;

  const sale = Number(row.discountPrice);
  if (!Number.isFinite(sale) || sale <= 0) return null;

  const list = row.originalPrice != null ? Number(row.originalPrice) : null;
  const hasTrustedList = list != null && Number.isFinite(list) && list > sale;
  const title = (row.title ?? '').trim();
  const imageUrl = (row.imageUrl ?? '').trim();
  if (!title || !imageUrl) return null;

  const url = (row.canonicalUrl || row.url || fallbackUrl).trim() || fallbackUrl;
  const discountPercent = hasTrustedList
    ? Math.round(((list! - sale) / list!) * 100)
    : Number(row.discountPercent) || 0;

  return {
    canonicalUrl: url,
    title: title.slice(0, 500),
    store: 'Mercado Libre',
    imageUrl: imageUrl.slice(0, 2048),
    discountPrice: sale,
    originalPrice: hasTrustedList ? list : null,
    discountPercent,
    signals: {
      originalPriceProvenance: hasTrustedList ? 'listing_card' : undefined,
      cardDiscountSource: hasTrustedList
        ? (row.cardDiscountSource as 'card_strikethrough') ?? 'card_strikethrough'
        : undefined,
      // Leave historyReady unset — enrichWithPriceIntel / observeSticky sets it from PM.
      ...(row.signals ?? {}),
    },
  };
}

export function listDiscoveryEvidenceProductIds(): string[] {
  return [...loadDiscoveryEvidenceMap().keys()];
}
