import {
  SETTLEMENT_EXTERNAL_REF_PREFIX,
  SETTLEMENT_REVERSAL_PREFIX,
} from '@/lib/economy/ledger/canonicalLedgerAuthority';
import { isProductionFinancialRecord } from '@/lib/finance/financialRecordClass';

export type LedgerEconomicKind = 'settlement' | 'reversal' | 'evidence' | 'unscoped_api' | 'synthetic';

export type LedgerEconomicInput = {
  externalRef?: string | null;
  source?: string | null;
  notes?: string | null;
  meta?: unknown;
  trackingTag?: string | null;
};

/** El reconocimiento es el prefijo settlement. CSV y manual son evidencia. source=api sin prefijo no entra. */
export function classifyLedgerEconomicKind(row: LedgerEconomicInput): LedgerEconomicKind {
  if (
    !isProductionFinancialRecord({
      externalRef: row.externalRef,
      source: row.source,
      notes: row.notes,
      meta: row.meta,
      trackingTag: row.trackingTag,
    })
  ) {
    return 'synthetic';
  }
  const ref = (row.externalRef ?? '').trim().toLowerCase();
  if (ref.startsWith(SETTLEMENT_REVERSAL_PREFIX)) return 'reversal';
  if (ref.startsWith(SETTLEMENT_EXTERNAL_REF_PREFIX)) return 'settlement';
  const source = (row.source ?? '').trim().toLowerCase();
  if (source === 'csv_import' || source === 'manual') return 'evidence';
  return 'unscoped_api';
}
