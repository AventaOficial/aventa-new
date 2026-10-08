/**
 * Importación del owner. Mercado Libre rechaza el archivo mientras el esquema
 * oficial no esté publicado. No informa cero ventas.
 */

import { randomUUID } from 'node:crypto';
import { evaluateEconomicActivationGate } from '@/lib/economy/activation/economicActivationGate';
import { isMoneyPathFrozen, isProductionRuntime } from '@/lib/server/moneyPathFreeze';
import type { AffiliateProviderAdapter } from './contract';
import { executeImport, type EconomicPort } from './executeImport';
import { failedImportBatch, importProviderEvents } from './importEngine';
import type { ClickSnapshot } from './match';
import type { ExistingConversion } from './importEngine';
import { mercadoLibreOfficialReportAdapter } from './providers/mercadolibreOfficialReport';

export type OwnerImportBody = {
  ok: false | true;
  provider: 'MERCADOLIBRE';
  sourceMode: 'OFFICIAL_REPORT_IMPORT';
  importStatus: 'failed' | 'partial' | 'succeeded';
  code: string | null;
  economicsWritten: number;
  payoutsCreated: 0;
  confirmedSales: number | null;
  coverage: 'DATA_INCOMPLETE' | 'PARTIAL_DATA' | 'CONNECTED' | 'DATA_DELAYED' | 'PROVIDER_IMPORT_FAILED';
  economicFirewall: {
    moneyPathFrozen: boolean;
    payout: 'BLOCKED' | 'ALLOWED';
    rewardsProgramActive: boolean;
    rewardsPayoutEnabled: boolean;
  };
};

function firewall() {
  return {
    moneyPathFrozen: isMoneyPathFrozen(),
    payout: evaluateEconomicActivationGate().payout,
    rewardsProgramActive: process.env.REWARDS_PROGRAM_ACTIVE === 'true',
    rewardsPayoutEnabled: process.env.REWARDS_PAYOUT_ENABLED === 'true',
  };
}

export async function runOwnerImport(input: {
  report: string;
  now?: Date;
  adapter?: AffiliateProviderAdapter;
  clicks?: readonly ClickSnapshot[];
  existing?: readonly ExistingConversion[];
  port?: EconomicPort;
  allowTestProviderData?: boolean;
}): Promise<{ httpStatus: number; body: OwnerImportBody }> {
  const now = input.now ?? new Date();
  const adapter = input.adapter ?? mercadoLibreOfficialReportAdapter;
  const blockedTest = adapter.testData && (isProductionRuntime() || input.allowTestProviderData !== true);
  const base = {
    provider: 'MERCADOLIBRE' as const,
    sourceMode: 'OFFICIAL_REPORT_IMPORT' as const,
    payoutsCreated: 0 as const,
    confirmedSales: null,
    economicFirewall: firewall(),
  };
  if (blockedTest) {
    return {
      httpStatus: 422,
      body: {
        ...base,
        ok: false,
        importStatus: 'failed',
        code: 'TEST_PROVIDER_DATA_REJECTED',
        economicsWritten: 0,
        coverage: 'DATA_INCOMPLETE',
      },
    };
  }
  const importedAt = now.toISOString();
  const parsed = adapter.parseReport(input.report, importedAt);
  if (!parsed.ok) {
    const batch = failedImportBatch({
      batchId: randomUUID(),
      importedAt,
      schemaVersion: adapter.providerEventVersion,
      testData: adapter.testData,
      errorCode: parsed.code,
    });
    if (input.port) await input.port.insertBatch(batch);
    return {
      httpStatus: 422,
      body: {
        ...base,
        ok: false,
        importStatus: 'failed',
        code: parsed.code,
        economicsWritten: 0,
        coverage: 'DATA_INCOMPLETE',
      },
    };
  }
  const batch = importProviderEvents({
    batchId: randomUUID(),
    importedAt,
    nowMs: now.getTime(),
    schemaVersion: parsed.schemaVersion,
    testData: adapter.testData,
    events: parsed.events,
    clicks: input.clicks ?? [],
    existing: input.existing ?? [],
  });
  const executed = input.port
    ? await executeImport(batch, input.port, { allowTestProviderData: input.allowTestProviderData === true })
    : { economicsWritten: 0, payoutsCreated: 0 as const };
  const measurable = batch.status !== 'failed' && !adapter.testData;
  return {
    httpStatus: batch.status === 'failed' ? 422 : 200,
    body: {
      ...base,
      ok: batch.status !== 'failed',
      importStatus: batch.status,
      code: batch.errorCode,
      economicsWritten: executed.economicsWritten,
      confirmedSales: measurable ? batch.confirmed : null,
      coverage: measurable ? 'PARTIAL_DATA' : 'DATA_INCOMPLETE',
    },
  };
}
