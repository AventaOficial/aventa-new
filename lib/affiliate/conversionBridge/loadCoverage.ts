/**
 * Carga de solo lectura para el War Room.
 * Si el lote no existe o el esquema no está atestiguado, el resultado es DATA INCOMPLETE.
 * No convierte esa ausencia en cero ventas.
 */

import { createServerClient } from '@/lib/supabase/server';
import type { CanonicalConversionState } from './contract';
import {
  incompleteSnapshot,
  productionCoverage,
  snapshotFromEvents,
  type CountableConversion,
  type GrowthProviderSnapshot,
  type ImportBatchSummary,
} from './growthRead';

function asStatus(value: unknown): CanonicalConversionState | null {
  if (value === 'PENDING' || value === 'APPROVED' || value === 'CONFIRMED' || value === 'REVERSED' || value === 'INVALID') {
    return value;
  }
  return null;
}

export async function loadAffiliateCoverage(now = new Date()): Promise<GrowthProviderSnapshot> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('affiliate_import_batches')
      .select('provider, status, test_data, imported_at, provider_data_at')
      .order('imported_at', { ascending: false })
      .limit(50);
    if (error) return incompleteSnapshot('provider_dataset_unavailable');
    const batches: ImportBatchSummary[] = (data ?? []).map((row) => ({
      provider: String(row.provider ?? ''),
      status: row.status === 'partial' || row.status === 'failed' ? row.status : 'succeeded',
      testData: row.test_data === true,
      importedAt: String(row.imported_at ?? ''),
      providerDataAt: row.provider_data_at ? String(row.provider_data_at) : null,
    }));
    const coverage = productionCoverage(batches);
    if (coverage.state !== 'CONNECTED' && coverage.state !== 'PARTIAL_DATA') return coverage;

    const conversions = await supabase
      .from('affiliate_conversions')
      .select('status, occurred_at, offer_id, network, raw_reference')
      .eq('network', 'mercadolibre')
      .eq('source', 'csv_import')
      .limit(5000);
    if (conversions.error) return incompleteSnapshot('provider_dataset_unavailable');
    const events: CountableConversion[] = [];
    for (const row of conversions.data ?? []) {
      const raw = (row.raw_reference ?? {}) as Record<string, unknown>;
      if (raw.test_data === true || raw.source_mode !== 'OFFICIAL_REPORT_IMPORT') continue;
      const canonical = asStatus(raw.canonical_status) ?? (row.status === 'confirmed' ? 'CONFIRMED' : row.status === 'reversed' ? 'REVERSED' : null);
      if (!canonical || canonical === 'INVALID') continue;
      const commission = Number(raw.confirmed_commission_cents ?? 0);
      events.push({
        occurredAt: String(row.occurred_at),
        canonicalStatus: canonical,
        confirmedCommissionCents: canonical === 'CONFIRMED' && Number.isFinite(commission) ? commission : 0,
        unmatched: raw.match_status === 'UNMATCHED',
        offerId: typeof row.offer_id === 'string' ? row.offer_id : null,
        retailer: 'mercadolibre',
        channel: typeof raw.utm_source === 'string' ? raw.utm_source : null,
        campaignKey: typeof raw.utm_campaign === 'string' ? raw.utm_campaign : null,
        content: typeof raw.utm_content === 'string' ? raw.utm_content : null,
        testData: false,
      });
    }
    return snapshotFromEvents({
      nowMs: now.getTime(),
      state: coverage.state,
      detail: coverage.detail,
      coveredProviders: coverage.coveredProviders,
      missingProviders: coverage.missingProviders,
      events,
      lastSuccessfulImportAt: coverage.lastSuccessfulImportAt,
      lastProviderDataAt: coverage.lastProviderDataAt,
      lastImportStatus: coverage.lastImportStatus,
    });
  } catch {
    return incompleteSnapshot('provider_dataset_unavailable');
  }
}
