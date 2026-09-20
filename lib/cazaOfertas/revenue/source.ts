/**
 * CazaOfertasss — FASE 3. Port de fuente de revenue + stubs oficiales.
 *
 * Los adapters Amazon/ML reales NO están implementados: no hay formato de
 * reporte confirmado en código. Sólo el contrato y stubs fail-closed.
 */

import { ADAPTER_NOT_IMPLEMENTED_REASON } from '../stores/adapter';
import type { CazaResult } from '../types';
import { failResult, okResult } from '../types';
import type {
  AffiliateRevenueProviderId,
  OpaqueProviderPayload,
  RawRevenueRecord,
  RevenueImportBatch,
} from './types';

export interface AffiliateRevenueSourceFetchInput {
  readonly batchId: string;
  readonly receivedAt: string;
  /**
   * Payload opaco opcional. Sin schema. Un adapter real lo interpretaría;
   * los stubs lo rechazan.
   */
  readonly opaque?: OpaqueProviderPayload;
}

export interface AffiliateRevenueSourceFetchResult {
  readonly batch: RevenueImportBatch;
  readonly records: readonly RawRevenueRecord[];
}

/**
 * Port: única superficie que conoce “cómo llega” un reporte.
 * El dominio de ingestión sólo ve RawRevenueRecord.
 */
export interface AffiliateRevenueSource {
  readonly provider: AffiliateRevenueProviderId;
  fetchBatch(
    input: AffiliateRevenueSourceFetchInput
  ): Promise<CazaResult<AffiliateRevenueSourceFetchResult>>;
}

function unsupportedSource(
  provider: AffiliateRevenueProviderId
): AffiliateRevenueSource {
  return {
    provider,
    async fetchBatch() {
      return failResult([
        ADAPTER_NOT_IMPLEMENTED_REASON,
        `revenue.source_unsupported:${provider}`,
        'revenue.official_report_format_unknown',
      ]);
    },
  };
}

/** Stub Amazon Associates MX — sin formato de reporte inventado. */
export function createUnsupportedAmazonAssociatesSource(): AffiliateRevenueSource {
  return unsupportedSource('amazon_associates_mx');
}

/** Stub Mercado Libre Afiliados — sin formato de reporte inventado. */
export function createUnsupportedMercadoLibreAffiliatesSource(): AffiliateRevenueSource {
  return unsupportedSource('mercadolibre_affiliates');
}

/**
 * Fuente InMemory para tests: entrega RawRevenueRecord ya proyectados
 * (fixtures manuales). No simula CSV/API de proveedor.
 */
export function createInMemoryAffiliateRevenueSource(
  provider: AffiliateRevenueProviderId,
  records: readonly RawRevenueRecord[]
): AffiliateRevenueSource {
  return {
    provider,
    async fetchBatch(input) {
      const filtered = records.filter((r) => r.provider === provider);
      return okResult({
        batch: {
          batchId: input.batchId,
          provider,
          receivedAt: input.receivedAt,
          recordCount: filtered.length,
          sourceLabel: 'in_memory_fixture',
          opaquePayloadPresent: Boolean(input.opaque),
        },
        records: filtered,
      });
    },
  };
}
