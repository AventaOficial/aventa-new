/**
 * Optional offline Mission Control demo — no network.
 * Proves answer shape A–H from synthetic reconciled rows.
 * Usage: npx tsx scripts/mission-control-offline-demo.ts
 */
import { buildMissionControlReport } from '../lib/hunter/candidateIntelligence';

const candidates = [
  {
    runId: 'demo',
    canonicalUrl: 'https://ml.mx/1',
    productFingerprint: 'fp1',
    source: 'ml_worker',
    category: 'electronics',
    decision: 'WOULD_INSERT',
    reasonCode: 'ok',
    discountClass: 'DISCOUNT_REAL_GOOD',
    discountPercentage: 40,
    rotPage: 1,
  },
  {
    runId: 'demo',
    canonicalUrl: 'https://ml.mx/2',
    productFingerprint: 'fp2',
    source: 'ml_api',
    category: 'home',
    decision: 'REJECTED_DISCOUNT',
    reasonCode: 'descuento_bajo',
    discountClass: 'DISCOUNT_REAL_LOW',
    discountPercentage: 12,
    rotPage: 1,
  },
  {
    runId: 'demo',
    canonicalUrl: 'https://ml.mx/3',
    productFingerprint: 'fp3',
    source: 'ml_api',
    decision: 'REJECTED_DISCOUNT',
    reasonCode: 'sin_original',
    discountClass: 'DISCOUNT_UNKNOWN',
    discountPercentage: null,
  },
  {
    runId: 'demo',
    canonicalUrl: 'https://ml.mx/4',
    productFingerprint: 'fp4',
    source: 'ml_worker',
    decision: 'REJECTED_BUDGET',
    reasonCode: 'score_shortlist_cut',
    wouldTopkCut: true,
    discountClass: 'DISCOUNT_REAL_GOOD',
    discountPercentage: 35,
  },
  {
    runId: 'demo',
    canonicalUrl: 'https://ml.mx/5',
    productFingerprint: 'fp1',
    source: 'ml_worker',
    decision: 'REJECTED_DIVERSITY',
    reasonCode: 'diversity_cut',
    wouldDiversityCut: true,
    discountClass: 'DISCOUNT_REAL_GOOD',
    discountPercentage: 38,
  },
];

const report = buildMissionControlReport({
  candidates,
  identities7d: new Set(['fp1', 'old']),
  previousRunIdentities: new Set(['fp1']),
});

console.log(JSON.stringify(report.answers, null, 2));
console.log('loss', report.lossFunnel.separated);
console.log('recon', report.reconciliation);
