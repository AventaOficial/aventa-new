/**
 * Inteligencia de oferta. Funciones puras sobre filas ya leídas.
 * No escribe, no toca rewards y no convierte un autor vacío en HUMAN.
 *
 * Creadas, aprobadas, rechazadas y pendientes siguen lib/owner/supplyDomain.ts.
 * El actor sale de lib/actors/actorType.ts vía el directorio que pasa el caller.
 * source_lane de moderation_outcomes no clasifica actores.
 *
 * Tiendas y categorías: cohorte creada en la ventana, desglosada por status actual.
 */
import type { ActorType } from '@/lib/actors/actorType';
import { supplyWindows, type SupplyWindowId } from '@/lib/owner/supplyDomain';
import type { HumanSupplyReport } from '@/lib/owner/humanSupply';
import type { HunterGrowthReport } from '@/lib/owner/hunterGrowth';
import {
  DEFAULT_SUPPLY_THRESHOLDS,
  type SupplyThresholds,
} from '@/lib/owner/supplyThresholds';

export { supplyWindows };
export type { SupplyWindowId };

export type SupplyActor = 'HUMAN' | 'MACHINE_HUNTER' | 'SYSTEM' | 'UNATTRIBUTED';

export type SupplyDirectory = {
  classify(userId: string | null | undefined): ActorType;
} | null;

export type CreatedSupplyOffer = {
  id: string;
  createdAt: string;
  createdBy: string | null;
  status: string | null;
  store: string | null;
  category: string | null;
};

/** Decisión aplicada en moderation_logs. No lleva source_lane. */
export type SupplyDecision = {
  action: 'approved' | 'rejected';
  at: string;
};

/** Observabilidad de moderation_outcomes. No entra en la clase de actor ni en el conteo. */
export type SupplyLaneObservation = {
  offerId: string;
  sourceLane: string | null;
};

export type SupplyVolume = {
  created: number;
  approved: number;
  rejected: number;
  approvalRate: number | null;
  rejectionRate: number | null;
};

export type ActorMix = {
  human: number;
  machineHunter: number;
  system: number;
  unattributed: number;
};

/**
 * Participación humana. Los porcentajes usan solo oferta HUMAN.
 * MACHINE_HUNTER, SYSTEM y UNATTRIBUTED quedan fuera de ese denominador.
 * Si la cobertura de autor no alcanza el umbral, los porcentajes no se publican.
 */
export type HumanContribution = {
  status: 'ok' | 'INSUFFICIENT_DATA';
  uniqueHumans: number | null;
  humanOffers: number | null;
  machineOffers: number | null;
  systemOffers: number | null;
  unattributed: number | null;
  attributed: number | null;
  total: number | null;
  coverage: number | null;
  topHumanPct: number | null;
  top3HumanPct: number | null;
  top10HumanPct: number | null;
};

export type MissingCategory = {
  created: number;
  approved: number;
};

export type SupplyMixRow = {
  key: string;
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  other: number;
};

export type SourceQuality = {
  community: number;
  machine: number;
  unknownLane: number;
  missing: number;
  incompleteShare: number | null;
};

export type SupplyHealthLevel = 'HEALTHY' | 'WARNING' | 'CRITICAL';

export type SupplyHealthCondition = {
  level: 'WARNING' | 'CRITICAL';
  code: string;
  detail: string;
};

export type SupplyIntelligence = {
  generatedAt: string;
  pendingNow: number | null;
  volume: Record<SupplyWindowId, SupplyVolume | null>;
  actorMix: Record<SupplyWindowId, ActorMix | null>;
  humans: HumanContribution | null;
  /** Creadas en 30 días sin categoría, y cuántas de esas siguen aprobadas. */
  missingCategory: MissingCategory | null;
  retailers: SupplyMixRow[] | null;
  categories: SupplyMixRow[] | null;
  source: SourceQuality | null;
  /** Cazadores humanos. null si no hay directorio o la lectura se truncó. */
  humanSupply: HumanSupplyReport | null;
  hunterGrowth: HunterGrowthReport | null;
  health: { level: SupplyHealthLevel; conditions: SupplyHealthCondition[] };
  truncated: boolean;
};

/** Autor vacío o ilegible queda sin atribución. Nunca se cuenta como HUMAN. */
export function classifySupplyAuthor(
  createdBy: string | null | undefined,
  directory: SupplyDirectory,
): SupplyActor | 'UNAVAILABLE' {
  const id = createdBy?.trim() ?? '';
  if (!id) return 'UNATTRIBUTED';
  if (!directory) return 'UNAVAILABLE';
  const actor = directory.classify(id);
  if (actor === 'MACHINE_HUNTER' || actor === 'SYSTEM' || actor === 'HUMAN') return actor;
  return 'UNAVAILABLE';
}

function inWindow(iso: string, startMs: number, endMs: number): boolean {
  const time = Date.parse(iso);
  return Number.isFinite(time) && time >= startMs && time < endMs;
}

function rate(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 1000;
}

function volumeFor(
  offers: CreatedSupplyOffer[],
  decisions: SupplyDecision[],
  window: { startMs: number; endMs: number },
): SupplyVolume {
  let created = 0;
  for (const offer of offers) {
    if (inWindow(offer.createdAt, window.startMs, window.endMs)) created += 1;
  }
  let approved = 0;
  let rejected = 0;
  for (const decision of decisions) {
    if (!inWindow(decision.at, window.startMs, window.endMs)) continue;
    if (decision.action === 'approved') approved += 1;
    else if (decision.action === 'rejected') rejected += 1;
  }
  const decided = approved + rejected;
  return {
    created,
    approved,
    rejected,
    approvalRate: rate(approved, decided),
    rejectionRate: rate(rejected, decided),
  };
}

function mixFor(
  offers: CreatedSupplyOffer[],
  window: { startMs: number; endMs: number },
  directory: SupplyDirectory,
): ActorMix | null {
  const mix: ActorMix = { human: 0, machineHunter: 0, system: 0, unattributed: 0 };
  for (const offer of offers) {
    if (!inWindow(offer.createdAt, window.startMs, window.endMs)) continue;
    const actor = classifySupplyAuthor(offer.createdBy, directory);
    if (actor === 'UNAVAILABLE') return null;
    if (actor === 'HUMAN') mix.human += 1;
    else if (actor === 'MACHINE_HUNTER') mix.machineHunter += 1;
    else if (actor === 'SYSTEM') mix.system += 1;
    else mix.unattributed += 1;
  }
  return mix;
}

function humanContributionFor(
  offers: CreatedSupplyOffer[],
  window: { startMs: number; endMs: number },
  directory: SupplyDirectory,
  thresholds: SupplyThresholds,
): HumanContribution | null {
  if (!directory) return null;
  const humanCounts = new Map<string, number>();
  let humanOffers = 0;
  let machineOffers = 0;
  let systemOffers = 0;
  let unattributed = 0;
  let total = 0;
  for (const offer of offers) {
    if (!inWindow(offer.createdAt, window.startMs, window.endMs)) continue;
    total += 1;
    const actor = classifySupplyAuthor(offer.createdBy, directory);
    if (actor === 'UNAVAILABLE') return null;
    if (actor === 'HUMAN') {
      humanOffers += 1;
      const id = offer.createdBy?.trim() ?? '';
      humanCounts.set(id, (humanCounts.get(id) ?? 0) + 1);
    } else if (actor === 'MACHINE_HUNTER') machineOffers += 1;
    else if (actor === 'SYSTEM') systemOffers += 1;
    else unattributed += 1;
  }
  const attributed = humanOffers + machineOffers + systemOffers;
  const coverage = rate(attributed, total);
  const ranked = [...humanCounts.values()].sort((a, b) => b - a);
  const shareOf = (n: number) => rate(ranked.slice(0, n).reduce((sum, value) => sum + value, 0), humanOffers);
  const enough = coverage != null && coverage >= thresholds.minHumanCoverage;
  return {
    status: enough ? 'ok' : 'INSUFFICIENT_DATA',
    uniqueHumans: humanCounts.size,
    humanOffers,
    machineOffers,
    systemOffers,
    unattributed,
    attributed,
    total,
    coverage,
    topHumanPct: enough ? shareOf(1) : null,
    top3HumanPct: enough ? shareOf(3) : null,
    top10HumanPct: enough ? shareOf(10) : null,
  };
}

function missingCategoryFor(
  offers: CreatedSupplyOffer[],
  window: { startMs: number; endMs: number },
): MissingCategory {
  let created = 0;
  let approved = 0;
  for (const offer of offers) {
    if (!inWindow(offer.createdAt, window.startMs, window.endMs)) continue;
    if ((offer.category?.trim() ?? '').length > 0) continue;
    created += 1;
    if (offer.status === 'approved') approved += 1;
  }
  return { created, approved };
}

function labelOf(value: string | null | undefined, missing: string): string {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : missing;
}

function mixRows(
  offers: CreatedSupplyOffer[],
  window: { startMs: number; endMs: number },
  pick: (offer: CreatedSupplyOffer) => string,
): SupplyMixRow[] {
  const groups = new Map<string, SupplyMixRow>();
  for (const offer of offers) {
    if (!inWindow(offer.createdAt, window.startMs, window.endMs)) continue;
    const key = pick(offer);
    const row = groups.get(key) ?? { key, total: 0, approved: 0, pending: 0, rejected: 0, other: 0 };
    row.total += 1;
    if (offer.status === 'approved') row.approved += 1;
    else if (offer.status === 'pending') row.pending += 1;
    else if (offer.status === 'rejected') row.rejected += 1;
    else row.other += 1;
    groups.set(key, row);
  }
  return [...groups.values()].sort((a, b) => b.approved - a.approved || b.total - a.total || a.key.localeCompare(b.key));
}

function sourceFor(
  offers: CreatedSupplyOffer[],
  lanes: SupplyLaneObservation[],
  window: { startMs: number; endMs: number },
): SourceQuality {
  const laneByOffer = new Map<string, string>();
  for (const lane of lanes) {
    const value = lane.sourceLane?.trim() || 'unknown';
    const current = laneByOffer.get(lane.offerId);
    if (!current || current === 'unknown') laneByOffer.set(lane.offerId, value);
  }
  const quality: SourceQuality = { community: 0, machine: 0, unknownLane: 0, missing: 0, incompleteShare: null };
  let created = 0;
  for (const offer of offers) {
    if (!inWindow(offer.createdAt, window.startMs, window.endMs)) continue;
    created += 1;
    const lane = laneByOffer.get(offer.id);
    if (!lane) quality.missing += 1;
    else if (lane === 'community') quality.community += 1;
    else if (lane === 'machine') quality.machine += 1;
    else quality.unknownLane += 1;
  }
  quality.incompleteShare = rate(quality.missing + quality.unknownLane, created);
  return quality;
}

function pushLevel(
  conditions: SupplyHealthCondition[],
  level: 'WARNING' | 'CRITICAL',
  code: string,
  detail: string,
) {
  conditions.push({ level, code, detail });
}

function shareLevel(
  value: number | null,
  warning: number,
  critical: number,
  conditions: SupplyHealthCondition[],
  code: string,
  detail: (pct: number) => string,
) {
  if (value == null) return;
  if (value >= critical) pushLevel(conditions, 'CRITICAL', code, detail(value));
  else if (value >= warning) pushLevel(conditions, 'WARNING', code, detail(value));
}

export function evaluateSupplyHealth(input: {
  volume: SupplyVolume | null;
  actorMix: ActorMix | null;
  humans: HumanContribution | null;
  missingCategory: MissingCategory | null;
  retailers: SupplyMixRow[] | null;
  categories: SupplyMixRow[] | null;
  source: SourceQuality | null;
  pendingNow: number | null;
  truncated: boolean;
  thresholds?: SupplyThresholds;
}): { level: SupplyHealthLevel; conditions: SupplyHealthCondition[] } {
  const thresholds = input.thresholds ?? DEFAULT_SUPPLY_THRESHOLDS;
  const conditions: SupplyHealthCondition[] = [];
  if (input.truncated) {
    pushLevel(conditions, 'WARNING', 'truncated', 'La lectura de oferta se truncó. La mezcla no se calcula.');
  }
  if (input.pendingNow != null) {
    if (input.pendingNow >= thresholds.pendingCritical) {
      pushLevel(conditions, 'CRITICAL', 'pending_backlog', `${input.pendingNow} ofertas siguen pendientes.`);
    } else if (input.pendingNow >= thresholds.pendingWarning) {
      pushLevel(conditions, 'WARNING', 'pending_backlog', `${input.pendingNow} ofertas siguen pendientes.`);
    }
  }
  const decided = (input.volume?.approved ?? 0) + (input.volume?.rejected ?? 0);
  if (input.volume && decided >= thresholds.minDecisionsForRejection) {
    shareLevel(
      input.volume.rejectionRate,
      thresholds.rejectionWarning,
      thresholds.rejectionCritical,
      conditions,
      'rejection_rate',
      (pct) => `La tasa de rechazo a 30 días es ${Math.round(pct * 100)}%.`,
    );
  }
  if (!input.actorMix || !input.humans) {
    pushLevel(conditions, 'WARNING', 'actor_directory_unavailable', 'No hay directorio de actores. La mezcla humana no se publica.');
  } else {
    const attributed = input.actorMix.human + input.actorMix.machineHunter + input.actorMix.system;
    if (attributed >= thresholds.minAttributedForActorHealth) {
      const humanShare = input.actorMix.human / attributed;
      const machineShare = input.actorMix.machineHunter / attributed;
      const systemShare = input.actorMix.system / attributed;
      if (input.actorMix.human === 0) {
        pushLevel(conditions, 'CRITICAL', 'no_human_supply', 'Ninguna oferta atribuida de 30 días es humana.');
      } else if (humanShare < thresholds.humanShareWarning) {
        pushLevel(conditions, 'WARNING', 'low_human_supply', `La oferta humana atribuida es ${Math.round(humanShare * 100)}%.`);
      }
      shareLevel(
        machineShare,
        thresholds.machineShareWarning,
        thresholds.machineShareCritical,
        conditions,
        'machine_dependence',
        (pct) => `Los cazadores de máquina suman ${Math.round(pct * 100)}% de la oferta atribuida.`,
      );
      shareLevel(
        systemShare,
        thresholds.machineShareWarning,
        thresholds.machineShareCritical,
        conditions,
        'system_dependence',
        (pct) => `El sistema suma ${Math.round(pct * 100)}% de la oferta atribuida.`,
      );
    }
    if (input.humans.status === 'INSUFFICIENT_DATA' && (input.humans.total ?? 0) > 0) {
      pushLevel(
        conditions,
        'WARNING',
        'attribution_coverage',
        'La cobertura de autor no alcanza para publicar concentración humana.',
      );
    } else if (input.humans.status === 'ok') {
      shareLevel(
        input.humans.topHumanPct,
        thresholds.topAuthorWarning,
        thresholds.topAuthorCritical,
        conditions,
        'author_concentration',
        (pct) => `El contribuidor humano principal concentra ${Math.round(pct * 100)}% de la oferta humana.`,
      );
      shareLevel(
        input.humans.top3HumanPct,
        thresholds.top3Warning,
        thresholds.top3Critical,
        conditions,
        'author_top3',
        (pct) => `Los 3 contribuidores humanos principales concentran ${Math.round(pct * 100)}% de la oferta humana.`,
      );
    }
  }
  if (input.missingCategory && input.missingCategory.approved > 0) {
    pushLevel(
      conditions,
      'WARNING',
      'missing_category',
      `${input.missingCategory.approved} ofertas aprobadas del corte de 30 días no tienen categoría.`,
    );
  }
  const topShare = (rows: SupplyMixRow[] | null) => {
    if (!rows || rows.length === 0) return null;
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    if (total <= 0) return null;
    return rows[0].total / total;
  };
  shareLevel(
    topShare(input.retailers),
    thresholds.retailerWarning,
    thresholds.retailerCritical,
    conditions,
    'retailer_concentration',
    (pct) => `La tienda principal concentra ${Math.round(pct * 100)}% de lo creado en 30 días.`,
  );
  shareLevel(
    topShare(input.categories),
    thresholds.categoryWarning,
    thresholds.categoryCritical,
    conditions,
    'category_concentration',
    (pct) => `La categoría principal concentra ${Math.round(pct * 100)}% de lo creado en 30 días.`,
  );
  if (input.source) {
    shareLevel(
      input.source.incompleteShare,
      thresholds.missingSourceWarning,
      thresholds.missingSourceCritical,
      conditions,
      'missing_source',
      (pct) => `${Math.round(pct * 100)}% de lo creado en 30 días no tiene fuente de moderación.`,
    );
  }
  const level: SupplyHealthLevel = conditions.some((item) => item.level === 'CRITICAL')
    ? 'CRITICAL'
    : conditions.length > 0
      ? 'WARNING'
      : 'HEALTHY';
  return { level, conditions };
}

export function buildSupplyIntelligence(input: {
  now: Date;
  offers: CreatedSupplyOffer[];
  decisions: SupplyDecision[];
  lanes?: SupplyLaneObservation[];
  pendingNow: number | null;
  directory: SupplyDirectory;
  truncated?: boolean;
  thresholds?: SupplyThresholds;
  /** Conteos SQL. Si vienen, no se recalculan desde las filas. */
  volume?: Record<SupplyWindowId, SupplyVolume>;
  humanSupply?: HumanSupplyReport | null;
  hunterGrowth?: HunterGrowthReport | null;
}): SupplyIntelligence {
  const windows = supplyWindows(input.now);
  const truncated = input.truncated === true;
  const thresholds = input.thresholds ?? DEFAULT_SUPPLY_THRESHOLDS;
  const volume = input.volume ?? {
    today: volumeFor(input.offers, input.decisions, windows.today),
    d7: volumeFor(input.offers, input.decisions, windows.d7),
    d30: volumeFor(input.offers, input.decisions, windows.d30),
  };
  const actorMix = truncated
    ? { today: null, d7: null, d30: null }
    : {
        today: mixFor(input.offers, windows.today, input.directory),
        d7: mixFor(input.offers, windows.d7, input.directory),
        d30: mixFor(input.offers, windows.d30, input.directory),
      };
  const humans = truncated ? null : humanContributionFor(input.offers, windows.d30, input.directory, thresholds);
  const missingCategory = truncated ? null : missingCategoryFor(input.offers, windows.d30);
  const allRetailers = truncated
    ? null
    : mixRows(input.offers, windows.d30, (offer) => labelOf(offer.store, 'Sin tienda'));
  const allCategories = truncated
    ? null
    : mixRows(input.offers, windows.d30, (offer) => labelOf(offer.category, 'Sin categoría'));
  const retailers = allRetailers?.slice(0, 8) ?? null;
  const categories = allCategories?.slice(0, 8) ?? null;
  const source = truncated ? null : sourceFor(input.offers, input.lanes ?? [], windows.d30);
  return {
    generatedAt: input.now.toISOString(),
    pendingNow: input.pendingNow,
    volume,
    actorMix,
    humans,
    missingCategory,
    retailers,
    categories,
    source,
    humanSupply: input.humanSupply ?? null,
    hunterGrowth: input.hunterGrowth ?? null,
    truncated,
    health: evaluateSupplyHealth({
      volume: volume.d30,
      actorMix: actorMix.d30,
      humans,
      missingCategory,
      retailers: allRetailers,
      categories: allCategories,
      source,
      pendingNow: input.pendingNow,
      truncated,
      thresholds,
    }),
  };
}
