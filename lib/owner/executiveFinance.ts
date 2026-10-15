import { formatEconomicPeriodLabel } from '@/lib/economy/readModel/economicPeriod';
import type { MoneyState } from '@/lib/economy/readModel/loadEconomicSnapshot';
import type { OwnerRangeKey } from '@/lib/owner/ownerRange';

/**
 * Lectura ejecutiva. No calcula comisiones ni estados nuevos:
 * nombra las cifras que el dashboard y el libro canónico ya producen.
 */

export const ACTIVITY_SOURCE =
  'Clics y visitas de offer_events en el período elegido. No son ingresos.';

export const ESTIMATED_SOURCE =
  'Clics del período × EPC productivo. Es una estimación. No es comisión confirmada ni dinero recibido.';

export const PRODUCTION_BOOK_SOURCE =
  'Suma de affiliate_ledger_entries productivas (accrued, paid, pending) en la ventana. Excluye QA. No es la comisión con prefijo settlement ni un cobro bancario.';

export const STORE_COMMISSION_SOURCE =
  'Mes calendario del libro canónico: solo filas con prefijo settlement. Un registro manual o CSV es evidencia y no se suma aquí.';

export const CASH_RECEIVED_SOURCE =
  'No hay conciliación bancaria en esta lectura. No hay datos suficientes para decir que el dinero se recibió.';

export const REWARD_COUNT_SOURCE =
  'Conteo histórico de creator_rewards, sin filtro de fecha y con tope de filas. Incluye registros de prueba. PAID es el estado de la recompensa, no un pago bancario.';

export const INTENT_COUNT_SOURCE =
  'Conteo histórico de payout_intents, sin filtro de fecha y con tope de filas. SUCCEEDED es una referencia del proveedor, no evidencia de que el banco pagó.';

export const LIABILITY_SOURCE =
  'Suma histórica de creator_share_cents en PENDING, VALIDATING, AVAILABLE y PAID cuando el libro ligado es productivo. Incluye lo ya marcado PAID. No es el saldo por pagar ni dinero enviado.';

export const ACTIVATION_SOURCE =
  'Los requisitos son la política de activación del código. No se calculan con las filas de recompensas ni con el libro.';

const BLOCKED_OPERATIONS = [
  'Reservar o enviar un payout_intent',
  'Pasar una recompensa a PAID',
  'Liquidar comisiones hacia cazadores',
] as const;

export function economyWindowLabel(range: OwnerRangeKey): string | null {
  if (range === 'today') return 'Hoy, America/Mexico_City';
  if (range === '7d') return 'Últimos 7 días';
  if (range === 'month') return 'Mes calendario en curso';
  return null;
}

export function countByStatus(
  map: Record<string, number> | null | undefined,
  keys: readonly string[],
): number | null {
  if (!map) return null;
  const folded = new Map<string, number>();
  for (const [raw, value] of Object.entries(map)) {
    const key = raw.toUpperCase();
    const amount = Number.isFinite(value) ? value : 0;
    folded.set(key, (folded.get(key) ?? 0) + amount);
  }
  return keys.reduce((acc, key) => acc + (folded.get(key.toUpperCase()) ?? 0), 0);
}

export function rewardObligationCounts(map: Record<string, number> | null | undefined) {
  return {
    pendingApproval: countByStatus(map, ['PENDING']),
    validating: countByStatus(map, ['VALIDATING']),
    approvedToPay: countByStatus(map, ['AVAILABLE']),
    markedPaid: countByStatus(map, ['PAID']),
    cancelled: countByStatus(map, ['CANCELLED', 'REVERSED']),
  };
}

export function payoutIntentCounts(map: Record<string, number> | null | undefined) {
  return {
    reserved: countByStatus(map, ['RESERVED']),
    submitted: countByStatus(map, ['SUBMITTED']),
    providerResolved: countByStatus(map, ['SUCCEEDED']),
    failed: countByStatus(map, ['FAILED']),
    unknown: countByStatus(map, ['UNKNOWN']),
    cancelled: countByStatus(map, ['CANCELLED']),
  };
}

/** Intents abiertos. PAID de creator_rewards no entra. SUCCEEDED tampoco. */
export function openPayoutIntents(map: Record<string, number> | null | undefined): number | null {
  const counts = payoutIntentCounts(map);
  if (counts.reserved == null || counts.submitted == null || counts.unknown == null) return null;
  return counts.reserved + counts.submitted + counts.unknown;
}

export type ExecutiveEconomicMonth = {
  period: string;
  periodLabel: string;
  ledgerState: 'ready' | 'no_data';
  grossRecognized: MoneyState;
  reversals: MoneyState;
  netRecognized: MoneyState;
  evidenceRows: number;
  anomalies: { code: string; severity: 'attention' | 'info'; explanation: string }[];
  creatorState: 'ready' | 'no_data' | 'none';
  creatorLiability: MoneyState;
  creatorValidating: MoneyState;
  creatorAvailable: MoneyState;
  creatorPaid: MoneyState;
  payoutState: 'ready' | 'no_data' | 'none';
  payoutReserved: number;
  payoutSubmitted: number;
  payoutSucceeded: number;
  payoutFailed: number;
  payoutUnknown: number;
  payoutCancelled: number;
  payoutSucceededAmount: MoneyState;
  monetizationLabel: string;
  rewardsProgramActive: boolean;
  commissionProgramActive: boolean;
};

export function projectExecutiveEconomicMonth(snapshot: {
  period: string;
  networkEconomy: {
    state: 'ready' | 'no_data';
    grossRecognized: MoneyState;
    reversals: MoneyState;
    netRecognized: MoneyState;
    evidenceRows: number;
  };
  creatorEconomy: {
    state: 'ready' | 'no_data' | 'none';
    creatorLiability: MoneyState;
    validating: MoneyState;
    available: MoneyState;
    paid: MoneyState;
  };
  payoutOps: {
    state: 'ready' | 'no_data' | 'none';
    reserved: number;
    submitted: number;
    succeeded: number;
    failed: number;
    unknown: number;
    cancelled: number;
    succeededAmount: MoneyState;
  };
  anomalies: { code: string; severity: 'attention' | 'info'; explanation: string }[];
  monetizationStatus: {
    rewardsProgramActive: boolean;
    commissionProgramActive: boolean;
    label: string;
  };
}): ExecutiveEconomicMonth {
  return {
    period: snapshot.period,
    periodLabel: formatEconomicPeriodLabel(snapshot.period),
    ledgerState: snapshot.networkEconomy.state,
    grossRecognized: snapshot.networkEconomy.grossRecognized,
    reversals: snapshot.networkEconomy.reversals,
    netRecognized: snapshot.networkEconomy.netRecognized,
    evidenceRows: snapshot.networkEconomy.evidenceRows,
    anomalies: snapshot.anomalies.map((item) => ({
      code: item.code,
      severity: item.severity,
      explanation: item.explanation,
    })),
    creatorState: snapshot.creatorEconomy.state,
    creatorLiability: snapshot.creatorEconomy.creatorLiability,
    creatorValidating: snapshot.creatorEconomy.validating,
    creatorAvailable: snapshot.creatorEconomy.available,
    creatorPaid: snapshot.creatorEconomy.paid,
    payoutState: snapshot.payoutOps.state,
    payoutReserved: snapshot.payoutOps.reserved,
    payoutSubmitted: snapshot.payoutOps.submitted,
    payoutSucceeded: snapshot.payoutOps.succeeded,
    payoutFailed: snapshot.payoutOps.failed,
    payoutUnknown: snapshot.payoutOps.unknown,
    payoutCancelled: snapshot.payoutOps.cancelled,
    payoutSucceededAmount: snapshot.payoutOps.succeededAmount,
    monetizationLabel: snapshot.monetizationStatus.label,
    rewardsProgramActive: snapshot.monetizationStatus.rewardsProgramActive,
    commissionProgramActive: snapshot.monetizationStatus.commissionProgramActive,
  };
}

export function moneyFlowReading(input: {
  moneyPathFrozen: boolean | null;
  payout: 'BLOCKED' | 'ALLOWED' | null;
  rewardsProgramActive: boolean | null;
}): { blocked: boolean | null; summary: string; operations: readonly string[] } {
  if (input.moneyPathFrozen == null && input.payout == null) {
    return { blocked: null, summary: 'No hay datos suficientes sobre el flujo de dinero.', operations: [] };
  }
  const reasons: string[] = [];
  if (input.moneyPathFrozen) reasons.push('MONEY_PATH_FROZEN está activo.');
  if (input.payout === 'BLOCKED') reasons.push('La compuerta de activación económica no está completa.');
  if (input.rewardsProgramActive === false) reasons.push('El programa de recompensas no está activo.');
  if (reasons.length === 0) {
    return { blocked: false, summary: 'El flujo de dinero no está bloqueado en esta lectura.', operations: [] };
  }
  return {
    blocked: true,
    summary: `${reasons.join(' ')} Esta vista no mueve dinero.`,
    operations: BLOCKED_OPERATIONS,
  };
}
