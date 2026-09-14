/**
 * Clasificación de registros financieros — única política reutilizable.
 * QA/staging/test NO cuentan como economía de producción.
 * No borra datos: solo clasifica para exclusión de métricas.
 */

export type FinancialRecordClass =
  | 'PRODUCTION'
  | 'SYNTHETIC_QA'
  | 'LEGACY_UNVERIFIED';

export type FinancialRecordSignals = {
  externalRef?: string | null;
  source?: string | null;
  notes?: string | null;
  meta?: unknown;
  trackingTag?: string | null;
};

const SYNTHETIC_REF_RE =
  /^(qa[-_]|staging[-_]?qa|test[-_]|synthetic[-_]|dummy[-_]|fixture[-_])/i;
const SYNTHETIC_TOKEN_RE =
  /\b(qa|staging[-_]?qa|synthetic|fixture|dummy|load[-_]?test)\b/i;

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function metaMarksSynthetic(meta: unknown): boolean {
  const m = asRecord(meta);
  if (!m) return false;
  if (m.staging_qa === true || m.is_qa === true || m.is_test === true || m.synthetic === true) {
    return true;
  }
  if (m.qa === true || m.test === true) return true;
  const env = typeof m.env === 'string' ? m.env.toLowerCase() : '';
  if (env === 'qa' || env === 'staging' || env === 'test') return true;
  const kind = typeof m.kind === 'string' ? m.kind.toLowerCase() : '';
  if (kind.includes('qa') || kind.includes('synthetic') || kind.includes('fixture')) return true;
  return false;
}

/**
 * Clasifica un registro de ledger / reward / payout.
 * Preferir señales explícitas (meta, external_ref) sobre heurísticas débiles.
 */
export function classifyFinancialRecord(signals: FinancialRecordSignals): FinancialRecordClass {
  if (metaMarksSynthetic(signals.meta)) return 'SYNTHETIC_QA';

  const ref = (signals.externalRef ?? '').trim();
  if (ref && SYNTHETIC_REF_RE.test(ref)) return 'SYNTHETIC_QA';
  if (ref && SYNTHETIC_TOKEN_RE.test(ref)) return 'SYNTHETIC_QA';

  const source = (signals.source ?? '').trim().toLowerCase();
  if (
    source === 'qa' ||
    source === 'test' ||
    source === 'staging' ||
    source === 'synthetic' ||
    source.startsWith('qa_') ||
    source.startsWith('staging')
  ) {
    return 'SYNTHETIC_QA';
  }

  const notes = (signals.notes ?? '').trim();
  if (notes && /\[(qa|staging-qa|synthetic|fixture)\]/i.test(notes)) return 'SYNTHETIC_QA';

  const tag = (signals.trackingTag ?? '').trim().toLowerCase();
  if (tag.startsWith('qa-') || tag.startsWith('staging-qa') || tag === 'qa') return 'SYNTHETIC_QA';

  // Sin señales de producción fuertes ni de QA → no inventar PRODUCTION para EPC.
  // Ledger con ref vacío/manual sin meta se trata como PRODUCTION si no hay marca QA
  // (imports reales suelen tener external_ref de red). Filas QA actuales SIEMPRE tienen ref.
  if (!ref && !source && !asRecord(signals.meta)) {
    return 'LEGACY_UNVERIFIED';
  }

  return 'PRODUCTION';
}

export function isSyntheticFinancialRecord(signals: FinancialRecordSignals): boolean {
  return classifyFinancialRecord(signals) === 'SYNTHETIC_QA';
}

/** Solo PRODUCTION entra a revenue confirmado / EPC productivo. */
export function isProductionFinancialRecord(signals: FinancialRecordSignals): boolean {
  return classifyFinancialRecord(signals) === 'PRODUCTION';
}

export function isConfirmedProductionEconomicEvent(signals: FinancialRecordSignals): boolean {
  return isProductionFinancialRecord(signals);
}

export type MoneyProvenanceKind =
  | 'confirmed_production'
  | 'estimated_opportunity'
  | 'no_production_data'
  | 'synthetic_excluded';

export function moneyProvenanceLabel(kind: MoneyProvenanceKind): string {
  switch (kind) {
    case 'confirmed_production':
      return 'Confirmed production data';
    case 'estimated_opportunity':
      return 'Estimated from historical production data';
    case 'no_production_data':
      return 'No production data';
    case 'synthetic_excluded':
      return 'Synthetic/QA data excluded';
  }
}
