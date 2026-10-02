/**
 * Logros de Aventa.
 * Separado del Nivel (reputación) y del programa de recompensas.
 * Un logro puede otorgar XP una sola vez. Nunca otorga dinero.
 */

export const ACHIEVEMENT_EVENT_TYPES = [
  'OFFER_APPROVED',
  'OFFER_REJECTED',
  'OFFER_FEATURED',
  'OFFER_RECEIVED_VOTE',
  'OFFER_RECEIVED_COMMENT',
  'USER_VOTED',
  'USER_COMMENTED',
  'QUALITY_THRESHOLD_REACHED',
  'STREAK_DAY_COMPLETED',
  'LEVEL_REACHED',
  'REWARD_UNLOCKED',
] as const;

export type AchievementEventType = (typeof ACHIEVEMENT_EVENT_TYPES)[number];

export type AchievementCategory =
  | 'caceria'
  | 'precision'
  | 'comunidad'
  | 'constancia'
  | 'impacto'
  | 'experiencia'
  | 'especiales';

export type AchievementRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary'
  | 'mythic';

export type RevealPolicy = 'visible' | 'until_unlocked' | 'during_window';

export type AchievementRule =
  | { type: 'approved_offers'; target: number }
  | { type: 'clean_approvals'; target: number }
  | { type: 'approval_rate'; minOffers: number; minRate: number }
  | { type: 'quality_offers'; target: number }
  | { type: 'received_votes'; target: number }
  | { type: 'single_offer_votes'; target: number }
  | { type: 'useful_comments'; target: number }
  | { type: 'conversations'; target: number }
  | { type: 'distinct_days'; target: number }
  | { type: 'consecutive_days'; target: number }
  | { type: 'level'; target: number }
  | { type: 'dawn' }
  | { type: 'night' }
  | { type: 'flash' }
  | { type: 'black_friday' }
  | { type: 'season' }
  | { type: 'secret' };

/** Evento de dominio ya validado. El motor ignora repetidos por type+eventId. */
export type AchievementDomainEvent = {
  type: AchievementEventType;
  eventId: string;
  at: string;
  offerId?: string;
  /** Voto: peso real. Solo value > 0 cuenta como apoyo. */
  value?: number;
  voterBanned?: boolean;
  self?: boolean;
  /** Oferta aprobada sin nota de corrección del moderador. */
  clean?: boolean;
  /** Supera DealScore/DQE existente. No es un score inventado. */
  qualifies?: boolean;
  secret?: boolean;
  gateFailed?: boolean;
  duplicate?: boolean;
  deleted?: boolean;
  approved?: boolean;
  useful?: boolean;
  commentBody?: string;
  /** El comentario es del dueño de la oferta. */
  onOwnOffer?: boolean;
  authorBanned?: boolean;
  level?: number;
  expiresAt?: string | null;
};

export type ApprovedOfferFact = {
  offerId: string;
  at: string;
  clean: boolean;
  qualifies: boolean;
  secret: boolean;
  expiresAt: string | null;
  votes: number;
};

export type UserFacts = {
  banned: boolean;
  approvedOffers: number;
  rejectedOffers: number;
  cleanApprovals: number;
  qualityOffers: number;
  receivedPositiveVotes: number;
  maxVotesOnSingleOffer: number;
  usefulCommentsReceived: number;
  validConversations: number;
  distinctContributionDays: number;
  longestConsecutiveDays: number;
  reputationLevel: number;
  dawnExceptional: boolean;
  nightExceptional: boolean;
  flashHunter: boolean;
  blackFridayHunter: boolean;
  seasonHunter: boolean;
  secretOffer: boolean;
  offers: ApprovedOfferFact[];
};

export type AchievementDefinition = {
  code: string;
  name: string;
  description: string;
  unlockLine: string;
  icon: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  xpReward: number;
  isHidden: boolean;
  reveal: RevealPolicy;
  isActive: boolean;
  isRepeatable: boolean;
  /** Los 24 de la vitrina inicial. El resto existe en el catálogo. */
  v1Spotlight: boolean;
  displayOrder: number;
  rule: AchievementRule;
  triggers: readonly AchievementEventType[];
  progressNoun: string;
};

export const MAX_FEATURED_ACHIEVEMENTS = 5;

export const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  caceria: 'Cacería',
  precision: 'Precisión',
  comunidad: 'Comunidad',
  constancia: 'Constancia',
  impacto: 'Impacto',
  experiencia: 'Experiencia',
  especiales: 'Especiales',
};

export const CATEGORY_ICON: Record<AchievementCategory, string> = {
  caceria: '🏹',
  precision: '🎯',
  comunidad: '❤️',
  constancia: '🔥',
  impacto: '📈',
  experiencia: '🧠',
  especiales: '💎',
};

export const RARITY_LABEL: Record<AchievementRarity, string> = {
  common: 'Común',
  uncommon: 'Poco común',
  rare: 'Raro',
  epic: 'Épico',
  legendary: 'Legendario',
  mythic: 'Mítico',
};
