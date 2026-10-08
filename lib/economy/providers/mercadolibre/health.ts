/**
 * Health snapshot for CEO / ops — never crashes if misconfigured.
 */

import {
  MERCADOLIBRE_AFFILIATE_ECONOMIC_INGEST_SUPPORTED,
  MERCADOLIBRE_AUTOMATION_STATUS,
  MERCADOLIBRE_DISCOVERY_CLASSIFICATION,
  MERCADOLIBRE_OFFICIAL_REPORT_SCHEMA,
  summarizeMercadoLibreAffiliateCapabilities,
} from './capabilityMatrix';
import { getMercadoLibreAffiliateConfig } from './config';
import { getMercadoLibreAffiliateMetrics } from './metrics';

export type MercadoLibreAffiliateHealth = {
  provider: 'mercadolibre';
  enabled: boolean;
  configured: boolean;
  /** Economic ingest connected — always false until official API exists. */
  connected: false;
  mode: string;
  linkTaggingConfigured: boolean;
  lastSync: string | null;
  lastError: string | null;
  settlementEnabled: false;
  economicIngestSupported: false;
  automationStatus: typeof MERCADOLIBRE_AUTOMATION_STATUS;
  classification: typeof MERCADOLIBRE_DISCOVERY_CLASSIFICATION;
  officialReportSchema: typeof MERCADOLIBRE_OFFICIAL_REPORT_SCHEMA;
  attributionWindowHours: number;
  metrics: ReturnType<typeof getMercadoLibreAffiliateMetrics>;
  capabilitySummary: ReturnType<typeof summarizeMercadoLibreAffiliateCapabilities>;
  note: string;
};

export function buildMercadoLibreAffiliateHealth(): MercadoLibreAffiliateHealth {
  const cfg = getMercadoLibreAffiliateConfig();
  const metrics = getMercadoLibreAffiliateMetrics();
  return {
    provider: 'mercadolibre',
    enabled: cfg.enabled,
    configured: cfg.linkTaggingConfigured,
    connected: false,
    mode: cfg.mode,
    linkTaggingConfigured: cfg.linkTaggingConfigured,
    lastSync: metrics.lastSuccessfulSyncAt,
    lastError: metrics.lastErrorCode,
    settlementEnabled: false,
    economicIngestSupported: MERCADOLIBRE_AFFILIATE_ECONOMIC_INGEST_SUPPORTED,
    automationStatus: MERCADOLIBRE_AUTOMATION_STATUS,
    classification: MERCADOLIBRE_DISCOVERY_CLASSIFICATION,
    officialReportSchema: MERCADOLIBRE_OFFICIAL_REPORT_SCHEMA,
    attributionWindowHours: cfg.attributionWindowHours,
    metrics,
    capabilitySummary: summarizeMercadoLibreAffiliateCapabilities(),
    note: cfg.note,
  };
}
