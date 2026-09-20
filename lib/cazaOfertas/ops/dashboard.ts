/**
 * CazaOfertasss — FASE 3.3. Operating dashboard contract.
 *
 * Contrato para un futuro dashboard. No UI. No cron.
 * Analytics only — nunca money authority de Aventa.
 */

import type { IsoTimestamp, MoneyAmount } from '../types';
import type { CazaFunnelSnapshot } from './funnel';
import type { CazaDailySnapshot } from './dailySnapshot';
import type { PublicationPerformanceRecord } from './publicationPerformance';
import type { TelegramPublicationObservables } from './telegramMetrics';

export interface CazaOpsTodayPanel {
  readonly dealsFound: number | null;
  readonly dealsPublished: number | null;
  readonly telegramSends: number | null;
  readonly clicks: number | null;
  readonly attributedEvents: number | null;
  /** Solo known revenue con evidencia; null si UNKNOWN. */
  readonly knownRevenue: MoneyAmount | null;
}

export interface CazaOpsPipelinePanel {
  readonly prepared: number | null;
  readonly sending: number | null;
  readonly retry: number | null;
  readonly failed: number | null;
}

export interface CazaOpsQualityPanel {
  readonly evidenceQualityBreakdown: Readonly<Record<string, number | null>>;
  readonly staleDeals: number | null;
  readonly rejectedDeals: number | null;
  readonly affiliateEligibilityFailures: number | null;
}

export interface CazaOpsTopPerformersPanel {
  readonly publications: readonly PublicationPerformanceRecord[];
  readonly stores: readonly { key: string; count: number }[];
  readonly categories: readonly { key: string; count: number }[];
}

export interface CazaOpsRevenuePanel {
  readonly known: MoneyAmount | null;
  readonly pending: MoneyAmount | null;
  /** Siempre null como monto; flag separado para “hay señales UNKNOWN”. */
  readonly unknown: null;
  readonly unknownSignalCount: number | null;
}

export interface CazaOpsDashboardContract {
  readonly asOf: IsoTimestamp;
  readonly today: CazaOpsTodayPanel;
  readonly pipeline: CazaOpsPipelinePanel;
  readonly quality: CazaOpsQualityPanel;
  readonly topPerformers: CazaOpsTopPerformersPanel;
  readonly revenue: CazaOpsRevenuePanel;
  readonly funnel: CazaFunnelSnapshot | null;
  readonly daily: CazaDailySnapshot | null;
  readonly telegramSample: readonly TelegramPublicationObservables[];
  readonly schemaVersion: 'caza.ops.dashboard.v1';
}

export function emptyOpsDashboard(asOf: IsoTimestamp): CazaOpsDashboardContract {
  return {
    asOf,
    today: {
      dealsFound: null,
      dealsPublished: null,
      telegramSends: null,
      clicks: null,
      attributedEvents: null,
      knownRevenue: null,
    },
    pipeline: {
      prepared: null,
      sending: null,
      retry: null,
      failed: null,
    },
    quality: {
      evidenceQualityBreakdown: {},
      staleDeals: null,
      rejectedDeals: null,
      affiliateEligibilityFailures: null,
    },
    topPerformers: {
      publications: [],
      stores: [],
      categories: [],
    },
    revenue: {
      known: null,
      pending: null,
      unknown: null,
      unknownSignalCount: null,
    },
    funnel: null,
    daily: null,
    telegramSample: [],
    schemaVersion: 'caza.ops.dashboard.v1',
  };
}

export function buildOpsDashboard(
  partial: Omit<CazaOpsDashboardContract, 'schemaVersion'>
): CazaOpsDashboardContract {
  return {
    ...partial,
    schemaVersion: 'caza.ops.dashboard.v1',
  };
}
