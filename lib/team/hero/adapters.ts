import { teamMetadata } from '../config/catalog';
import { teamRoleLabel } from '../roles/catalog';
import type { TeamMembership } from '../roles/membership';
import type {
  CommunityXpSummary,
  HeroActivityItem,
  HeroCount,
  HeroMetric,
  HeroPrimaryAction,
  TeamHeroFacts,
  TeamHeroPayload,
} from './types';

const WORKSPACE_READY = 'Tu espacio de trabajo está listo.';

function formatCount(count: number): string {
  return new Intl.NumberFormat('es-MX').format(count);
}

function metric(id: string, label: string, count: Extract<HeroCount, { origin: 'REAL' | 'CALCULATED' }>): HeroMetric {
  return { id, label, value: formatCount(count.count), origin: count.origin };
}

function moderationPrimary(pending: HeroCount): HeroPrimaryAction {
  if (pending.origin === 'UNAVAILABLE') {
    return {
      title: 'Tu centro de trabajo',
      body: 'La moderación sigue en el flujo actual. Desde aquí no se cuenta la cola.',
      href: '/equipo/moderacion',
      label: 'Empezar a moderar',
    };
  }
  if (pending.count > 0) {
    return {
      title: 'Hay trabajo pendiente.',
      body: 'La cola de ofertas sigue en el flujo de moderación.',
      href: '/equipo/moderacion',
      label: 'Empezar a moderar',
    };
  }
  return {
    title: 'La cola está al día.',
    body: 'No hay ofertas en espera ahora. El flujo de moderación sigue siendo el de siempre.',
    href: '/equipo/moderacion',
    label: 'Abrir moderación',
  };
}

function moderationActivity(decisions: HeroCount): HeroActivityItem[] {
  if (decisions.origin === 'UNAVAILABLE') return [];
  if (decisions.count === 0) {
    return [{ id: 'decisions-today', text: 'Hoy no hay decisiones tuyas en el registro.', origin: 'CALCULATED' }];
  }
  const noun = decisions.count === 1 ? 'decisión tuya' : 'decisiones tuyas';
  return [
    {
      id: 'decisions-today',
      text: `Hoy hay ${formatCount(decisions.count)} ${noun} en el registro de moderación.`,
      origin: 'CALCULATED',
    },
  ];
}

function hunterActivity(events: HeroCount): HeroActivityItem[] {
  if (events.origin === 'UNAVAILABLE') return [];
  if (events.count === 0) {
    return [{ id: 'batch-events', text: 'Hoy no hay movimientos de lotes con tu autoría.', origin: 'CALCULATED' }];
  }
  const noun = events.count === 1 ? 'movimiento de lote' : 'movimientos de lotes';
  return [
    {
      id: 'batch-events',
      text: `Hoy hay ${formatCount(events.count)} ${noun} con tu autoría.`,
      origin: 'CALCULATED',
    },
  ];
}

function quietPrimary(body: string): HeroPrimaryAction {
  return { title: WORKSPACE_READY, body, href: null, label: null };
}

function primaryFor(facts: TeamHeroFacts): HeroPrimaryAction {
  switch (facts.teamId) {
    case 'moderation':
      return moderationPrimary(facts.facts.pending);
    case 'hunter':
      return {
        title: 'Tu espacio de caza',
        body: 'Puedes ver tu actividad en lotes. La ingesta y las corridas de supply no están aquí.',
        href: null,
        label: null,
      };
    case 'finance':
      return facts.facts.frozen
        ? {
            title: 'El dinero está en lectura.',
            body: 'No hay pagos, clawback ni liquidación desde Team OS.',
            href: null,
            label: null,
          }
        : {
            title: 'El camino de dinero está abierto.',
            body: 'Team OS sigue en lectura. No mueve pagos ni liquidaciones.',
            href: null,
            label: null,
          };
    case 'growth':
      return quietPrimary('Las herramientas de growth se habilitarán aquí cuando haya una fuente atribuible a tu cuenta.');
    case 'product':
      return quietPrimary('Las herramientas de producto se habilitarán aquí. No hay un gestor de issues.');
    case 'community':
      return quietPrimary('Las herramientas de comunidad se habilitarán aquí. No contamos reportes por persona.');
    case 'operations':
      return quietPrimary('Las herramientas de operaciones se habilitarán aquí. No atribuimos tareas sin autoría.');
    default: {
      const exhaustive: never = facts;
      return exhaustive;
    }
  }
}

function metricsFor(facts: TeamHeroFacts): HeroMetric[] {
  if (facts.teamId === 'moderation' && facts.facts.pending.origin !== 'UNAVAILABLE') {
    return [metric('pending-offers', 'Ofertas en espera', facts.facts.pending)];
  }
  if (facts.teamId === 'finance') {
    return [
      {
        id: 'money-path',
        label: 'Camino de dinero',
        value: facts.facts.frozen ? 'Congelado' : 'Abierto',
        origin: 'REAL',
      },
    ];
  }
  return [];
}

function activityFor(facts: TeamHeroFacts): HeroActivityItem[] {
  if (facts.teamId === 'moderation') return moderationActivity(facts.facts.decisionsToday);
  if (facts.teamId === 'hunter') return hunterActivity(facts.facts.ownBatchEventsToday);
  return [];
}

export function communityXpSummary(xp: number | null): CommunityXpSummary | null {
  if (xp === null || !Number.isFinite(xp)) return null;
  return { scope: 'community', label: 'XP de comunidad', value: formatCount(xp) };
}

export function composeTeamHero(input: {
  membership: TeamMembership;
  greeting: string;
  personName: string;
  facts: TeamHeroFacts;
  communityXp: number | null;
}): TeamHeroPayload | null {
  if (input.facts.teamId !== input.membership.teamId) return null;
  if (input.membership.status !== 'ACTIVE') return null;
  const metadata = teamMetadata(input.membership.teamId);
  const name = input.personName.trim();
  return {
    teamId: input.membership.teamId,
    greeting: input.greeting,
    personName: name.length > 0 ? name : 'compañero',
    teamName: metadata.displayName,
    teamLine: metadata.tagline,
    roleLabel: teamRoleLabel(input.membership.teamId, input.membership.role),
    membershipLabel: 'Activa',
    primary: primaryFor(input.facts),
    metrics: metricsFor(input.facts).slice(0, 3),
    activity: activityFor(input.facts),
    communityXp: communityXpSummary(input.communityXp),
  };
}
