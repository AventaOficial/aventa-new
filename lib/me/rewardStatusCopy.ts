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
}): { meaning: string; next: string | null } {
  if (input.statusLabel === 'Revertida') {
    return { meaning: 'Revertida. Ya no está lista ni en validación.', next: null };
  }
  if (input.statusLabel === 'Cancelada') {
    return { meaning: 'Cancelada. Ya no está lista ni en validación.', next: null };
  }
  switch (input.uiStatus) {
    case 'available':
      return {
        meaning: 'Lista. El historial ya la marcó así. Esta pantalla no inicia un pago.',
        next: null,
      };
    case 'delivered':
      return {
        meaning: 'Entregada. El historial la certificó.',
        next: null,
      };
    case 'synthetic':
      return {
        meaning: 'Registro de prueba. No es una recompensa real.',
        next: null,
      };
    case 'validating':
    default:
      return {
        meaning: 'En validación. Todavía no está lista ni entregada.',
        next: null,
      };
  }
}
