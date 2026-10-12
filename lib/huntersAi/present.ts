import {
  editorialStatus,
  isDailyCategory,
  type HunterQueueStatus,
  type HunterSort,
} from '@/lib/huntersAi/contract';
import { hunterForLane, type HunterPublicIdentity } from '@/lib/product/hunters/identity';

export type HunterSource = {
  id: string;
  batchId: string;
  status: string;
  identityKey: string;
  sourceUrl: string;
  canonicalUrl: string | null;
  retailer: string | null;
  store: string | null;
  title: string | null;
  hintTitle: string | null;
  price: number | null;
  hintPrice: number | null;
  originalPrice: number | null;
  hintOriginalPrice: number | null;
  discountPercent: number | null;
  category: string | null;
  hintNote: string | null;
  duplicateStatus: string | null;
  duplicateOfferId: string | null;
  offerId: string | null;
  /** `offers.status` de la oferta creada, si existe. */
  offerStatus: string | null;
  errorCode: string | null;
  warnings: string[];
  rejectionReason: string | null;
  evidence: Record<string, unknown>;
  createdAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  mcpRunId: string | null;
  hunterName: string | null;
};

export type PriceHistoryView =
  | { available: false; label: 'Historial insuficiente' }
  | {
      available: true;
      current: number | null;
      reference: number | null;
      historicalMin: number | null;
      average: number | null;
      habitualMin: number | null;
      habitualMax: number | null;
      days: number | null;
      grade: string | null;
      /** Lectura del rango que sí vino en la evidencia. Null si el rango no está completo. */
      reading: string | null;
    };

export type HunterCard = {
  id: string;
  batchId: string;
  queueStatus: HunterQueueStatus;
  pipelineStatus: string;
  title: string;
  description: string;
  whyGoodDeal: string;
  retailer: string;
  sourceUrl: string;
  /** Precio extraído de la página. Null si solo existe el que declaró el hunter. */
  price: number | null;
  /** Precio de lista extraído de la página y mayor que el actual. Nunca el declarado. */
  referencePrice: number | null;
  /** Pistas del hunter sin verificar; no se usan para descuento ni ahorro. */
  declaredPrice: number | null;
  declaredReferencePrice: number | null;
  discountPercent: number | null;
  absoluteSavings: number | null;
  currency: 'MXN';
  unitPrice: number | null;
  unitLabel: string | null;
  dealScore: number | null;
  evidenceGrade: string | null;
  category: string | null;
  dailyNeed: boolean;
  hunterName: string;
  hunter: HunterPublicIdentity;
  runId: string | null;
  discoveredAt: string;
  duplicate: boolean;
  duplicateOfferId: string | null;
  approvedOfferId: string | null;
  offerStatus: string | null;
  /** Enlace a la cola de moderación cuando la oferta sigue pending. */
  moderationHref: string | null;
  /** Código del control que retuvo o rechazó el candidato (calidad, memoria negativa, extracción). */
  reviewCode: string | null;
  warnings: string[];
  rejectionReason: string | null;
  history: PriceHistoryView;
  identityKey: string;
  canApprove: boolean;
  canReject: boolean;
  canEdit: boolean;
};

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

function editorial(evidence: Record<string, unknown>): Record<string, unknown> {
  const raw = evidence.editorial;
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

/** Solo lee evidencia explícita. Nunca estima un historial. */
export function readPriceHistory(evidence: Record<string, unknown>, current: number | null, reference: number | null): PriceHistoryView {
  const raw = evidence.price_history ?? evidence.priceHistory ?? evidence.price_memory;
  if (!raw || typeof raw !== 'object' || (raw as { estimated?: unknown }).estimated === true) {
    return { available: false, label: 'Historial insuficiente' };
  }
  const h = raw as Record<string, unknown>;
  const historicalMin = num(h.min ?? h.historicalMin);
  const average = num(h.average ?? h.avg ?? h.mean);
  const habitualMin = num(h.habitualMin ?? h.habitual_min);
  const habitualMax = num(h.habitualMax ?? h.habitual_max);
  const days = num(h.days ?? h.historyDays);
  const grade = text(h.grade ?? h.confidence, 16);
  const hasBand = habitualMin != null || habitualMax != null || historicalMin != null || average != null || days != null;
  if (!hasBand) return { available: false, label: 'Historial insuficiente' };
  return {
    available: true,
    current,
    reference,
    historicalMin,
    average,
    habitualMin,
    habitualMax,
    days,
    grade,
    reading: historyReading(current, habitualMin, habitualMax),
  };
}

/** Solo compara números que ya están en la evidencia. */
export function historyReading(
  current: number | null,
  habitualMin: number | null,
  habitualMax: number | null,
): string | null {
  if (current == null || habitualMin == null || habitualMax == null) return null;
  if (current < habitualMin) return 'Está por debajo de su rango habitual.';
  if (current > habitualMax) return 'Está por encima de su rango habitual.';
  return 'Está dentro de su rango habitual.';
}

export function toHunterCard(source: HunterSource): HunterCard {
  const ed = editorial(source.evidence);
  const price = source.price;
  const referencePrice =
    price != null && source.originalPrice != null && source.originalPrice > price ? source.originalPrice : null;
  const discount =
    referencePrice == null
      ? null
      : (source.discountPercent ?? Math.round(((referencePrice - price!) / referencePrice) * 1000) / 10);
  const savings = referencePrice != null ? Math.round((referencePrice - price!) * 100) / 100 : null;
  const score = num(source.evidence.deal_score ?? source.evidence.dealScore);
  const grade = text(source.evidence.evidence_grade ?? source.evidence.evidenceGrade, 8);
  const queueStatus = editorialStatus(source.status, source.evidence, source.offerStatus);
  const open = queueStatus === 'PENDING' || queueStatus === 'NEEDS_REVIEW';
  const hunter = hunterForLane(source.hunterName);
  return {
    id: source.id,
    batchId: source.batchId,
    queueStatus,
    pipelineStatus: source.status,
    title: text(ed.title, 200) ?? source.title ?? source.hintTitle ?? 'Sin título',
    description: text(ed.description, 2000) ?? source.hintNote ?? '',
    whyGoodDeal: text(ed.why_good_deal, 600) ?? '',
    retailer: source.store || source.retailer || 'Tienda',
    sourceUrl: source.canonicalUrl || source.sourceUrl,
    price,
    referencePrice,
    declaredPrice: source.hintPrice,
    declaredReferencePrice: source.hintOriginalPrice,
    discountPercent: discount,
    absoluteSavings: savings,
    currency: 'MXN',
    unitPrice: num(source.evidence.unit_price ?? source.evidence.unitPrice),
    unitLabel: text(source.evidence.unit_label ?? source.evidence.unitLabel, 40),
    dealScore: score != null && score >= 0 && score <= 100 ? Math.round(score) : null,
    evidenceGrade: grade,
    category: source.category,
    dailyNeed: isDailyCategory(source.category),
    hunterName: hunter.name,
    hunter,
    runId: source.mcpRunId,
    discoveredAt: source.createdAt,
    duplicate: source.duplicateStatus === 'duplicate' && Boolean(source.duplicateOfferId),
    duplicateOfferId: source.duplicateOfferId,
    approvedOfferId: source.offerId,
    offerStatus: source.offerStatus,
    moderationHref:
      queueStatus === 'IN_MODERATION' && source.offerId
        ? `/admin/moderation?focus=${encodeURIComponent(source.offerId)}`
        : null,
    reviewCode: source.errorCode,
    warnings: source.warnings,
    rejectionReason:
      source.rejectionReason ?? (source.status === 'APPROVED' && source.offerStatus === 'rejected' ? 'Rechazada en moderación' : null),
    history: readPriceHistory(source.evidence, price, referencePrice),
    identityKey: source.identityKey,
    canApprove: open,
    canReject: open,
    canEdit: open && source.status !== 'APPROVED' && source.status !== 'PUBLISHED' && source.status !== 'REJECTED',
  };
}

/** Conserva el candidato más reciente por identidad de producto. */
export function dedupeSources(rows: HunterSource[]): HunterSource[] {
  const best = new Map<string, HunterSource>();
  for (const row of rows) {
    const key = row.identityKey || row.id;
    const prev = best.get(key);
    if (!prev || row.createdAt > prev.createdAt || (row.createdAt === prev.createdAt && row.id > prev.id)) {
      best.set(key, row);
    }
  }
  return [...best.values()];
}

function sortValue(card: HunterCard, sort: HunterSort): number {
  if (sort === 'score') return card.dealScore ?? -1;
  if (sort === 'discount') return card.discountPercent ?? -1;
  if (sort === 'savings') return card.absoluteSavings ?? -1;
  if (sort === 'price') return card.price ?? Number.POSITIVE_INFINITY;
  return 0;
}

export function sortCards(cards: HunterCard[], sort: HunterSort): HunterCard[] {
  const copy = [...cards];
  copy.sort((a, b) => {
    if (sort === 'discovered') return b.discoveredAt.localeCompare(a.discoveredAt);
    if (sort === 'price') {
      const d = sortValue(a, sort) - sortValue(b, sort);
      if (d !== 0) return d;
    } else {
      const d = sortValue(b, sort) - sortValue(a, sort);
      if (d !== 0) return d;
    }
    return b.discoveredAt.localeCompare(a.discoveredAt);
  });
  return copy;
}

export function matchesCategory(card: HunterCard, category: string | null): boolean {
  if (!category) return true;
  if (category === 'Otros') {
    if (!card.category) return true;
    const known = ['Hogar', 'Limpieza', 'Despensa', 'Higiene', 'Bebés', 'Mascotas', 'Salud/Cuidado personal', 'Cocina', 'Herramientas', 'Electrónica'];
    return !known.some((k) => k.toLowerCase() === card.category!.trim().toLowerCase());
  }
  return (card.category ?? '').trim().toLowerCase() === category.trim().toLowerCase();
}
