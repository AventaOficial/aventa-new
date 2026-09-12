/**
 * FASE 10.1 — dry-run community quality. No inserta, no publica, no toca rewards.
 */
import { loadBotIngestConfig } from '../lib/bots/ingest/config';
import { isDayToDayFlagOn } from '../lib/hunter/dayToDay/config';
import {
  communityPersistStatus,
  evaluateCommunitySubmission,
  getCommunityQualityMetrics,
  resetCommunityQualityMetrics,
  type CommunityQualityEvaluation,
} from '../lib/hunter/supply';
import { validatePublicOfferUrl } from '../lib/server/validatePublicOfferUrl';
import type { ParsedOfferMetadata } from '../lib/bots/ingest/fetchParsedOfferMetadata';

const ML = 'https://articulo.mercadolibre.com.mx/MLM-1234567890-taladro-_JM';
const CHEDRAUI = 'https://www.chedraui.com.mx/te-doblett/p';

function sourceMeta(url: string): ParsedOfferMetadata {
  return {
    canonicalUrl: url,
    title: 'Taladro inalámbrico 20V',
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/foto.jpg',
    discountPrice: 899,
    originalPrice: 1299,
    discountPercent: 31,
    signals: {
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'source_explicit',
      discountPercentProvenance: 'derived',
    },
  };
}

function row(label: string, ev: CommunityQualityEvaluation) {
  return {
    label,
    persistStatus: communityPersistStatus(ev),
    published: ev.published,
    rewardsTouched: ev.rewardsTouched,
    verifierBypassed: ev.verifierBypassed,
    qualification: ev.qualification,
    reasons: ev.qualificationReasons,
    provenance: {
      current: ev.currentPriceProvenance,
      original: ev.originalPriceProvenance,
    },
    source: ev.resolvedSource,
    monetization: ev.monetizationStatus,
    verifier: ev.verifierDecision,
    autonomous: ev.autonomousDecision,
    reputationWouldApprove: ev.reputationWouldApprove,
    qualityError: ev.qualityError,
  };
}

function main() {
  resetCommunityQualityMetrics();
  const cfg = loadBotIngestConfig();

  const a = evaluateCommunitySubmission(
    {
      title: 'Taladro inalámbrico 20V',
      store: 'Mercado Libre',
      price: 899,
      originalPrice: 1299,
      imageUrl: 'https://http2.mlstatic.com/foto.jpg',
      offerUrl: ML,
    },
    { sourceMeta: sourceMeta(ML) },
  );

  const b = evaluateCommunitySubmission({
    title: 'Té Doblett 20 sobres 2x1',
    store: 'Chedraui',
    price: 40,
    originalPrice: null,
    imageUrl: null,
    offerUrl: CHEDRAUI,
  });

  const c = evaluateCommunitySubmission({
    title: 'Descuento inventado 90%',
    store: 'Chedraui',
    price: 100,
    originalPrice: 1000,
    imageUrl: null,
    offerUrl: CHEDRAUI,
  });

  const d = evaluateCommunitySubmission(
    {
      title: 'Taladro duplicado worker',
      store: 'Mercado Libre',
      price: 899,
      originalPrice: 1299,
      imageUrl: null,
      offerUrl: ML,
    },
    { sourceMeta: sourceMeta(ML) },
  );

  const e = validatePublicOfferUrl('javascript:alert(1)');
  const f = evaluateCommunitySubmission({
    title: 'Producto tienda desconocida',
    store: 'Tienda X',
    price: 199,
    originalPrice: null,
    imageUrl: null,
    offerUrl: 'https://www.tienda-desconocida.mx/producto/abc',
  });

  const g = evaluateCommunitySubmission({
    title: 'Sin URL',
    store: 'Genérica',
    price: 50,
    originalPrice: null,
    imageUrl: null,
    offerUrl: null,
  });

  const h = evaluateCommunitySubmission({
    title: 'Caso review usuario',
    store: 'Mercado Libre',
    price: 50,
    originalPrice: 60,
    imageUrl: null,
    offerUrl: ML,
  });

  const cases = [
    row('A community ML source-confirmed', a),
    row('B Chedraui affiliate-less', b),
    row('C user-declared fake 90%', c),
    row('D same ML fingerprint as worker (eval only)', d),
    {
      label: 'E invalid URL',
      persistStatus: 'not_inserted',
      urlOk: e.ok,
      error: e.ok ? null : e.error,
    },
    row('F unknown retailer', f),
    row('G no URL / no enrichment fetch', g),
    row('H user-declared small discount (review-ish)', h),
  ];

  const unexpectedApproved = [a, b, c, d, f, g, h].filter(
    (ev) => ev.persistStatus !== 'pending' || ev.published || ev.verifierBypassed,
  );

  console.log(
    JSON.stringify(
      {
        persisted: false,
        inserted: false,
        published: false,
        rewardsTouched: false,
        commissionsTouched: false,
        unexpectedApproved: unexpectedApproved.length,
        cases,
        metrics: getCommunityQualityMetrics(),
        flags: {
          chedraui: isDayToDayFlagOn('DAY_TO_DAY_CHEDRAUI_ENABLED'),
          bodega: isDayToDayFlagOn('DAY_TO_DAY_BODEGA_ENABLED'),
          walmart: isDayToDayFlagOn('DAY_TO_DAY_WALMART_ENABLED'),
          autoPublish: process.env.BOT_INGEST_AUTO_PUBLISH ?? null,
          legacyAutoApproveWrite: cfg.legacyAutoApproveWriteEnabled,
          autoApprovePolicy: cfg.autoApproveEnabled,
        },
      },
      null,
      2,
    ),
  );

  if (unexpectedApproved.length > 0) {
    process.exitCode = 1;
  }
}

main();
