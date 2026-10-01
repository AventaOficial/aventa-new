/**
 * Persist Price Memory tips from worker / discovery metas BEFORE DQE/S6.1.
 * Does not mint offers. Idempotent same-day upsert via recordMlDailySnapshots.
 */

import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import {
  normalizeMlProductId,
  recordMlDailySnapshots,
  type MlPriceObservation,
} from '@/lib/bots/ingest/mlPriceEngine';
import { extractMercadoLibreItemId } from '@/lib/offers/offerUrlFingerprint';
import { nicheIdFromSourceDetail } from '@/lib/bots/ingest/priceIntel';

export type WorkerPmPersistResult = {
  attempted: number;
  written: number;
  skippedNoIdentity: number;
  skippedNoPrice: number;
};

/**
 * Map parsed ML listing metas → daily PM snapshots.
 * Safe to call on dry-run worker batches — PM is observation, not offer mint.
 */
export async function persistPriceMemoryFromWorkerMetas(
  metas: readonly ParsedOfferMetadata[],
  opts?: { sourceDetail?: string | null },
): Promise<WorkerPmPersistResult> {
  const nicheHint = nicheIdFromSourceDetail(opts?.sourceDetail ?? null);
  const observations: MlPriceObservation[] = [];
  let skippedNoIdentity = 0;
  let skippedNoPrice = 0;

  for (const meta of metas) {
    const rawId =
      extractMercadoLibreItemId(meta.canonicalUrl) ??
      extractMercadoLibreItemId(meta.canonicalUrl.replace(/\/p\//, '/'));
    const productId = rawId ? normalizeMlProductId(rawId) : null;
    if (!productId) {
      skippedNoIdentity += 1;
      continue;
    }
    const current = Number(meta.discountPrice);
    if (!Number.isFinite(current) || current <= 0) {
      skippedNoPrice += 1;
      continue;
    }
    const list =
      meta.originalPrice != null &&
      Number.isFinite(meta.originalPrice) &&
      meta.originalPrice > current
        ? meta.originalPrice
        : null;
    observations.push({
      productId,
      current,
      listPrice: list,
      regularPrice: list,
      nicheId: nicheHint,
    });
  }

  if (observations.length > 0) {
    await recordMlDailySnapshots(observations);
  }

  return {
    attempted: metas.length,
    written: observations.length,
    skippedNoIdentity,
    skippedNoPrice,
  };
}
