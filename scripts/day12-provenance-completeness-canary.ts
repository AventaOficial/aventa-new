/**
 * Day 12 — deterministic provenance completeness canary (no network / no mint).
 *
 *   npx tsx scripts/day12-provenance-completeness-canary.ts
 */

import { ML_PRICE_MIN_HISTORY_DAYS } from '../lib/bots/ingest/mlPriceEngine';
import type { ParsedOfferMetadata } from '../lib/bots/ingest/fetchParsedOfferMetadata';
import {
  diagnoseProvenanceCompleteness,
  appendProvenanceDiagnostics,
} from '../lib/hunter/discovery/provenanceCompleteness';
import { assignPrimaryTerminalReason } from '../lib/hunter/discovery/verifiedYieldTerminal';
import { mintTrustedOriginalPrice } from '../lib/bots/ingest/candidateInsertGate';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function meta(over: Partial<ParsedOfferMetadata> = {}): ParsedOfferMetadata {
  const baseSignals = {
    currentPriceProvenance: 'source_explicit' as const,
    originalPriceProvenance: 'source_explicit' as const,
    historyReady: true,
  };
  return {
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-_JM',
    title: 'Producto canary Day12',
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_123456-MLA123456789_012025-F.jpg',
    discountPrice: 261,
    originalPrice: 399,
    discountPercent: 35,
    ...over,
    signals: {
      ...baseSignals,
      ...(over.signals ?? {}),
    },
  };
}

async function main() {
  assert(ML_PRICE_MIN_HISTORY_DAYS === 4, 'history days unchanged');

  // CASE A — historyReady + valid current evidence
  const a = diagnoseProvenanceCompleteness({
    meta: meta(),
    expectedProductId: 'MLM1234567890',
  });
  assert(a.complete === true && a.gap === 'none', 'CASE A');

  // CASE B — historyReady + PM history only (sale tip, no original)
  const b = diagnoseProvenanceCompleteness({
    meta: meta({
      originalPrice: null,
      discountPercent: 0,
      signals: {
        historyReady: true,
        originalPriceProvenance: 'unknown',
        currentPriceProvenance: 'source_explicit',
      },
    }),
  });
  assert(b.complete === false && b.gap === 'missing_current_original', 'CASE B');
  assert(b.pmHistoryIsNotProvenance === true, 'CASE B pm≠provenance');

  // CASE C — identity mismatch
  const c = diagnoseProvenanceCompleteness({
    meta: meta(),
    expectedProductId: 'MLM0000000001',
  });
  assert(c.complete === false && c.gap === 'identity_mismatch', 'CASE C');

  // CASE D — stale/missing current
  const d = diagnoseProvenanceCompleteness({
    meta: null,
    currentEvidenceAbsent: true,
  });
  assert(d.complete === false && d.gap === 'stale_or_absent_current', 'CASE D');

  // CASE E — valid provenance; DQE/S6.1 remain authority (mint trust still required)
  const eMeta = meta();
  assert(mintTrustedOriginalPrice(eMeta.signals ?? null) === true, 'CASE E mint trust');
  const eCodes = appendProvenanceDiagnostics(
    ['ORIGINAL_PRICE_UNTRUSTED'],
    diagnoseProvenanceCompleteness({
      meta: meta({
        originalPrice: null,
        signals: { historyReady: true, originalPriceProvenance: 'unknown' },
      }),
    }),
  );
  const terminal = assignPrimaryTerminalReason({
    extracted: true,
    identityValid: true,
    historyReady: true,
    reasonCodes: eCodes,
    s61WouldInsert: false,
    s61QualityDecision: 'SUPPRESSED',
  });
  assert(terminal === 'PROVENANCE_FAILURE', 'CASE E terminal still PROVENANCE_FAILURE');

  console.log(
    JSON.stringify(
      {
        ok: true,
        ML_PRICE_MIN_HISTORY_DAYS,
        cases: { A: 'PASS', B: 'PASS', C: 'PASS', D: 'PASS', E: 'PASS' },
        mintAttempted: false,
        pending_created: 0,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
