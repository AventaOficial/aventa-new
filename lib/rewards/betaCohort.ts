/**
 * Cohorte de Rewards.
 * La participación en basis points vive solo en config.ts.
 * REWARDS_BETA_UI_ENABLED decide la experiencia. REWARDS_PROGRAM_ACTIVE decide si se acumula.
 * Esta capa no crea rewards ni payouts.
 */
import { REWARDS_CREATOR_SHARE_BPS, REWARDS_HOLD_DAYS, REWARDS_MIN_PAYOUT_CENTS, type RewardStatus, REWARD_STATUSES } from '@/lib/rewards/config';

export const REWARDS_RULE_VERSION = '2026-10-05';

export const REWARDS_BETA_STATUSES = ['invited', 'enrolled', 'suspended', 'removed'] as const;
export type RewardsBetaStatus = (typeof REWARDS_BETA_STATUSES)[number];

export type RewardsBetaAction = 'invite' | 'enroll' | 'suspend' | 'remove' | 'reenroll';

export type RewardsBetaMembership = {
  userId: string;
  status: RewardsBetaStatus;
  ruleVersion: string;
  reason: string;
  at: string;
};

export type RewardsRule = {
  version: string;
  creatorShareBps: number;
};

/** Una sola regla activa. Una versión desconocida no hereda el porcentaje nuevo. */
const RULES: readonly RewardsRule[] = [
  { version: REWARDS_RULE_VERSION, creatorShareBps: REWARDS_CREATOR_SHARE_BPS },
];

export function activeRewardsRule(): RewardsRule {
  const rule = RULES.find((item) => item.version === REWARDS_RULE_VERSION);
  if (!rule) throw new Error('La regla activa de Rewards no está definida.');
  return rule;
}

export function ruleByVersion(version: string | null | undefined): RewardsRule | null {
  if (!version) return null;
  return RULES.find((item) => item.version === version) ?? null;
}

function envFlag(name: string): boolean {
  const value = (process.env[name] ?? '').trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

/**
 * Experiencia de la cohorte. Apagada por defecto.
 * Solo decide onboarding y visibilidad. No autoriza rewards, settlements ni payouts.
 */
export function isRewardsBetaUiEnabled(): boolean {
  return envFlag('REWARDS_BETA_UI_ENABLED');
}

/** Pagos reales de la cohorte. Apagado por defecto. No sustituye el freeze del money path. */
export function isRewardsPayoutEnabled(): boolean {
  return envFlag('REWARDS_PAYOUT_ENABLED');
}

export function nextBetaStatus(
  current: RewardsBetaStatus | null,
  action: RewardsBetaAction,
): RewardsBetaStatus | null {
  if (action === 'invite') {
    if (current === 'enrolled' || current === 'suspended' || current === 'invited') return null;
    return 'invited';
  }
  if (action === 'enroll') {
    if (current === 'invited' || current === 'suspended') return 'enrolled';
    if (current === 'enrolled') return 'enrolled';
    return null;
  }
  if (action === 'suspend') {
    if (current === 'invited' || current === 'enrolled') return 'suspended';
    return null;
  }
  if (action === 'remove') {
    if (current == null || current === 'removed') return null;
    return 'removed';
  }
  if (current === 'removed' || current === 'suspended') return 'invited';
  return null;
}

export type RewardsAccess = {
  audience: 'closed' | 'program' | 'beta';
  membership: RewardsBetaStatus | 'none';
  canSeeEconomics: boolean;
  canAccrue: boolean;
  needsOnboarding: boolean;
  payoutEnabled: boolean;
  shareBps: number | null;
  ruleVersion: string | null;
};

export function resolveRewardsAccess(input: {
  programActive: boolean;
  payoutEnabled: boolean;
  membership: RewardsBetaMembership | null;
  /** Visibilidad. No participa en canAccrue ni en payoutEnabled. */
  experience: { uiEnabled: boolean };
}): RewardsAccess {
  const status = input.membership?.status ?? 'none';
  const version = input.membership?.ruleVersion ?? null;
  const invited = status === 'invited';
  const enrolled = status === 'enrolled';
  const experienceVisible = input.experience.uiEnabled && (invited || enrolled);

  if (input.programActive) {
    const rule = activeRewardsRule();
    return {
      audience: 'program',
      membership: status,
      canSeeEconomics: true,
      canAccrue: true,
      needsOnboarding: false,
      payoutEnabled: true,
      shareBps: rule.creatorShareBps,
      ruleVersion: rule.version,
    };
  }

  const rule = experienceVisible ? ruleByVersion(version) : null;
  return {
    audience: experienceVisible ? 'beta' : 'closed',
    membership: status,
    canSeeEconomics: experienceVisible,
    canAccrue: false,
    needsOnboarding: input.experience.uiEnabled && invited,
    payoutEnabled: false,
    shareBps: rule?.creatorShareBps ?? null,
    ruleVersion: experienceVisible ? version : null,
  };
}

export type BetaOnboardingStep = {
  id: 'how' | 'earn' | 'share' | 'when' | 'conditions' | 'activate';
  title: string;
  body: string[];
};

export function betaOnboardingSteps(shareBps: number | null): BetaOnboardingStep[] {
  const share = shareBps == null ? 'la regla vigente' : `${Math.round(shareBps / 100)}%`;
  const minimum = (REWARDS_MIN_PAYOUT_CENTS / 100).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  });
  return [
    {
      id: 'how',
      title: 'Cómo funciona',
      body: [
        'Rewards es la parte económica de una compra real atribuida a tu oferta.',
        'El XP y la reputación no son dinero. Las comisiones de la tienda no son tu saldo.',
      ],
    },
    {
      id: 'earn',
      title: 'Cómo generas recompensas',
      body: [
        'Publicas una oferta. Alguien compra por tu enlace. La tienda confirma una comisión.',
        'Sin compra confirmada no nace una recompensa.',
      ],
    },
    {
      id: 'share',
      title: 'Cómo se calcula tu participación',
      body: [
        `Tu participación actual: ${share}.`,
        'Ese porcentaje sale de una sola regla versionada. No se calcula otro porcentaje en esta pantalla.',
      ],
    },
    {
      id: 'when',
      title: 'Cuándo puedes recibirla',
      body: [
        'Esto es lo que ganaste: una recompensa en validación.',
        `Esto está validándose durante ${REWARDS_HOLD_DAYS} días.`,
        'Esto ya está disponible solo después de esa validación.',
        'Esto todavía no puede pagarse mientras los pagos de la beta estén apagados.',
      ],
    },
    {
      id: 'conditions',
      title: 'Condiciones y validaciones',
      body: [
        `Un pago, cuando exista, pide al menos ${minimum} disponibles y una identidad fiscal previa.`,
        'Hoy no hay una clasificación fiscal aprobada. Esta pantalla no calcula ISR, IVA ni retenciones.',
        `Los estados posibles siguen siendo: ${REWARD_STATUSES.join(', ')}.`,
      ],
    },
    {
      id: 'activate',
      title: 'Activar Rewards',
      body: [
        'Activar te deja ver tu participación y generar recompensas de prueba dentro de la beta.',
        'No abre pagos reales ni el programa para el resto de las personas.',
      ],
    },
  ];
}

export function rewardStatusesUnchanged(statuses: readonly RewardStatus[]): boolean {
  return statuses.join(',') === REWARD_STATUSES.join(',');
}
