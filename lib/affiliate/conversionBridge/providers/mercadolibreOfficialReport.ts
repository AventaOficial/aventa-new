/**
 * Mercado Libre — importación de reporte oficial.
 *
 * No hay API pública de conversiones/comisiones del Programa de Afiliados.
 * El reporte de vendedor (Seller) no es autoridad de afiliado.
 * Hasta que el esquema de columnas del export de la Central esté publicado
 * y atestiguado, este adaptador rechaza el archivo y no escribe economía.
 *
 * SOURCE_MODE = OFFICIAL_REPORT_IMPORT
 */

import { MERCADOLIBRE_OFFICIAL_REPORT_SCHEMA } from '@/lib/economy/providers/mercadolibre/capabilityMatrix';
import type { AffiliateProviderAdapter, ProviderParseResult } from '../contract';
import { sameHeaders } from '../csv';
import { containsSensitiveMaterial } from '../quality';

export const MERCADOLIBRE_SOURCE_MODE = 'OFFICIAL_REPORT_IMPORT' as const;

/** Vacío a propósito: no se inventan columnas de un export no publicado. */
export const MERCADOLIBRE_ATTESTED_REPORT_HEADERS: readonly (readonly string[])[] = [];

export const MERCADOLIBRE_OFFICIAL_REPORT_SCHEMA_ATTESTED = false as const;

export function parseMercadoLibreOfficialReport(report: string, _importedAt: string): ProviderParseResult {
  if (!report.trim()) return { ok: false, code: 'EMPTY_REPORT' };
  const headerLine = report.replace(/^\uFEFF/, '').split(/\r?\n/).find((line) => line.trim()) ?? '';
  if (containsSensitiveMaterial(headerLine)) {
    return { ok: false, code: 'PII_OR_SELLER_REPORT_REFUSED' };
  }
  const headers = headerLine.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''));
  const attested = MERCADOLIBRE_ATTESTED_REPORT_HEADERS.some((expected) => sameHeaders(headers, expected));
  if (!attested || !MERCADOLIBRE_OFFICIAL_REPORT_SCHEMA_ATTESTED) {
    return { ok: false, code: MERCADOLIBRE_OFFICIAL_REPORT_SCHEMA };
  }
  return { ok: false, code: MERCADOLIBRE_OFFICIAL_REPORT_SCHEMA };
}

export const mercadoLibreOfficialReportAdapter: AffiliateProviderAdapter = {
  provider: 'MERCADOLIBRE',
  sourceMode: MERCADOLIBRE_SOURCE_MODE,
  providerEventVersion: 'mercadolibre-official-report-unattested',
  testData: false,
  parseReport: parseMercadoLibreOfficialReport,
};
