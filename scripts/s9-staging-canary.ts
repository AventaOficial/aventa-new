/**
 * S9 staging canary — N≤5, dry-run by default.
 *
 * Usage:
 *   npx tsx scripts/s9-staging-canary.ts
 *   npx tsx scripts/s9-staging-canary.ts --execute --cap=3
 *
 * Never continuous. Never production. Never enables Distribution/Rewards/Money.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  automationCandidatesFromHunterResult,
  runSupplyAutomation,
} from '@/lib/supply/automation';
import { normalizeHunterResult } from '@/lib/supply/hunterBenchmark';
import { isProductionRuntime } from '@/lib/server/moneyPathFreeze';
import { isSupplyAutomationEnabled } from '@/lib/supply/policy';

function parseArgs(argv: string[]) {
  let execute = false;
  let cap: number | null = 5;
  for (const a of argv) {
    if (a === '--execute') execute = true;
    if (a.startsWith('--cap=')) {
      const n = Number(a.slice('--cap='.length));
      if (Number.isFinite(n)) cap = Math.max(0, Math.floor(n));
    }
  }
  return { execute, cap };
}

function sampleHunterPayload() {
  const now = new Date().toISOString();
  return {
    ok: true,
    candidates: [
      {
        id: 's9-canary-1',
        url: 'https://articulo.mercadolibre.com.mx/MLM-S9CANARY0001',
        title: 'S9 Canary Headphones Bluetooth ANC',
        price: { amount: 799, currency: 'MXN', provenance: 'listing_card' },
        originalPrice: { amount: 1999, currency: 'MXN', provenance: 'listing_card' },
        imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_S9CANARY.jpg',
        discoveredAt: now,
        metadata: { imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_S9CANARY.jpg' },
      },
      {
        id: 's9-canary-2',
        url: 'https://articulo.mercadolibre.com.mx/MLM-S9CANARY0002',
        title: 'S9 Canary USB-C Hub Multiport',
        price: { amount: 449, currency: 'MXN', provenance: 'listing_card' },
        originalPrice: { amount: 899, currency: 'MXN', provenance: 'listing_card' },
        imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_S9CANARY2.jpg',
        discoveredAt: now,
        metadata: { imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_S9CANARY2.jpg' },
      },
    ],
  };
}

async function main() {
  const { execute, cap } = parseArgs(process.argv.slice(2));
  const runId = `s9-canary-${Date.now()}`;

  if (isProductionRuntime()) {
    console.error('ABORT: production runtime — S9 canary refuse');
    process.exit(2);
  }

  const reportDir = join(process.cwd(), 'scripts', '_s9_reports');
  mkdirSync(reportDir, { recursive: true });

  // Sample payload shaped for chatgpt scheduled adapter normalization path
  const normalized = normalizeHunterResult({
    hunterId: 's9_canary_fixture',
    runId,
    sourceId: 'aventa_supply',
    collectedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    payload: sampleHunterPayload(),
  });

  if (!normalized.ok) {
    const fail = {
      runId,
      ok: false,
      errors: normalized.errors,
      note: 'hunter_normalize_failed',
    };
    writeFileSync(join(reportDir, 's9-canary-latest.json'), JSON.stringify(fail, null, 2));
    console.error(JSON.stringify(fail, null, 2));
    process.exit(1);
  }

  // Inject listing_card provenance + image into opportunity candidates for staging fixture
  let candidates = automationCandidatesFromHunterResult(normalized.result, {
    max: cap ?? 5,
  }).map((c) => ({
    ...c,
    opportunity: {
      ...c.opportunity,
      imageUrl:
        c.opportunity.imageUrl ??
        'https://http2.mlstatic.com/D_NQ_NP_2X_S9CANARY.jpg',
      signals: {
        ...(c.opportunity.signals ?? {}),
        originalPriceProvenance: 'listing_card' as const,
        cardDiscountSource: 'card_strikethrough' as const,
        historyReady: true,
      },
    },
  }));

  // Cap N≤5 hard
  candidates = candidates.slice(0, Math.min(5, cap ?? 5));

  const dry = await runSupplyAutomation({
    runId: `${runId}-dry`,
    mode: 'dry_run',
    candidates,
    cliCap: cap,
    skipAdapterFetch: true,
  });

  let live = null;
  if (execute) {
    if (!isSupplyAutomationEnabled()) {
      console.error('ABORT: SUPPLY_AUTOMATION_ENABLED must be true for --execute');
      process.exit(2);
    }
    live = await runSupplyAutomation({
      runId: `${runId}-live`,
      mode: 'execute',
      candidates,
      cliCap: cap,
      skipAdapterFetch: true,
    });
  }

  const report = {
    runId,
    mode: execute ? 'execute' : 'dry_run',
    productionRuntime: false,
    supplyAutomationEnabled: isSupplyAutomationEnabled(),
    dryLiveFingerprintMatch: live
      ? dry.decisionFingerprint === live.decisionFingerprint
      : null,
    dry: {
      metrics: dry.metrics,
      outcomes: dry.outcomes.map((o) => ({
        key: o.candidateKey,
        code: o.policyDecision.code,
        reasons: o.policyDecision.reasons,
        s8: o.policyDecision.s8Decision,
        score: o.policyDecision.s8Score,
      })),
      decisionFingerprint: dry.decisionFingerprint,
    },
    live: live
      ? {
          metrics: live.metrics,
          outcomes: live.outcomes.map((o) => ({
            key: o.candidateKey,
            policyCode: o.policyDecision.code,
            finalCode: o.decision.code,
            offerId: o.offerId,
            writeSuccess: o.writeSuccess,
            writeError: o.writeError,
          })),
          decisionFingerprint: live.decisionFingerprint,
        }
      : null,
    boundaries: {
      distribution: 'untouched',
      rewards: 'untouched',
      settlement: 'untouched',
      moneyFreeze: 'untouched',
      soleWriter: 'insertIngestedOffer',
    },
  };

  const out = join(reportDir, 's9-canary-latest.json');
  writeFileSync(out, JSON.stringify(report, null, 2));
  writeFileSync(
    join(reportDir, `s9-canary-${Date.now()}.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nWrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
