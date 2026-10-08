/**
 * Lectura de crecimiento. No muta economía.
 * null significa que el dato no es confiable. No es cero.
 */

import { SALES_WINDOW_START_MS } from '@/lib/growth/campaignContext';
import type { CanonicalConversionState } from './contract';
import { MERCADOLIBRE_OFFICIAL_REPORT_SCHEMA_ATTESTED } from './providers/mercadolibreOfficialReport';

export const PROVIDER_DATASET_STATES = [
  'DATA_INCOMPLETE',
  'PARTIAL_DATA',
  'CONNECTED',
  'DATA_DELAYED',
  'PROVIDER_IMPORT_FAILED',
] as const;

export type ProviderDatasetState = (typeof PROVIDER_DATASET_STATES)[number];

export type ProviderWindowCounts = {
  confirmedSales: number;
  pendingConversions: number;
  reversedConversions: number;
  unmatchedConversions: number;
  confirmedCommissionCents: number;
};

export type GrowthProviderSnapshot = {
  state: ProviderDatasetState;
  detail: string;
  coveredProviders: string[];
  missingProviders: string[];
  today: ProviderWindowCounts | null;
  d7: ProviderWindowCounts | null;
  d30: ProviderWindowCounts | null;
  sinceLaunch: ProviderWindowCounts | null;
  channels: Array<{ channel: string; confirmedSales: number | null; confirmedCommissionCents: number | null }>;
  campaigns: Array<{
    campaignKey: string;
    source: string | null;
    content: string | null;
    confirmedSales: number | null;
    confirmedCommissionCents: number | null;
  }>;
  offers: Array<{
    offerId: string;
    pendingConversions: number;
    confirmedSales: number;
    reversedConversions: number;
    confirmedCommissionCents: number;
  }>;
  retailers: Array<{ id: string; confirmedSales: number | null; confirmedCommissionCents: number | null }>;
  content: Array<{ contentId: string; confirmedSales: number; confirmedCommissionCents: number }>;
  lastSuccessfulImportAt: string | null;
  lastProviderDataAt: string | null;
  lastImportStatus: 'succeeded' | 'partial' | 'failed' | null;
};

export type CountableConversion = {
  occurredAt: string;
  canonicalStatus: CanonicalConversionState;
  confirmedCommissionCents: number;
  unmatched: boolean;
  offerId: string | null;
  retailer: string | null;
  channel: string | null;
  campaignKey: string | null;
  content: string | null;
  testData: boolean;
};

export type ImportBatchSummary = {
  status: 'succeeded' | 'partial' | 'failed';
  testData: boolean;
  importedAt: string;
  providerDataAt: string | null;
  provider: string;
};

const EMPTY_COUNTS: ProviderWindowCounts = {
  confirmedSales: 0,
  pendingConversions: 0,
  reversedConversions: 0,
  unmatchedConversions: 0,
  confirmedCommissionCents: 0,
};

export function incompleteSnapshot(detail: string): GrowthProviderSnapshot {
  return {
    state: 'DATA_INCOMPLETE',
    detail,
    coveredProviders: [],
    missingProviders: ['mercadolibre', 'amazon'],
    today: null,
    d7: null,
    d30: null,
    sinceLaunch: null,
    channels: [],
    campaigns: [],
    offers: [],
    retailers: [],
    content: [],
    lastSuccessfulImportAt: null,
    lastProviderDataAt: null,
    lastImportStatus: null,
  };
}

export function classifyProviderCoverage(input: {
  schemaAttested: boolean;
  batches: readonly ImportBatchSummary[];
  amazonConnected?: boolean;
}): Pick<GrowthProviderSnapshot, 'state' | 'detail' | 'coveredProviders' | 'missingProviders' | 'lastSuccessfulImportAt' | 'lastProviderDataAt' | 'lastImportStatus'> {
  const real = input.batches.filter((batch) => !batch.testData && batch.provider === 'MERCADOLIBRE');
  const last = real[0] ?? null;
  const success = real.find((batch) => batch.status === 'succeeded' || batch.status === 'partial') ?? null;
  const covered = success && input.schemaAttested ? ['mercadolibre'] : [];
  const missing = ['amazon', ...(covered.includes('mercadolibre') ? [] : ['mercadolibre'])];
  const base = {
    coveredProviders: covered,
    missingProviders: missing,
    lastSuccessfulImportAt: success?.importedAt ?? null,
    lastProviderDataAt: success?.providerDataAt ?? null,
    lastImportStatus: last?.status ?? null,
  };
  if (!input.schemaAttested) {
    return { ...base, state: 'DATA_INCOMPLETE', detail: 'official_report_schema_not_published' };
  }
  if (!success && last?.status === 'failed') {
    return { ...base, state: 'PROVIDER_IMPORT_FAILED', detail: 'provider_import_failed' };
  }
  if (!success) {
    return { ...base, state: 'DATA_DELAYED', detail: 'provider_report_not_imported' };
  }
  if (!input.amazonConnected) {
    return { ...base, state: 'PARTIAL_DATA', detail: 'covered:mercadolibre missing:amazon' };
  }
  return { ...base, state: 'CONNECTED', detail: 'mercadolibre' };
}

function add(target: ProviderWindowCounts, event: CountableConversion): void {
  if (event.canonicalStatus === 'CONFIRMED') {
    target.confirmedSales += 1;
    target.confirmedCommissionCents += event.confirmedCommissionCents;
  } else if (event.canonicalStatus === 'PENDING' || event.canonicalStatus === 'APPROVED') {
    target.pendingConversions += 1;
  } else if (event.canonicalStatus === 'REVERSED') {
    target.reversedConversions += 1;
  }
  if (event.unmatched) target.unmatchedConversions += 1;
}

function countsBetween(events: CountableConversion[], startMs: number, endMs: number): ProviderWindowCounts {
  const totals = { ...EMPTY_COUNTS };
  for (const event of events) {
    const ms = Date.parse(event.occurredAt);
    if (!Number.isFinite(ms) || ms < startMs || ms > endMs) continue;
    add(totals, event);
  }
  return totals;
}

export function snapshotFromEvents(input: {
  nowMs: number;
  state: ProviderDatasetState;
  detail: string;
  coveredProviders: string[];
  missingProviders: string[];
  events: readonly CountableConversion[];
  lastSuccessfulImportAt: string | null;
  lastProviderDataAt: string | null;
  lastImportStatus: GrowthProviderSnapshot['lastImportStatus'];
}): GrowthProviderSnapshot {
  const measurable = input.state === 'CONNECTED' || input.state === 'PARTIAL_DATA';
  const events = input.events.filter((event) => !event.testData);
  const empty = incompleteSnapshot(input.detail);
  if (!measurable) {
    return {
      ...empty,
      state: input.state,
      detail: input.detail,
      coveredProviders: input.coveredProviders,
      missingProviders: input.missingProviders,
      lastSuccessfulImportAt: input.lastSuccessfulImportAt,
      lastProviderDataAt: input.lastProviderDataAt,
      lastImportStatus: input.lastImportStatus,
    };
  }
  const nowMs = input.nowMs;
  const sinceStart = nowMs >= SALES_WINDOW_START_MS;
  const windows = {
    today: countsBetween(events, nowMs - 24 * 3600_000, nowMs),
    d7: countsBetween(events, nowMs - 7 * 24 * 3600_000, nowMs),
    d30: countsBetween(events, nowMs - 30 * 24 * 3600_000, nowMs),
    sinceLaunch: sinceStart ? countsBetween(events, SALES_WINDOW_START_MS, nowMs) : null,
  };
  return {
    state: input.state,
    detail: input.detail,
    coveredProviders: input.coveredProviders,
    missingProviders: input.missingProviders,
    ...windows,
    channels: groupConfirmed(events, (event) => event.channel),
    campaigns: campaignRows(events),
    offers: offerRows(events),
    retailers: groupConfirmed(events, (event) => event.retailer).map((row) => ({
      id: row.channel,
      confirmedSales: row.confirmedSales,
      confirmedCommissionCents: row.confirmedCommissionCents,
    })),
    content: contentRows(events),
    lastSuccessfulImportAt: input.lastSuccessfulImportAt,
    lastProviderDataAt: input.lastProviderDataAt,
    lastImportStatus: input.lastImportStatus,
  };
}

function groupConfirmed(
  events: CountableConversion[],
  keyOf: (event: CountableConversion) => string | null,
): Array<{ channel: string; confirmedSales: number | null; confirmedCommissionCents: number | null }> {
  const map = new Map<string, { confirmedSales: number; confirmedCommissionCents: number }>();
  for (const event of events) {
    if (event.canonicalStatus !== 'CONFIRMED') continue;
    const key = keyOf(event);
    if (!key) continue;
    const current = map.get(key) ?? { confirmedSales: 0, confirmedCommissionCents: 0 };
    current.confirmedSales += 1;
    current.confirmedCommissionCents += event.confirmedCommissionCents;
    map.set(key, current);
  }
  return [...map.entries()].map(([channel, value]) => ({ channel, ...value }));
}

function campaignRows(events: CountableConversion[]): GrowthProviderSnapshot['campaigns'] {
  const map = new Map<string, GrowthProviderSnapshot['campaigns'][number]>();
  for (const event of events) {
    if (event.canonicalStatus !== 'CONFIRMED' || !event.campaignKey) continue;
    const current = map.get(event.campaignKey) ?? {
      campaignKey: event.campaignKey,
      source: event.channel,
      content: event.content,
      confirmedSales: 0,
      confirmedCommissionCents: 0,
    };
    current.confirmedSales = (current.confirmedSales ?? 0) + 1;
    current.confirmedCommissionCents = (current.confirmedCommissionCents ?? 0) + event.confirmedCommissionCents;
    map.set(event.campaignKey, current);
  }
  return [...map.values()];
}

function offerRows(events: CountableConversion[]): GrowthProviderSnapshot['offers'] {
  const map = new Map<string, GrowthProviderSnapshot['offers'][number]>();
  for (const event of events) {
    if (!event.offerId) continue;
    const current = map.get(event.offerId) ?? {
      offerId: event.offerId,
      pendingConversions: 0,
      confirmedSales: 0,
      reversedConversions: 0,
      confirmedCommissionCents: 0,
    };
    if (event.canonicalStatus === 'CONFIRMED') {
      current.confirmedSales += 1;
      current.confirmedCommissionCents += event.confirmedCommissionCents;
    } else if (event.canonicalStatus === 'PENDING' || event.canonicalStatus === 'APPROVED') {
      current.pendingConversions += 1;
    } else if (event.canonicalStatus === 'REVERSED') {
      current.reversedConversions += 1;
    }
    map.set(event.offerId, current);
  }
  return [...map.values()].sort((a, b) => b.confirmedSales - a.confirmedSales);
}

function contentRows(events: CountableConversion[]): GrowthProviderSnapshot['content'] {
  const map = new Map<string, { contentId: string; confirmedSales: number; confirmedCommissionCents: number }>();
  for (const event of events) {
    if (event.canonicalStatus !== 'CONFIRMED' || !event.content) continue;
    const current = map.get(event.content) ?? { contentId: event.content, confirmedSales: 0, confirmedCommissionCents: 0 };
    current.confirmedSales += 1;
    current.confirmedCommissionCents += event.confirmedCommissionCents;
    map.set(event.content, current);
  }
  return [...map.values()];
}

export function productionCoverage(batches: readonly ImportBatchSummary[]): GrowthProviderSnapshot {
  const classified = classifyProviderCoverage({
    schemaAttested: MERCADOLIBRE_OFFICIAL_REPORT_SCHEMA_ATTESTED,
    batches,
    amazonConnected: false,
  });
  return {
    ...incompleteSnapshot(classified.detail),
    ...classified,
  };
}
