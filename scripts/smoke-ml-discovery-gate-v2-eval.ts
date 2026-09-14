/**
 * Evalúa READ-ONLY los candidatos del smoke discovery (sin writes).
 * Price Memory: solo SELECT + compute en memoria.
 *
 *   npx tsx --env-file=.env.local scripts/smoke-ml-discovery-gate-v2-eval.ts
 */
import { readFileSync } from 'node:fs';
import { qualifyParsedOfferMetadata } from '../lib/hunter/dealQualification/applyToCandidates';
import { evaluateDealQualityFromParsedMeta } from '../lib/hunter/dealQuality';
import {
  computeMlPriceIntel,
  loadMlDailyHistory,
  normalizeMlProductId,
} from '../lib/bots/ingest/mlPriceEngine';
import { formatYmdInTz } from '../lib/bots/ingest/ingestZonedTime';
import { mlWorkerMayInsertPending } from '../lib/bots/ingest/mlWorkerPendingGate';
import type { ParsedOfferMetadata } from '../lib/bots/ingest/fetchParsedOfferMetadata';

const INPUT = 'scripts/_smoke-gate-v2-discovery.json';

function toMeta(c: Record<string, unknown>): ParsedOfferMetadata | null {
  const discountPrice = Number(c.discountPrice);
  const originalPrice =
    c.originalPrice != null && Number.isFinite(Number(c.originalPrice))
      ? Number(c.originalPrice)
      : null;
  const title = typeof c.title === 'string' ? c.title.trim() : '';
  const url = typeof c.canonicalUrl === 'string' ? c.canonicalUrl : String(c.url ?? '');
  if (!title || !url || !(discountPrice > 0)) return null;
  const discountPercent =
    originalPrice != null && originalPrice > discountPrice
      ? Math.round((1 - discountPrice / originalPrice) * 100)
      : Number(c.discountPercent) || 0;
  const signals = (c.signals && typeof c.signals === 'object' ? c.signals : {}) as Record<
    string,
    unknown
  >;
  return {
    canonicalUrl: url,
    title,
    store: typeof c.store === 'string' ? c.store : 'Mercado Libre',
    imageUrl: typeof c.imageUrl === 'string' ? c.imageUrl : '',
    discountPrice,
    originalPrice,
    discountPercent,
    signals: {
      listingTypeId: 'worker_card',
      condition: 'new',
      ...signals,
    } as ParsedOfferMetadata['signals'],
  };
}

async function attachPriceMemoryReadOnly(meta: ParsedOfferMetadata): Promise<ParsedOfferMetadata> {
  const productId = normalizeMlProductId(meta.canonicalUrl);
  if (!productId) return meta;
  try {
    const history = await loadMlDailyHistory(productId);
    const today = formatYmdInTz(new Date(), 'America/Mexico_City');
    const intel = computeMlPriceIntel(
      {
        current: meta.discountPrice,
        listPrice: meta.originalPrice,
        regularPrice: null,
      },
      history,
      today,
    );
    return {
      ...meta,
      signals: {
        ...(meta.signals ?? {}),
        priceLowest30d: intel.lowest30d,
        priceLowest90d: intel.lowest90d,
        priceVsLowest90dPct: intel.priceVsLowest90dPct,
        habitual30d: intel.habitual30d,
        savingsVsHabitualPct: intel.savingsVsHabitualPct,
        effectiveDiscountPercent: intel.effectiveDiscountPercent,
        suspectedArtificialListPrice: intel.suspectedArtificialListPrice,
        priceIntelSource: 'aventa_ml',
      },
    };
  } catch {
    return meta;
  }
}

async function main() {
  const raw = JSON.parse(readFileSync(INPUT, 'utf8')) as {
    meta: Record<string, unknown>;
    discovery: { qualityGate?: Record<string, number> };
    candidates: Array<Record<string, unknown>>;
  };

  const qg = raw.discovery?.qualityGate ?? {};
  const cases: Array<Record<string, unknown>> = [];
  let verified = 0;
  let promotion = 0;
  let potential = 0;
  let noVerified = 0;
  let artificial = 0;
  let wouldInsert = 0;
  let withImage = 0;
  let effectiveGt0 = 0;

  for (const c of raw.candidates) {
    let meta = toMeta(c);
    if (!meta) continue;
    meta = await attachPriceMemoryReadOnly(meta);
    const qualification = qualifyParsedOfferMetadata(meta);
    const quality = evaluateDealQualityFromParsedMeta(meta, {
      source: 'ml_worker',
      qualification,
    });
    const gate = mlWorkerMayInsertPending({
      qualityDecision: quality.decision,
      recommendedAction: quality.recommendedAction,
      cardDiscountSource: meta.signals?.cardDiscountSource ?? null,
    });
    if (gate.allow) wouldInsert += 1;
    if (quality.decision === 'VERIFIED_DEAL') verified += 1;
    else if (quality.decision === 'PROMOTION') promotion += 1;
    else if (quality.decision === 'POTENTIAL_DEAL') potential += 1;
    else noVerified += 1;
    if (
      meta.signals?.suspectedArtificialListPrice ||
      quality.negativeSignals.includes('artificial_list_price')
    ) {
      artificial += 1;
    }
    if ((meta.signals?.effectiveDiscountPercent ?? 0) > 0) effectiveGt0 += 1;
    const img = (meta.imageUrl || '').trim();
    if (/^https:\/\//i.test(img)) withImage += 1;

    if (cases.length < 15) {
      cases.push({
        title: meta.title.slice(0, 48),
        price: meta.discountPrice,
        badge: meta.signals?.cardBadgePercent ?? null,
        pdp: String(c.sourceDetail || '').includes('pdp'),
        evidence: meta.signals?.cardDiscountSource ?? null,
        effective: meta.signals?.effectiveDiscountPercent ?? null,
        artificial: Boolean(meta.signals?.suspectedArtificialListPrice),
        qualification: qualification.qualification,
        qe: quality.decision,
        resultado: gate.allow ? `ALLOW:${gate.reason}` : `BLOCK:${gate.reason}`,
        imageOk: /^https:\/\//i.test(img),
      });
    }
  }

  const report = {
    meta: {
      ...raw.meta,
      evalMode: 'READ_ONLY_SELECT_PRICE_MEMORY',
      noOfferWrites: true,
      noSnapshotWrites: true,
      noPost: true,
    },
    funnel: {
      cardsDiscovered: qg.cardsDiscovered ?? null,
      shortlist: qg.shortlistSize ?? null,
      pdpAttempts: qg.pdpAttempts ?? null,
      pdpSuccess: qg.pdpSuccess ?? null,
      pdpBlocked: qg.pdpBlocked ?? null,
      pdpFailed: qg.pdpFailed ?? null,
      evidenceQualified: qg.acceptedForIngest ?? raw.candidates.length,
      rejectedBadgeOnly: qg.rejectedBadgeOnly ?? null,
      rejectedInsufficientEvidence: qg.rejectedInsufficientEvidence ?? null,
      acceptedForIngest: qg.acceptedForIngest ?? raw.candidates.length,
    },
    quality: {
      amongWorkerAccepted: raw.candidates.length,
      VERIFIED: verified,
      PROMOTION: promotion,
      POTENTIAL: potential,
      NO_VERIFIED: noVerified,
      ARTIFICIAL: artificial,
      effectiveDiscountGt0: effectiveGt0,
      wouldPassServerPendingGate: wouldInsert,
      withValidImage: withImage,
    },
    cases,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
