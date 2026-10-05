/**
 * Onboarding del Programa del Cazador: explica cada capa de progresión sin
 * prometer dinero. Todo se deriva de `config.ts` y del estado real del programa
 * (`REWARDS_PROGRAM_ACTIVE`, `MONEY_PATH_FROZEN`, `claimPhase`); no lee base.
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

/**
 * Estado del programa (eje global):
 * - ACTIVE: `REWARDS_PROGRAM_ACTIVE` encendido y money path descongelado.
 * - FROZEN: programa encendido, pero `MONEY_PATH_FROZEN` bloquea todo movimiento de dinero.
 * - PAUSED: `REWARDS_PROGRAM_ACTIVE` apagado; no hay desbloqueos nuevos.
 */
export type RewardsProgramStatus = 'ACTIVE' | 'FROZEN' | 'PAUSED';

/**
 * Estado del cazador (eje personal), derivado de `claimPhase`:
 * - LOCKED: aún no cumple requisitos.
 * - ELIGIBLE: cumplió requisitos; falta aceptar términos o elegir la oferta de bienvenida.
 * - UNLOCKED: reconocimiento activado.
 */
export type RewardsMemberStatus = 'LOCKED' | 'ELIGIBLE' | 'UNLOCKED';

export type RewardsClaimPhase = 'locked' | 'unlocked' | 'pending_selection' | 'complete';

export function resolveRewardsProgramStatus(input: {
  programActive: boolean;
  moneyPathFrozen: boolean;
}): RewardsProgramStatus {
  if (!input.programActive) return 'PAUSED';
  if (input.moneyPathFrozen) return 'FROZEN';
  return 'ACTIVE';
}

export function resolveRewardsMemberStatus(phase: RewardsClaimPhase): RewardsMemberStatus {
  if (phase === 'complete') return 'UNLOCKED';
  if (phase === 'unlocked' || phase === 'pending_selection') return 'ELIGIBLE';
  return 'LOCKED';
}

export const PROGRAM_STATUS_COPY: Record<RewardsProgramStatus, { label: string; description: string }> = {
  ACTIVE: {
    label: 'Programa activo',
    description: 'Las recompensas se calculan con comisiones reales y pasan por validación antes de estar disponibles.',
  },
  FROZEN: {
    label: 'Retiros en pausa',
    description: 'El programa está abierto, pero AVENTA mantiene congelado todo movimiento de dinero. Nada se paga mientras tanto.',
  },
  PAUSED: {
    label: 'Programa en pausa',
    description: 'Hoy no hay recompensas monetarias ni desbloqueos nuevos. Tu progreso de cazador se sigue contando.',
  },
};

export const MEMBER_STATUS_COPY: Record<RewardsMemberStatus, { label: string; description: string }> = {
  LOCKED: { label: 'Bloqueado', description: 'Aún no cumples los requisitos de desbloqueo.' },
  ELIGIBLE: { label: 'Elegible', description: 'Cumpliste los requisitos; falta aceptar términos y elegir tu oferta de bienvenida.' },
  UNLOCKED: { label: 'Desbloqueado', description: 'Tu reconocimiento de cazador quedó activado.' },
};

export type ProgressionLayerId = 'xp' | 'reputation' | 'reward' | 'available' | 'payout';

export type ProgressionLayer = {
  id: ProgressionLayerId;
  label: string;
  title: string;
  summary: string;
  points: string[];
  /** `money: false` = la capa nunca representa dinero. */
  money: boolean;
  status: 'active' | 'paused' | 'frozen';
};

export type RewardsOnboarding = {
  programStatus: RewardsProgramStatus;
  journey: { verb: string; description: string }[];
  layers: ProgressionLayer[];
  counts: string[];
  doesNotCount: string[];
  pending: string[];
  withdrawal: string[];
  abuse: string[];
  guarantees: string[];
  whenReceive: string;
  /** Aviso cuando no se aceptan desbloqueos nuevos; null si el programa está abierto. */
  locked: string | null;
};

function mxn(cents: number): string {
  return (cents / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
}

export function buildRewardsOnboarding(programStatus: RewardsProgramStatus): RewardsOnboarding {
  const active = programStatus === 'ACTIVE';
  const paused = programStatus === 'PAUSED';
  const moneyStatus: ProgressionLayer['status'] = active ? 'active' : paused ? 'paused' : 'frozen';
  const sharePct = Math.round(REWARDS_CREATOR_SHARE_BPS / 100);
  const approvalPct = Math.round(REWARDS_MIN_APPROVAL_RATE * 100);

  const layers: ProgressionLayer[] = [
    {
      id: 'xp',
      label: 'XP y logros',
      title: 'Tu colección de cazador',
      summary: 'Los logros marcan hitos y suman XP. Es progresión de juego: nunca se convierte en dinero.',
      points: [
        'Cada logro reconoce algo que ya hiciste: tu primera oferta, una racha, un hallazgo excepcional.',
        'El XP de logros no sube tu reputación ni cuenta para el programa.',
      ],
      money: false,
      status: 'active',
    },
    {
      id: 'reputation',
      label: 'Reputación',
      title: 'Tu confianza en AVENTA',
      summary: 'Mide qué tan confiable es lo que compartes. Da autoridad, no dinero.',
      points: [
        'Sube con ofertas y comentarios aprobados y con likes en tus comentarios; baja con rechazos.',
        'Tu nivel (1 a 4) desbloquea publicación directa: comentarios desde nivel 2 y ofertas desde nivel 3. Tu voto pesa más a mayor nivel.',
      ],
      money: false,
      status: 'active',
    },
    {
      id: 'reward',
      label: 'Recompensa',
      title: 'Lo que tu cacería podría generar',
      summary: active
        ? `Una parte (hasta ${sharePct}%) de la comisión real que una tienda paga por una compra atribuida a tu oferta.`
        : 'Un beneficio económico potencial ligado a compras reales. Hoy no se calcula ninguno.',
      points: active
        ? [
            'Nace pendiente: todavía no es dinero tuyo.',
            'Si no hay compra atribuida y confirmada, no hay recompensa.',
          ]
        : [
            'Mientras el programa no esté activo, ninguna actividad genera recompensas.',
            'Cuando abra, AVENTA lo anunciará y pedirá aceptar términos nuevos.',
          ],
      money: true,
      status: moneyStatus,
    },
    {
      id: 'available',
      label: 'Disponible',
      title: 'Recompensa validada',
      summary: 'Una recompensa pasa a disponible solo después de superar todas las validaciones.',
      points: active
        ? [`Primero espera ${REWARDS_HOLD_DAYS} días por si la tienda cancela o devuelve la compra.`, 'Lo pendiente nunca se puede retirar.']
        : ['Hoy no hay saldo disponible para nadie.'],
      money: true,
      status: moneyStatus,
    },
    {
      id: 'payout',
      label: 'Retiro',
      title: 'Cuando AVENTA te paga',
      summary: active
        ? `AVENTA procesa el pago cuando tu saldo disponible llega a ${mxn(REWARDS_MIN_PAYOUT_CENTS)}.`
        : 'Los retiros no están habilitados.',
      points: [
        'Antes del primer retiro, AVENTA puede pedirte datos de identidad y fiscales. Hoy no se solicitan.',
        'Un pago solo se envía si el programa está activo y los pagos no están congelados.',
      ],
      money: true,
      status: moneyStatus,
    },
  ];

  return {
    programStatus,
    journey: [
      { verb: 'Cazar', description: 'Encuentra una oferta que valga la pena.' },
      { verb: 'Validar', description: 'Moderación y la comunidad confirman que es buena.' },
      { verb: 'Desbloquear', description: 'Tu constancia abre el Programa del Cazador.' },
      { verb: 'Recompensar', description: active ? 'Las compras reales pueden generar una recompensa.' : 'Hoy el reconocimiento es la recompensa.' },
    ],
    layers,
    counts: [
      `${REWARDS_REQUIRED_APPROVED_OFFERS} ofertas aprobadas por moderación.`,
      `${REWARDS_REQUIRED_POSITIVE_VOTES} personas distintas votando a favor de tus ofertas (cada persona cuenta una vez).`,
      `Una cuenta con al menos ${REWARDS_MIN_ACCOUNT_AGE_DAYS} días de antigüedad.`,
      `Al menos ${approvalPct}% de aprobación, medido a partir de ${REWARDS_MIN_APPROVAL_DECISIONS} decisiones de moderación.`,
    ],
    doesNotCount: [
      'Ofertas pendientes, rechazadas o eliminadas.',
      'Varios votos de la misma persona (cuentan como uno).',
      'Votos de cuentas suspendidas.',
      'Clics, vistas o votos por sí solos: no generan dinero.',
      'XP de logros, nivel o reputación: son progresión, no requisitos ni saldo.',
    ],
    pending: [
      'La tienda confirma la compra días o semanas después.',
      'Una compra puede cancelarse o devolverse; la recompensa se cancela con ella.',
      'AVENTA revisa la atribución antes de liberar cualquier monto.',
    ],
    withdrawal: [
      'Solo se paga saldo disponible, nunca pendiente.',
      'Cobrar puede requerir verificar tu identidad y datos fiscales según la ley aplicable.',
      'Esos datos se pedirán solo cuando haya un pago que hacerte, nunca antes.',
    ],
    abuse: [
      'Cuentas múltiples, auto-promoción o votos coordinados bloquean el desbloqueo.',
      'Moderación puede cancelar o revertir una recompensa si detecta abuso.',
    ],
    guarantees: [
      'AVENTA no garantiza que una actividad genere recompensa.',
      'Las recompensas dependen de las reglas y términos vigentes del programa.',
      'El programa puede pausarse; si pasa, lo verás aquí.',
    ],
    whenReceive: active
      ? 'Al desbloquear recibes el reconocimiento. El dinero solo existe si hay comisiones atribuidas y validadas.'
      : paused
        ? 'Hoy solo existe el reconocimiento para quien ya lo desbloqueó. No hay pagos mientras el programa esté en pausa.'
        : 'El programa está abierto, pero los pagos están congelados: nada se libera ni se paga por ahora.',
    locked: paused
      ? 'Los desbloqueos nuevos están en pausa hasta que AVENTA abra el programa. Tu progreso se sigue contando.'
      : null,
  };
}
