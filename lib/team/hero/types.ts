import type { TeamId } from '../roles/teams';

/** Clasificación interna. La UI no imprime estas palabras. */
export type HeroOrigin = 'REAL' | 'CALCULATED' | 'UNAVAILABLE';

export type HeroCount = { origin: 'REAL' | 'CALCULATED'; count: number } | { origin: 'UNAVAILABLE' };

export type HeroMetric = {
  id: string;
  label: string;
  value: string;
  origin: 'REAL' | 'CALCULATED';
};

export type HeroActivityItem = {
  id: string;
  text: string;
  origin: 'REAL' | 'CALCULATED';
};

export type HeroPrimaryAction = {
  title: string;
  body: string;
  href: string | null;
  label: string | null;
};

export type CommunityXpSummary = {
  scope: 'community';
  label: 'XP de comunidad';
  value: string;
};

export type TeamXpSummary = {
  scope: 'team';
  teamId: TeamId;
  label: 'Team XP';
  value: string;
};

export type TeamHeroPayload = {
  teamId: TeamId;
  greeting: string;
  personName: string;
  teamName: string;
  teamLine: string;
  roleLabel: string;
  membershipLabel: 'Activa';
  primary: HeroPrimaryAction;
  metrics: HeroMetric[];
  activity: HeroActivityItem[];
  teamXp: TeamXpSummary | null;
  communityXp: CommunityXpSummary | null;
};

export type ModerationHeroFacts = {
  pending: HeroCount;
  decisionsToday: HeroCount;
};

export type HunterHeroFacts = {
  ownBatchEventsToday: HeroCount;
};

export type FinanceHeroFacts = {
  frozen: boolean;
};

export type QuietHeroFacts = Record<string, never>;

export type TeamHeroFacts =
  | { teamId: 'moderation'; facts: ModerationHeroFacts }
  | { teamId: 'hunter'; facts: HunterHeroFacts }
  | { teamId: 'finance'; facts: FinanceHeroFacts }
  | { teamId: 'growth' | 'product' | 'community' | 'operations'; facts: QuietHeroFacts };
