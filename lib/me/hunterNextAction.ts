/**
 * Siguiente acción del cazador, solo a partir de estados reales de sus ofertas.
 * No crea requisitos de recompensa ni de nivel.
 */

export type HunterNextActionId =
  | 'publish'
  | 'hunt-again'
  | 'review-rejected'
  | 'reward-validating'
  | 'reward-ready'
  | 'review-pending'
  | 'republish-expired'
  | 'see-rewards'
  | 'see-public-profile'
  | 'none';

export type HunterNextAction = {
  id: HunterNextActionId;
  title: string;
  detail: string;
  href: string | null;
  cta: string | null;
};

export type HunterRewardSignals = {
  validating: number;
  ready: number;
  any: number;
};

export function deriveHunterNextAction(input: {
  published: number;
  approved: number;
  pending: number;
  rejected: number;
  expired: number;
  publicHref: string | null;
  rewards?: HunterRewardSignals | null;
}): HunterNextAction {
  const rewards = input.rewards ?? null;
  if (input.published <= 0) {
    return {
      id: 'publish',
      title: 'Conviértete en cazador',
      detail:
        'Un cazador publica un precio que vale la pena: enlace, precio real y datos claros. Después hay moderación. Si se rechaza, el motivo dice qué corregir. La calidad importa más que la cantidad.',
      href: null,
      cta: 'Subir mi primera oferta',
    };
  }
  if (input.rejected > 0) {
    return {
      id: 'review-rejected',
      title: 'Revisa tus ofertas',
      detail: `${input.rejected} ${input.rejected === 1 ? 'publicación fue rechazada' : 'publicaciones fueron rechazadas'}. El motivo de cada una explica qué corregir. Corregir y enviar otra usa el mismo envío.`,
      href: '/me/ofertas?estado=rejected',
      cta: 'Ver ofertas rechazadas',
    };
  }
  if (input.approved === 1 && input.pending === 0) {
    return {
      id: 'hunt-again',
      title: 'Caza otra',
      detail:
        'Tu primera oferta aprobada ya cuenta. Una segunda oferta distinta, con el mismo cuidado, construye tu perfil. Publicar varias veces el mismo producto no suma.',
      href: null,
      cta: 'Cazar otra oferta',
    };
  }
  if (rewards && rewards.validating > 0) {
    return {
      id: 'reward-validating',
      title: 'Tienes una recompensa en validación',
      detail: 'El historial ya la muestra en validación. No está lista ni entregada.',
      href: '/me/recompensas',
      cta: 'Ver recompensas',
    };
  }
  if (rewards && rewards.ready > 0) {
    return {
      id: 'reward-ready',
      title: 'Tienes una recompensa lista',
      detail: 'El historial la marca como lista. Esta pantalla no inicia un pago.',
      href: '/me/recompensas',
      cta: 'Ver recompensas',
    };
  }
  if (input.pending > 0) {
    return {
      id: 'review-pending',
      title: 'Revisa tus ofertas',
      detail: `${input.pending} ${input.pending === 1 ? 'sigue' : 'siguen'} en revisión.`,
      href: '/me/ofertas?estado=pending',
      cta: 'Ver ofertas en revisión',
    };
  }
  if (input.expired > 0 && input.approved <= 0) {
    return {
      id: 'republish-expired',
      title: 'Revisa tus ofertas',
      detail: 'No tienes hallazgos activos. Hay ofertas expiradas en tu listado.',
      href: '/me/ofertas?estado=expired',
      cta: 'Ver ofertas expiradas',
    };
  }
  if (rewards && rewards.any > 0) {
    return {
      id: 'see-rewards',
      title: 'Consulta tus recompensas',
      detail: 'Hay registros en tu historial. El estado de cada una sale de ahí.',
      href: '/me/recompensas',
      cta: 'Ver recompensas',
    };
  }
  if (input.approved > 0 && input.publicHref) {
    return {
      id: 'see-public-profile',
      title: 'Mira cómo te ve la comunidad',
      detail: 'Tus hallazgos activos ya forman parte de tu perfil público.',
      href: input.publicHref,
      cta: 'Ver perfil público',
    };
  }
  return {
    id: 'none',
    title: 'No hay una acción pendiente',
    detail: 'Cuando publiques o cuando una oferta cambie de estado, aparecerá aquí.',
    href: null,
    cta: null,
  };
}
