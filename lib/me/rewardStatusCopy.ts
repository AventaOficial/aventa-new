/**
 * Explica el estado que ya devolvió el read model.
 * No traduce códigos internos ni promete un pago.
 */

export type RewardUiStatus = 'validating' | 'available' | 'delivered' | 'cancelled' | 'synthetic';

export function formatRewardShare(cents: number | null, currency: string | null): string | null {
  if (cents == null || !Number.isFinite(cents) || !currency) return null;
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return null;
  }
}

export function explainRewardPresentation(input: {
  uiStatus: string;
  statusLabel: string;
  status?: string;
}): { meaning: string; next: string | null } {
  if (input.statusLabel === 'Revertida' || input.status === 'REVERSED') {
    return { meaning: 'Revertida. Esta recompensa dejó de contar.', next: null };
  }
  if (input.statusLabel === 'Cancelada' || input.status === 'CANCELLED') {
    return { meaning: 'Cancelada. Ya no sigue en curso.', next: null };
  }
  if (input.status === 'PENDING') {
    return { meaning: 'Pendiente. Aventa todavía la está revisando.', next: null };
  }
  if (input.status === 'VALIDATING') {
    return { meaning: 'En validación. Sigue en revisión antes de quedar disponible.', next: null };
  }
  switch (input.uiStatus) {
    case 'available':
      return {
        meaning: 'Disponible. Ya quedó lista. Esta pantalla no inicia un pago.',
        next: null,
      };
    case 'delivered':
      return {
        meaning: 'Entregada. El historial ya la certificó como pagada.',
        next: null,
      };
    case 'cancelled':
      return { meaning: 'Cancelada. Ya no sigue en curso.', next: null };
    case 'synthetic':
      return { meaning: '', next: null };
    case 'validating':
    default:
      return {
        meaning: 'En validación. Todavía no está disponible ni entregada.',
        next: null,
      };
  }
}
