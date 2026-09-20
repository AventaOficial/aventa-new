/**
 * CazaOfertasss — FASE 3.2. Provider report reconciliation interface.
 *
 * CONTRATO ONLY. No implementa Amazon ni Mercado Libre.
 * Une RawProviderRevenueRecord → normalized → attribution candidate.
 */

import type { CazaResult } from '../types';
import { failResult } from '../types';
import type { NormalizedRevenueEvent } from './types';
import type { AttributionCandidate } from '../tracking/attributionCandidate';
import type { RawRevenueRecord } from './types';

/**
 * Alias explícito FASE 3.2 del registro crudo provider-neutral.
 * Los adapters futuros (cuando exista documentación) producen ESTE shape,
 * no columnas inventadas de un CSV concreto.
 */
export type RawProviderRevenueRecord = RawRevenueRecord;

export interface ProviderReportReconciliationInput {
  readonly raw: RawProviderRevenueRecord;
  readonly recordedAt: string;
}

export interface ProviderReportReconciliationResult {
  readonly normalized: NormalizedRevenueEvent | null;
  readonly attribution: AttributionCandidate;
  readonly rejected: boolean;
  readonly reasons: readonly string[];
}

/**
 * Port de reconciliación de un reporte provider.
 * Implementaciones reales viven fuera del dominio (providers/*) cuando existan.
 */
export interface ProviderReportReconciliationPort {
  reconcile(
    input: ProviderReportReconciliationInput
  ): Promise<CazaResult<ProviderReportReconciliationResult>>;
}

/**
 * Stub fail-closed: no hay provider concreto activado en FASE 3.2.
 */
export function createUnsupportedProviderReportReconciliation(): ProviderReportReconciliationPort {
  return {
    async reconcile() {
      return failResult([
        'provider_report.no_official_source_configured',
        'provider_report.amazon_adapter_not_implemented',
        'provider_report.mercadolibre_adapter_not_implemented',
      ]);
    },
  };
}
