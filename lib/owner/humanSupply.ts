/**
 * Oferta humana. Se deriva de offers y moderation_logs.
 * El carril de moderación no clasifica actores.
 * Una recompensa no es requisito para contar a un cazador.
 *
 * ACTIVE HUMAN HUNTER: autor HUMAN con al menos una oferta no borrada creada en la ventana.
 * NEW HUNTER: su primera oferta histórica cae dentro de la ventana.
 * REPEAT HUNTER: tiene al menos dos contribuciones distintas y publicó dentro de la ventana.
 * Una contribución agrupa las señales de product_fingerprint, URL normalizada e ingestion_identity_key.
 * Reintentar el mismo producto no cuenta como otra contribución.
 * Si el historial se corta, nuevos, recurrentes y primer éxito quedan vacíos.
 *
 * FIRST HUNT SUCCESS: de las primeras ofertas de la ventana ya decididas, cuántas están aprobadas.
 * La latencia solo se publica si cada primera oferta aprobada tiene moderation_logs.approved.
 */
import type { ActorType } from '@/lib/actors/actorType';
import { classifyRejectionSignal } from '@/lib/discovery/negativeMemory/classifyRejection';
import type { ActorAuditEntry } from '@/lib/owner/actorAudit';
import { contributionComponents } from '@/lib/owner/contributionIdentity';
import { getYmdInTz } from '@/lib/owner/mxTime';
import { supplyWindows, type SupplyWindowId } from '@/lib/owner/supplyDomain';
import { classifySupplyAuthor, type SupplyDirectory } from '@/lib/owner/supplyIntelligence';

export type HumanSupplyOffer = {
  id: string;
  createdAt: string;
  createdBy: string | null;
  status: string | null;
  productFingerprint?: string | null;
  offerUrl?: string | null;
  ingestionIdentityKey?: string | null;
  rejectionReason?: string | null;
  deletedAt?: string | null;
};

export type HumanSupplyDirectory = {
  classify(userId: string | null | undefined): ActorType;
} | null;

export type HumanFunnelWindow = {
  contributors: number | null;
  newContributors: number | null;
  repeatContributors: number | null;
  offers: number | null;
  approvedOffers: number | null;
  rejectedOffers: number | null;
  pendingOffers: number | null;
  approvalRate: number | null;
  rejectionRate: number | null;
  offersPerContributor: number | null;
  firstSubmissions: number | null;
  firstHuntSuccessRate: number | null;
  firstHuntRejectionRate: number | null;
  secondAttemptRate: number | null;
  /** Primeras ofertas de la ventana que ya están aprobadas. */
  firstApprovals: number | null;
  /** De esas primeras aprobadas, cuántas tienen otra contribución distinta. */
  secondContributions: number | null;
  medianContributionDays: number | null;
  firstAcceptLatencyHours: number | null;
};

export type HumanSupplyReport = {
  d7: HumanFunnelWindow;
  d30: HumanFunnelWindow;
  diversity: {
    human: number;
    machineHunter: number;
    system: number;
    unattributed: number;
    humanShare: number | null;
    machineShare: number | null;
    systemShare: number | null;
    unattributedShare: number | null;
    topHumanPct: number | null;
    status: 'ok' | 'INSUFFICIENT_DATA';
  } | null;
  rejectionReasons: {
    status: 'ok' | 'INCOMPLETE';
    unspecified: number;
    groups: { key: string; label: string; count: number }[];
  } | null;
  /** ok cuando el historial del autor alcanza para nuevos, recurrentes y primer éxito. */
  historyStatus: 'ok' | 'unavailable';
  /** Clases resueltas por el directorio canónico. null si no se pidió el diagnóstico. */
  actorAudit: ActorAuditEntry[] | null;
};

const REJECTION_LABEL: Record<string, string> = {
  spam: 'Spam',
  not_good_offer: 'No es una buena oferta',
  duplicate: 'Duplicada',
  price_misleading: 'Precio engañoso',
  unavailable: 'Agotada',
  invalid: 'Enlace o dato inválido',
  auto_rejected_timeout: 'Expiró en revisión',
  other_reject: 'Otro motivo registrado',
};

function rate(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 1000;
}

function inWindow(iso: string, startMs: number, endMs: number): boolean {
  const time = Date.parse(iso);
  return Number.isFinite(time) && time >= startMs && time < endMs;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
  return Math.round(value * 10) / 10;
}

function alive(offer: HumanSupplyOffer): boolean {
  return (offer.deletedAt ?? null) == null;
}

type Authored = HumanSupplyOffer & { authorId: string };

function funnelFor(
  offers: Authored[],
  history: Map<string, HumanSupplyOffer[]>,
  window: { startMs: number; endMs: number },
  approveAtByOfferId: Map<string, string>,
  historyTruncated: boolean,
): HumanFunnelWindow {
  const offersInWindow = offers.filter((offer) => inWindow(offer.createdAt, window.startMs, window.endMs));
  const byAuthor = new Map<string, Authored[]>();
  for (const offer of offersInWindow) {
    const list = byAuthor.get(offer.authorId) ?? [];
    list.push(offer);
    byAuthor.set(offer.authorId, list);
  }
  let approvedOffers = 0;
  let rejectedOffers = 0;
  let pendingOffers = 0;
  const humanCounts = new Map<string, number>();
  const contributionDays: number[] = [];
  for (const [authorId, rows] of byAuthor) {
    humanCounts.set(authorId, rows.length);
    const days = new Set(rows.map((row) => getYmdInTz(new Date(row.createdAt))));
    contributionDays.push(days.size);
    for (const row of rows) {
      if (row.status === 'approved') approvedOffers += 1;
      else if (row.status === 'rejected') rejectedOffers += 1;
      else if (row.status === 'pending') pendingOffers += 1;
    }
  }
  const decided = approvedOffers + rejectedOffers;
  const base: HumanFunnelWindow = {
    contributors: byAuthor.size,
    newContributors: historyTruncated ? null : 0,
    repeatContributors: historyTruncated ? null : 0,
    offers: offersInWindow.length,
    approvedOffers,
    rejectedOffers,
    pendingOffers,
    approvalRate: rate(approvedOffers, decided),
    rejectionRate: rate(rejectedOffers, decided),
    offersPerContributor: rate(offersInWindow.length, byAuthor.size),
    firstSubmissions: null,
    firstHuntSuccessRate: null,
    firstHuntRejectionRate: null,
    secondAttemptRate: null,
    firstApprovals: null,
    secondContributions: null,
    medianContributionDays: median(contributionDays),
    firstAcceptLatencyHours: null,
  };
  if (historyTruncated || [...byAuthor.keys()].some((authorId) => !history.has(authorId))) {
    return { ...base, newContributors: null, repeatContributors: null };
  }

  let newContributors = 0;
  let repeatContributors = 0;
  let firstAccepted = 0;
  let firstRejected = 0;
  let secondAttempts = 0;
  let firstApprovals = 0;
  let secondContributions = 0;
  let firstRejectedAuthors = 0;
  const latencies: number[] = [];
  let latencyMissing = false;
  for (const authorId of byAuthor.keys()) {
    const life = (history.get(authorId) ?? byAuthor.get(authorId) ?? []).filter(alive);
    const ordered = [...life].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const first = ordered[0];
    if (!first) continue;
    const components = contributionComponents(ordered);
    const identities = new Set(ordered.map((offer) => components.get(offer.id)));
    if (identities.size >= 2) repeatContributors += 1;
    if (!inWindow(first.createdAt, window.startMs, window.endMs)) continue;
    newContributors += 1;
    if (first.status === 'pending') continue;
    if (first.status === 'approved') {
      firstAccepted += 1;
      firstApprovals += 1;
      if (identities.size >= 2) secondContributions += 1;
      const approvedAt = approveAtByOfferId.get(first.id);
      const createdMs = Date.parse(first.createdAt);
      const approvedMs = approvedAt ? Date.parse(approvedAt) : NaN;
      if (!Number.isFinite(approvedMs) || !Number.isFinite(createdMs) || approvedMs < createdMs) latencyMissing = true;
      else latencies.push((approvedMs - createdMs) / 3_600_000);
    } else if (first.status === 'rejected') {
      firstRejected += 1;
      firstRejectedAuthors += 1;
      const firstIdentity = components.get(first.id);
      const retried = ordered.some(
        (offer) => offer.id !== first.id && Date.parse(offer.createdAt) > Date.parse(first.createdAt) && components.get(offer.id) !== firstIdentity,
      );
      if (retried) secondAttempts += 1;
    }
  }
  const firstDecided = firstAccepted + firstRejected;
  return {
    ...base,
    newContributors,
    repeatContributors,
    firstSubmissions: newContributors,
    firstHuntSuccessRate: rate(firstAccepted, firstDecided),
    firstHuntRejectionRate: rate(firstRejected, firstDecided),
    secondAttemptRate: rate(secondAttempts, firstRejectedAuthors),
    firstApprovals,
    secondContributions,
    firstAcceptLatencyHours: latencyMissing ? null : median(latencies),
  };
}

export function buildHumanSupply(input: {
  now: Date;
  windowOffers: HumanSupplyOffer[];
  history: HumanSupplyOffer[];
  approveAtByOfferId?: Record<string, string>;
  directory: HumanSupplyDirectory;
  truncated?: boolean;
  historyTruncated?: boolean;
  minCoverage?: number;
  actorAudit?: ActorAuditEntry[] | null;
}): HumanSupplyReport | null {
  if (input.truncated || !input.directory) return null;
  const directory: SupplyDirectory = input.directory;
  const windows = supplyWindows(input.now);
  const aliveWindow = input.windowOffers.filter(
    (offer) => alive(offer) && inWindow(offer.createdAt, windows.d30.startMs, windows.d30.endMs),
  );
  const authored: Authored[] = [];
  const mix = { human: 0, machineHunter: 0, system: 0, unattributed: 0 };
  const humanCounts = new Map<string, number>();
  for (const offer of aliveWindow) {
    const actor = classifySupplyAuthor(offer.createdBy, directory);
    if (actor === 'UNAVAILABLE') return null;
    if (actor === 'HUMAN') {
      mix.human += 1;
      const id = offer.createdBy?.trim() ?? '';
      authored.push({ ...offer, authorId: id });
      humanCounts.set(id, (humanCounts.get(id) ?? 0) + 1);
    } else if (actor === 'MACHINE_HUNTER') mix.machineHunter += 1;
    else if (actor === 'SYSTEM') mix.system += 1;
    else mix.unattributed += 1;
  }
  const history = new Map<string, HumanSupplyOffer[]>();
  for (const offer of input.history) {
    if (!alive(offer)) continue;
    const id = offer.createdBy?.trim() ?? '';
    if (!id || classifySupplyAuthor(id, directory) !== 'HUMAN') continue;
    const list = history.get(id) ?? [];
    list.push(offer);
    history.set(id, list);
  }
  const total = mix.human + mix.machineHunter + mix.system + mix.unattributed;
  const attributed = total - mix.unattributed;
  const coverage = rate(attributed, total);
  const enough = coverage != null && coverage >= (input.minCoverage ?? 0.8);
  const ranked = [...humanCounts.values()].sort((a, b) => b - a);
  const topHuman = ranked[0] ?? 0;
  const approveAt = new Map(Object.entries(input.approveAtByOfferId ?? {}));
  const historyTruncated = input.historyTruncated === true;
  const historyUnavailable = historyTruncated || authored.some((offer) => !history.has(offer.authorId));
  const windowOf = (id: Exclude<SupplyWindowId, 'today'>) =>
    funnelFor(authored, history, windows[id], approveAt, historyUnavailable);

  const reasonCounts = new Map<string, number>();
  let unspecified = 0;
  let rejected = 0;
  for (const offer of authored) {
    if (!inWindow(offer.createdAt, windows.d30.startMs, windows.d30.endMs)) continue;
    if (offer.status !== 'rejected') continue;
    rejected += 1;
    if (!offer.rejectionReason?.trim()) {
      unspecified += 1;
      continue;
    }
    const kind = classifyRejectionSignal({ status: 'rejected', rejectionReason: offer.rejectionReason });
    reasonCounts.set(kind, (reasonCounts.get(kind) ?? 0) + 1);
  }
  const unmatched = unspecified + (reasonCounts.get('other_reject') ?? 0);
  const incompleteShare = rate(unmatched, rejected);
  const groups = [...reasonCounts.entries()]
    .map(([key, count]) => ({ key, label: REJECTION_LABEL[key] ?? key, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    d7: windowOf('d7'),
    d30: windowOf('d30'),
    diversity: {
      ...mix,
      humanShare: rate(mix.human, total),
      machineShare: rate(mix.machineHunter, total),
      systemShare: rate(mix.system, total),
      unattributedShare: rate(mix.unattributed, total),
      topHumanPct: enough ? rate(topHuman, mix.human) : null,
      status: enough ? 'ok' : 'INSUFFICIENT_DATA',
    },
    rejectionReasons: {
      status: incompleteShare != null && incompleteShare > 0.5 ? 'INCOMPLETE' : 'ok',
      unspecified,
      groups,
    },
    historyStatus: historyUnavailable ? 'unavailable' : 'ok',
    actorAudit: input.actorAudit ?? null,
  };
}
