/**
 * CazaOfertasss — FASE 3. Contratos provider-neutral de revenue ingestion.
 *
 * Capas (autoridad estricta, de arriba hacia abajo):
 *   AffiliateRevenueSource → RawRevenueRecord → NormalizedRevenueEvent
 *   → Validation → FinancialRevenueEvent (ledger append-only)
 *   → Attribution (capa separada) → Reconciliation → Metrics
 *
 * NO inventa formatos de reportes Amazon/ML. Los adapters reales quedan stub.
 */

import type {
  AffiliateNetworkId,
  CazaCurrency,
  IsoTimestamp,
  MoneyAmount,
} from '../types';

/** Proveedor de reporte. Alineado 1:1 con redes de afiliación soportadas. */
export type AffiliateRevenueProviderId = AffiliateNetworkId;

/**
 * Payload crudo OPACO. El contenido `payload` no se interpreta en el dominio:
 * sólo un adapter futuro (aún no implementado) sabe parsearlo.
 * FASE 3 exige que, tras parsear, el adapter produzca `RawRevenueRecord` fields.
 */
export interface OpaqueProviderPayload {
  readonly contentType: 'unsupported' | 'manual_fixture' | 'future_official_export';
  /** Bytes/texto sin schema asumido. Nunca se parsea en el core. */
  readonly body: string;
  readonly sha256?: string;
}

/**
 * Registro crudo YA proyectado a campos neutrales.
 * Es el contrato mínimo que cualquier adapter oficial deberá llenar.
 * No equivale a columnas de un CSV de Amazon o ML.
 */
export interface RawRevenueRecord {
  readonly provider: AffiliateRevenueProviderId;
  /** Referencia externa del proveedor (order id, commission id, etc.). */
  readonly externalReference: string;
  readonly eventType: NormalizedRevenueEventType;
  readonly occurredAt: IsoTimestamp;
  readonly currency: string | null;
  /** Monto bruto de la venta si el proveedor lo reporta; null si desconocido. */
  readonly grossAmount: number | string | null;
  /** Comisión reportada; null si el evento no porta dinero. */
  readonly commissionAmount: number | string | null;
  readonly status: NormalizedRevenueStatus;
  /** Metadata de producto/referencia — strings opacos, sin schema de tienda. */
  readonly productReference: string | null;
  readonly externalProductId: string | null;
  /**
   * Identificador de tracking tal como aparece en el reporte (o null).
   * null ⇒ atribución UNKNOWN; nunca se inventa.
   */
  readonly trackingIdentifier: string | null;
  readonly sourceBatchId: string;
  readonly sourceMetadata: Readonly<Record<string, string>>;
  /** Evento que este registro revierte/cancela, si aplica. */
  readonly reversesExternalReference: string | null;
  readonly receivedAt: IsoTimestamp;
}

/**
 * Tipos de hecho económico. El ciclo de vida NO muta filas:
 * pending → approved = NUEVOS eventos de tipos distintos (u ORDER → APPROVED_ORDER).
 */
export type NormalizedRevenueEventType =
  | 'CLICK'
  | 'ORDER'
  | 'APPROVED_ORDER'
  | 'COMMISSION'
  | 'REVERSAL'
  | 'CANCELLATION';

/**
 * Estado del hecho en el momento del reporte.
 * CANCELLED/REVERSED se materializan también vía tipos CANCELLATION/REVERSAL.
 */
export type NormalizedRevenueStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'CANCELLED'
  | 'REVERSED';

/** Evento normalizado (aún no es el ledger financiero). */
export interface NormalizedRevenueEvent {
  readonly provider: AffiliateRevenueProviderId;
  readonly externalReference: string;
  readonly eventType: NormalizedRevenueEventType;
  readonly occurredAt: IsoTimestamp;
  readonly currency: CazaCurrency | null;
  readonly grossAmount: MoneyAmount | null;
  readonly commissionAmount: MoneyAmount | null;
  readonly status: NormalizedRevenueStatus;
  readonly productReference: string | null;
  readonly externalProductId: string | null;
  readonly trackingIdentifier: string | null;
  readonly sourceBatchId: string;
  readonly sourceMetadata: Readonly<Record<string, string>>;
  readonly reversesExternalReference: string | null;
  readonly receivedAt: IsoTimestamp;
  /** Clave de idempotencia lógica: provider + externalReference + eventType. */
  readonly idempotencyKey: string;
}

/**
 * Decisión de atribución — capa SEPARADA del hecho financiero.
 * Nunca se inventa: sin match explícito ⇒ UNKNOWN.
 */
export type RevenueAttributionDecision =
  | 'ATTRIBUTED'
  | 'UNKNOWN'
  | 'UNMATCHED_TRACKING';

export interface RevenueAttributionRecord {
  readonly attributionId: string;
  readonly eventId: string;
  readonly decision: RevenueAttributionDecision;
  readonly publicationId: string | null;
  readonly dealId: string | null;
  readonly trackingIdentifier: string | null;
  readonly reason: string;
  readonly decidedAt: IsoTimestamp;
}

/** Snapshot de reconciliación determinista derivado del ledger (recalculable). */
export interface RevenueReconciliationSnapshot {
  readonly provider: AffiliateRevenueProviderId;
  readonly externalReference: string;
  readonly orderPending: boolean;
  readonly orderApproved: boolean;
  readonly orderCancelled: boolean;
  readonly commissionPendingAmount: MoneyAmount | null;
  readonly commissionApprovedAmount: MoneyAmount | null;
  readonly commissionReversedAmount: MoneyAmount | null;
  /** Neto = approved − reversed (misma moneda); null si no hay montos. */
  readonly netCommissionAmount: MoneyAmount | null;
  readonly attribution: RevenueAttributionDecision;
  readonly publicationId: string | null;
  readonly eventIds: readonly string[];
  readonly reconciledAt: IsoTimestamp;
}

/** Métricas derivadas recalculables desde el ledger (nunca source-of-truth). */
export interface DerivedRevenueMetrics {
  readonly provider: AffiliateRevenueProviderId | '*';
  readonly clicks: number;
  readonly ordersPending: number;
  readonly ordersApproved: number;
  readonly ordersCancelled: number;
  readonly commissionPending: MoneyAmount | null;
  readonly commissionApproved: MoneyAmount | null;
  readonly commissionReversed: MoneyAmount | null;
  readonly netCommission: MoneyAmount | null;
  readonly unknownAttributionCount: number;
  readonly attributedCount: number;
  readonly computedAt: IsoTimestamp;
}

/** Lote de importación (metadata append-only). */
export interface RevenueImportBatch {
  readonly batchId: string;
  readonly provider: AffiliateRevenueProviderId;
  readonly receivedAt: IsoTimestamp;
  readonly recordCount: number;
  readonly sourceLabel: string;
  readonly opaquePayloadPresent: boolean;
}
