import { OBSERVATION_RULES } from '@/lib/despensa/observation';

/**
 * Política del motor de precios. Los umbrales de historial y ahorro son los de Despensa
 * (`OBSERVATION_RULES`); aquí solo se agregan los que necesita la captura.
 */
export const PRICE_OBSERVATION_POLICY = {
  version: 'price-observation-v2',
  windowDays: 90,
  /**
   * Un producto se sigue observando hasta este número de días después de que caduque la última
   * oferta que lo ancla. Debe permitir cubrir `minHistorySpanDays` aunque la oferta dure 7 días.
   */
  trackingDaysAfterExpiry: 45,
  dedupeWindowHours: OBSERVATION_RULES.dedupeWindowHours,
  minIndependentObservations: OBSERVATION_RULES.minIndependentObservations,
  minHistorySpanDays: OBSERVATION_RULES.minHistorySpanDays,
  minVerifiedDropPct: OBSERVATION_RULES.minVerifiedDropPct,
  /** El precio actual solo cuenta como vigente si se observó hace menos de esto. */
  maxCurrentAgeHours: 48,
  /** Diferencia máxima entre el precio publicado y el observado para tratarlos como el mismo. */
  currentPriceToleranceMxn: 0.01,
  /** Fuera de [low, high] × mediana previa, la observación va a cuarentena. */
  extremeLowRatio: 0.4,
  extremeHighRatio: 2.5,
  /** Observaciones en cuarentena consecutivas que confirman un cambio extremo. */
  persistenceConfirmations: 2,
  persistenceTolerancePct: 2,
  persistenceWindowDays: 7,
  /** Precio de lista contradicho: Aventa nunca vio un precio a menos de este % de la etiqueta. */
  listSeenTolerancePct: 5,
  /** Filas por oferta o por producto en una lectura (90 días de captura diaria caben). */
  maxRowsPerOffer: 120,
  /** 8 × 120 filas queda bajo el tope de 1000 filas de PostgREST. */
  offersPerQuery: 8,
  futureSkewMs: 10 * 60_000,
} as const;

export type ValidationStatus = 'valid' | 'quarantined' | 'invalid' | 'superseded';
export type ObservedAvailability = 'in_stock' | 'limited' | 'out_of_stock' | 'unknown';
export type ScopeKind = 'online' | 'store' | 'zone' | 'unknown';
export type ObservationScope = { kind: ScopeKind; label: string | null };

/** Tiendas cuyo item externo sirve de ancla de producto. */
export type CaptureSourceId = 'mercadolibre_mx' | 'amazon_mx';
/** Fuentes que la captura puede leer hoy. */
export type ActiveCaptureSourceId = 'mercadolibre_mx';
export type CaptureMethod = 'ml_official_api';

/**
 * Estado de cada fuente para la captura. Una fuente `retired` no se lee ni se puede activar
 * desde `app_config`; sus ofertas se omiten con `source_retired`.
 */
export const CAPTURE_SOURCE_STATUS: Record<CaptureSourceId, { status: 'official_api' | 'retired'; note: string }> = {
  mercadolibre_mx: { status: 'official_api', note: 'API oficial de Mercado Libre con el token de la aplicación de Aventa.' },
  amazon_mx: {
    status: 'retired',
    note:
      'Product Advertising API 5.0 retirada el 2026-05-15: responde 403 AccessDenied. La sucesora (Creators API) ' +
      'exige credenciales OAuth nuevas y no está integrada ni verificada para Aventa.',
  },
};

export function isActiveCaptureSource(id: CaptureSourceId): id is ActiveCaptureSourceId {
  return CAPTURE_SOURCE_STATUS[id].status === 'official_api';
}

/** Fila de `offer_price_snapshots` tal como la leen el motor y los lectores compatibles. */
export type StoredObservationRow = {
  id: string;
  offer_id: string;
  price: number | string;
  original_price?: number | string | null;
  source?: string | null;
  recorded_at: string;
  currency?: string | null;
  validation_status?: ValidationStatus | null;
  validation_reasons?: string[] | null;
  source_id?: string | null;
  external_item_id?: string | null;
  identity_key?: string | null;
  need_id?: string | null;
  variant_id?: string | null;
  presentation_key?: string | null;
  scope_kind?: ScopeKind | null;
  scope_label?: string | null;
  availability?: ObservedAvailability | null;
  corrects_snapshot_id?: string | null;
};

export const OBSERVATION_SELECT =
  'id, offer_id, price, original_price, source, recorded_at, currency, validation_status, validation_reasons, source_id, external_item_id, identity_key, need_id, variant_id, presentation_key, scope_kind, scope_label, availability, corrects_snapshot_id';
export const LEGACY_SNAPSHOT_SELECT = 'id, offer_id, price, original_price, source, recorded_at';

/** Un registro de estas fuentes corrige el precio: lo anterior no sirve de referencia. */
export const CORRECTION_SOURCES: ReadonlySet<string> = new Set(['update', 'manual']);

/**
 * Etiqueta pública del precio. Una sola por oferta, en este orden de prioridad.
 * - `verified_saving`: historial propio longitudinal y comparable respalda una bajada.
 * - `list_contradicted`: el historial nunca vio el precio de lista que muestra la tienda.
 * - `price_differs`: la tienda muestra hoy otro precio que el publicado en la oferta (promoción
 *   terminada, cupón, membresía o precio desactualizado). Se informa el observado, sin ahorro.
 * - `list_unconfirmed`: hay precio de lista mayor sin historial que lo respalde.
 * - `observed_price`: Aventa observó este precio hace poco; no hay ahorro demostrado.
 * - `insufficient`: no hay observación reciente y válida que confirme el precio.
 */
export type PriceEvidenceLabel =
  | 'verified_saving'
  | 'list_contradicted'
  | 'price_differs'
  | 'list_unconfirmed'
  | 'observed_price'
  | 'insufficient';

export const PRICE_EVIDENCE_LABELS: Record<PriceEvidenceLabel, string> = {
  verified_saving: 'Ahorro verificado',
  observed_price: 'Precio observado',
  price_differs: 'Precio en tienda distinto al publicado',
  list_unconfirmed: 'Precio de lista sin confirmar',
  list_contradicted: 'Precio de lista contradicho',
  insufficient: 'Información insuficiente',
};

/** Una fila cuenta como precio solo si es válida (o legado) y no es de producto agotado. */
export function isUsableSnapshot(row: Pick<StoredObservationRow, 'validation_status' | 'availability'>): boolean {
  const status = row.validation_status ?? null;
  return (status === null || status === 'valid') && row.availability !== 'out_of_stock';
}

/** Error de PostgREST/Postgres por columna inexistente: la migración aún no está aplicada. */
export function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  return /column .* does not exist|could not find the .* column/i.test(error.message ?? '');
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function toPrice(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}
