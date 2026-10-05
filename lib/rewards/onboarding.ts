/**
 * Onboarding del Programa del Cazador: explica qué es cada capa de progresión
 * sin prometer dinero. Todo se deriva de `config.ts` y del estado del programa;
 * no lee base de datos.
 */
import {
  REWARDS_CREATOR_SHARE_BPS,
  REWARDS_HOLD_DAYS,
  REWARDS_MIN_ACCOUNT_AGE_DAYS,
  REWARDS_MIN_APPROVAL_DECISIONS,
  REWARDS_MIN_APPROVAL_RATE,
  REWARDS_MIN_PAYOUT_CENTS,
  REWARDS_REQUIRED_APPROVED_OFFERS,
  REWARDS_REQUIRED_POSITIVE_VOTES,
} from '@/lib/rewards/config';

export type ProgressionLayerId = 'gamification' | 'recognition' | 'monetary';

export type ProgressionLayer = {
  id: ProgressionLayerId;
  label: string;
  title: string;
  summary: string;
  points: string[];
  status: 'active' | 'closed';
};

export type RewardsOnboarding = {
  layers: ProgressionLayer[];
  counts: string[];
  doesNotCount: string[];
  abuse: string[];
  states: { label: string; description: string }[];
  whenReceive: string;
  locked: string | null;
};

function mxn(cents: number): string {
  return (cents / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
}

export function buildRewardsOnboarding(programActive: boolean): RewardsOnboarding {
  const sharePct = Math.round(REWARDS_CREATOR_SHARE_BPS / 100);
  const approvalPct = Math.round(REWARDS_MIN_APPROVAL_RATE * 100);

  const layers: ProgressionLayer[] = [
    {
      id: 'gamification',
      label: 'Gamificación',
      title: 'Nivel, reputación y logros',
      summary: 'Mide tu aporte a la comunidad. Nunca se convierte en dinero.',
      points: [
        'Tu nivel (1 a 4) sale de tu reputación: ofertas y comentarios aprobados, y likes en tus comentarios.',
        'Subir de nivel da más confianza: por ejemplo, aprobación automática de tus ofertas desde nivel 3.',
        'Los logros y su XP son de colección: reconocen hitos, pero no cambian tu reputación.',
      ],
      status: 'active',
    },
    {
      id: 'recognition',
      label: 'Recompensas',
      title: 'Programa del Cazador',
      summary: 'Un reconocimiento para quien comparte ofertas de calidad de forma constante.',
      points: [
        `Se desbloquea con ${REWARDS_REQUIRED_APPROVED_OFFERS} ofertas aprobadas y ${REWARDS_REQUIRED_POSITIVE_VOTES} personas distintas votando a favor.`,
        'Al desbloquearlo aceptas los términos y eliges una de tus ofertas como oferta de bienvenida.',
        'Es un reconocimiento dentro de AVENTA, no un pago.',
      ],
      status: programActive ? 'active' : 'closed',
    },
    {
      id: 'monetary',
      label: 'Programa monetario',
      title: 'Comisiones de afiliado',
      summary: programActive
        ? `Hasta el ${sharePct}% de comisiones reales atribuibles a tus ofertas.`
        : 'Cerrado. Hoy no hay pagos, comisiones ni saldos.',
      points: programActive
        ? [
            'Solo cuenta una compra real atribuida a tu oferta y confirmada por la tienda.',
            `Cada comisión pasa ${REWARDS_HOLD_DAYS} días en validación antes de quedar disponible.`,
            `El retiro mínimo es de ${mxn(REWARDS_MIN_PAYOUT_CENTS)}. Sin comisión atribuible no hay recompensa.`,
          ]
        : [
            'Ni tus votos, ni tu nivel, ni tu XP generan dinero.',
            'Cuando abra, AVENTA lo anunciará y te pedirá aceptar términos nuevos antes de cualquier pago.',
          ],
      status: programActive ? 'active' : 'closed',
    },
  ];

  return {
    layers,
    counts: [
      'Ofertas aprobadas por moderación.',
      'Votos positivos en tus ofertas: cada persona cuenta una sola vez.',
      `Una cuenta con al menos ${REWARDS_MIN_ACCOUNT_AGE_DAYS} días de antigüedad.`,
      `Al menos ${approvalPct}% de aprobación, medido a partir de ${REWARDS_MIN_APPROVAL_DECISIONS} decisiones de moderación.`,
    ],
    doesNotCount: [
      'Ofertas pendientes, rechazadas o eliminadas.',
      'Varios votos de la misma persona (cuentan como uno).',
      'Votos de cuentas suspendidas.',
      'XP de logros, nivel o reputación: son gamificación, no requisitos.',
    ],
    abuse: [
      'Cuentas múltiples, auto-promoción o votos coordinados bloquean el desbloqueo.',
      'Moderación puede cancelar o revertir una recompensa si detecta abuso.',
    ],
    states: programActive
      ? [
          { label: 'En validación', description: `La comisión se confirma durante ${REWARDS_HOLD_DAYS} días.` },
          { label: 'Disponible', description: 'Superó la validación y suma a tu saldo.' },
          { label: 'Pagada', description: 'Se entregó a tu método de cobro.' },
          { label: 'Cancelada o revertida', description: 'La tienda anuló la compra o se detectó abuso.' },
        ]
      : [
          { label: 'Bloqueado', description: 'Aún no cumples los requisitos.' },
          { label: 'Desbloqueado', description: 'Cumpliste los requisitos; falta aceptar términos.' },
          { label: 'Activado', description: 'Elegiste tu oferta de bienvenida; tu reconocimiento quedó registrado.' },
        ],
    whenReceive: programActive
      ? 'El reconocimiento llega al desbloquear. El dinero solo existe si hay comisiones atribuidas y validadas.'
      : 'Hoy solo existe el reconocimiento para quien ya lo desbloqueó. No hay pagos mientras el programa monetario esté cerrado.',
    locked: programActive
      ? null
      : 'Los desbloqueos nuevos están en pausa hasta que AVENTA abra el programa. Tu progreso se sigue contando.',
  };
}
