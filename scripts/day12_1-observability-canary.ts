/**
 * Day 12.1 — observability canary (no network / no mint / no money).
 *
 *   npx tsx scripts/day12_1-observability-canary.ts
 */

import {
  diagnoseArtificialListPriceClauses,
} from '../lib/bots/ingest/mlPriceEngine';
import type { ParsedOfferMetadata } from '../lib/bots/ingest/fetchParsedOfferMetadata';
import {
  buildCandidateObservation,
  normalizeOriginalRecoveredVia,
} from '../lib/hunter/discovery/discoveryObservability';
import { diagnoseProvenanceCompleteness } from '../lib/hunter/discovery/provenanceCompleteness';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function meta(over: Partial<ParsedOfferMetadata> = {}): ParsedOfferMetadata {
  return {
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-_JM',
    title: 'Producto canary Day12.1',
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_123456-MLA123456789_012025-F.jpg',
    discountPrice: 261,
    originalPrice: 399,
    discountPercent: 35,
    ...over,
    signals: {
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'source_explicit',
      historyReady: true,
      suspectedArtificialListPrice: false,
      ...(over.signals ?? {}),
    },
  };
}

function main() {
  assert(normalizeOriginalRecoveredVia('prices_endpoint') === 'prices_endpoint', 'prices');
  assert(normalizeOriginalRecoveredVia('products_items') === 'products_items', 'products');
  assert(normalizeOriginalRecoveredVia('none') === 'unavailable', 'unavailable');

  const missing = diagnoseProvenanceCompleteness({
    meta: meta({ originalPrice: null }),
    expectedProductId: 'MLM1234567890',
  });
  assert(missing.complete === false, 'missing original must fail');
  assert(missing.gap === 'missing_current_original', 'exact gap');

  const clauses = diagnoseArtificialListPriceClauses({
    current: 1000,
    listPrice: 2000,
    regularPrice: null,
    habitual30d: null,
    historyReady: false,
  });
  assert(clauses.detected === true, 'extreme detected');
  assert(clauses.clauses.includes('extreme_list_no_history'), 'extreme clause');

  const ok = meta();
  const prov = diagnoseProvenanceCompleteness({
    meta: ok,
    expectedProductId: 'MLM1234567890',
  });
  const obs = buildCandidateObservation({
    url: ok.canonicalUrl,
    sourceId: 'sticky_history_ready',
    productId: 'MLM1234567890',
    historyReady: true,
    meta: ok,
    acquisitionPath: 'sticky_observe',
    originalRecoveredVia: 'prices_endpoint',
    qualityDecision: 'VERIFIED_OPPORTUNITY',
    wouldInsert: true,
    dqeDecision: 'VERIFIED_DEAL',
    primaryTerminal: 'DRY_RUN_WOULD_INSERT',
    reasonCodes: [],
    provenanceDiag: prov,
  });
  assert(obs.schema_version === 1, 'schema');
  assert(obs.artificial?.detected === false, 'not artificial');
  assert(obs.provenance?.complete === true, 'provenance ok');

  console.log(
    JSON.stringify(
      {
        ok: true,
        day: '12.1',
        observability_only: true,
        gate_changes: 'NONE',
        mint: false,
        money: false,
      },
      null,
      2,
    ),
  );
}

main();
