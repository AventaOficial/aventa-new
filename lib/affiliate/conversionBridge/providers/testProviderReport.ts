/**
 * Reporte sintético para pruebas del motor.
 * El esquema es de prueba. No es el export de Mercado Libre.
 * testData queda en true para no mezclarse con economía de producción.
 */

import type { NormalizedProviderEvent, ProviderParseResult } from '../contract';
import { parseCsvTable, sameHeaders } from '../csv';
import { majorToCents } from '../quality';
import { normalizeProviderStatus } from '../status';

export const TEST_PROVIDER_SCHEMA = 'TEST_PROVIDER_DATA_V1';

export const TEST_PROVIDER_HEADERS = [
  'external_conversion_id',
  'external_order_id',
  'click_reference',
  'offer_reference',
  'status',
  'gross_commission',
  'currency',
  'occurred_at',
  'provider_event_version',
] as const;

export function parseTestProviderReport(report: string, importedAt: string): ProviderParseResult {
  const table = parseCsvTable(report);
  if (!table) return { ok: false, code: 'EMPTY_REPORT' };
  if (!sameHeaders(table.headers, TEST_PROVIDER_HEADERS)) {
    return { ok: false, code: 'TEST_PROVIDER_SCHEMA_MISMATCH' };
  }
  const events: NormalizedProviderEvent[] = table.records.map((record, index) => {
    const commissionRaw = record.gross_commission ?? '';
    return {
      provider: 'MERCADOLIBRE',
      sourceMode: 'OFFICIAL_REPORT_IMPORT',
      testData: true,
      externalConversionId: record.external_conversion_id ?? '',
      externalOrderId: record.external_order_id || null,
      clickReference: record.click_reference || null,
      offerReference: record.offer_reference || null,
      occurredAt: record.occurred_at ?? '',
      providerStatus: record.status ?? '',
      canonicalStatus: normalizeProviderStatus(record.status),
      grossCommissionCents: commissionRaw ? (majorToCents(commissionRaw) ?? -1) : null,
      currency: record.currency || null,
      reversal: normalizeProviderStatus(record.status) === 'REVERSED',
      rowReference: `row:${table.rowNumbers[index] ?? index + 2}`,
      providerEventVersion: record.provider_event_version || TEST_PROVIDER_SCHEMA,
      importedAt,
    };
  });
  return { ok: true, events, schemaVersion: TEST_PROVIDER_SCHEMA };
}
