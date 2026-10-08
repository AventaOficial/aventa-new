/**
 * Una sola capa de normalización.
 * El resto de Aventa no ve cadenas del proveedor.
 * PENDING no es CONFIRMED. APPROVED (proceso de pago) tampoco.
 * El estado aprobado/verificado del programa sí entra como CONFIRMED.
 */

import type { CanonicalCommissionState, CanonicalConversionState } from './contract';

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

const PENDING = new Set([
  'pending',
  'pendiente',
  'observed',
  'observada',
  'observado',
  'en revision',
  'en proceso de revision',
]);

const APPROVED_NOT_CONFIRMED = new Set([
  'proceso de pago',
  'en proceso de pago',
  'approved_for_payout',
]);

const CONFIRMED = new Set([
  'confirmed',
  'confirmada',
  'confirmado',
  'approved',
  'aprobada',
  'aprobado',
  'ventas aprobadas',
  'venta aprobada',
  'verificada',
  'verificado',
  'ganancias verificadas',
  'ganancia verificada',
]);

const REVERSED = new Set([
  'reversed',
  'reversada',
  'reversado',
  'cancelled',
  'canceled',
  'cancelada',
  'cancelado',
  'devolucion',
  'devuelta',
  'devuelto',
  'reembolso',
  'reembolsada',
  'reembolsado',
  'refunded',
]);

const INVALID = new Set([
  'invalid',
  'invalida',
  'invalido',
  'rejected',
  'rechazada',
  'rechazado',
]);

export function normalizeProviderStatus(
  raw: string | null | undefined,
): CanonicalConversionState | 'UNKNOWN' {
  const folded = fold(raw ?? '');
  if (!folded) return 'UNKNOWN';
  if (PENDING.has(folded)) return 'PENDING';
  if (APPROVED_NOT_CONFIRMED.has(folded)) return 'APPROVED';
  if (CONFIRMED.has(folded)) return 'CONFIRMED';
  if (REVERSED.has(folded)) return 'REVERSED';
  if (INVALID.has(folded)) return 'INVALID';
  return 'UNKNOWN';
}

export function commissionStateFor(
  conversion: CanonicalConversionState,
): CanonicalCommissionState | null {
  if (conversion === 'CONFIRMED') return 'CONFIRMED';
  if (conversion === 'REVERSED') return 'REVERSED';
  if (conversion === 'PENDING' || conversion === 'APPROVED') return 'PENDING';
  return null;
}
