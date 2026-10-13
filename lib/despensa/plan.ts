import {
  activeDespensaNeeds,
  DESPENSA_OFFICIAL_REFERENCES,
  despensaNeedById,
  despensaVariant,
  type DespensaNeed,
} from '@/lib/despensa/catalog';
import { DESPENSA_BUDGET_RULES, weeklyEquivalentMxn, type BudgetFit, type DespensaBudget } from '@/lib/despensa/budget';
import type { DespensaPriceHistory, EvidenceLevel, Freshness, SavingEvidence } from '@/lib/despensa/evidence';
import type { UnitPrice } from '@/lib/despensa/presentation';
import type { OfferScopeUi } from '@/lib/offerScope';
import {
  despensaSignals,
  rankDespensa,
  unitPriceGroupKey,
  unitPriceStandings,
  type DespensaSignals,
  type UnitPriceStanding,
} from '@/lib/despensa/rank';

/** Oferta tal como la entrega `/api/despensa`. */
export type DespensaOffer = {
  id: string;
  title: string;
  discountPrice: number;
  originalPrice: number | null;
  store: string | null;
  sourceHost: string | null;
  imageUrl: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  votes: { score: number };
  /** `in_store`: precio de sucursal física; `online`: tienda en línea; `null`: no declarado. */
  offerScope: OfferScopeUi | null;
  priceHistory: DespensaPriceHistory | null;
};

/**
 * Pasillos de la vista Despensa. Agrupan necesidades del catálogo para navegar;
 * no clasifican ofertas ni cambian el ranking.
 */
export const DESPENSA_AISLES = [
  { id: 'despensa_seca', label: 'Despensa seca', needIds: ['alimentos.azucar', 'alimentos.sal_condimentos', 'alimentos.atun_enlatados', 'alimentos.cafe_te'] },
  { id: 'cereales', label: 'Cereales, arroz, pastas y tortillas', needIds: ['alimentos.arroz', 'alimentos.maiz_harina', 'alimentos.pasta', 'alimentos.avena_cereal', 'alimentos.pan'] },
  { id: 'leguminosas', label: 'Leguminosas', needIds: ['alimentos.frijol', 'alimentos.legumbres'] },
  { id: 'aceites', label: 'Aceites', needIds: ['alimentos.aceite'] },
  { id: 'leche', label: 'Leche', needIds: ['alimentos.leche'] },
  { id: 'proteinas', label: 'Huevo y proteínas', needIds: ['alimentos.huevo', 'alimentos.pollo', 'alimentos.res', 'alimentos.cerdo'] },
  { id: 'frutas_verduras', label: 'Frutas y verduras', needIds: ['alimentos.frutas', 'alimentos.verduras', 'alimentos.frescos'] },
  { id: 'higiene', label: 'Higiene personal', needIds: ['higiene.papel_higienico', 'higiene.jabon', 'higiene.pasta_dental', 'higiene.champu', 'higiene.desodorante', 'higiene.cuidado_femenino', 'higiene.cepillo_dental'] },
  { id: 'limpieza', label: 'Limpieza del hogar', needIds: ['limpieza.detergente_ropa', 'limpieza.lavatrastes', 'limpieza.superficies', 'limpieza.cloro', 'limpieza.bolsas_basura', 'limpieza.papel_cocina'] },
  { id: 'bebes', label: 'Familia y bebés', needIds: ['bebes.panales', 'bebes.toallitas', 'bebes.formula', 'bebes.cuidado'] },
  { id: 'mascotas', label: 'Mascotas', needIds: ['mascotas.alimento_perro', 'mascotas.alimento_gato', 'mascotas.arena_gato', 'mascotas.higiene'] },
] as const;

export type DespensaAisleId = (typeof DESPENSA_AISLES)[number]['id'];

export function despensaAisleFor(needId: string): DespensaAisleId | null {
  return DESPENSA_AISLES.find((a) => (a.needIds as readonly string[]).includes(needId))?.id ?? null;
}

/**
 * Estado principal del precio. Uno solo por oferta para no saturar la tarjeta.
 * - `verified_saving`: ahorro respaldado por el historial propio de Aventa.
 * - `observed_price`: precio publicado por una tienda identificable; sin descuento demostrado.
 * - `reported_price`: precio enviado sin tienda identificable; información insuficiente.
 */
export type DespensaPriceStatus = 'verified_saving' | 'observed_price' | 'reported_price';

/** Avisos secundarios. Se muestran como texto, no como insignias. */
export type DespensaNote =
  | 'list_contradicted'
  | 'availability_unconfirmed'
  | 'branch_unconfirmed'
  | 'zone_unconfirmed'
  | 'location_unknown'
  | 'over_budget_share'
  | 'no_unit_price';

export type DespensaPick = {
  offer: DespensaOffer;
  needId: string;
  variantId: string | null;
  variantLabel: string | null;
  unitPrice: UnitPrice | null;
  standing: UnitPriceStanding;
  /** Ofertas en el mismo grupo de precio unitario (misma necesidad, variante y unidad). */
  unitPeers: number;
  cheapestPerUnit: boolean;
  saving: SavingEvidence;
  evidence: EvidenceLevel;
  freshness: Freshness;
  budgetFit: BudgetFit;
  personal: boolean;
  status: DespensaPriceStatus;
  notes: DespensaNote[];
  reasons: string[];
};

export type DespensaNeedPlan = {
  need: DespensaNeed;
  aisle: DespensaAisleId;
  personal: boolean;
  picks: DespensaPick[];
};

export type DespensaReferenceGap = {
  needId: string;
  label: string;
  presentation: string;
  aisle: DespensaAisleId;
};

export type DespensaPlan = {
  needs: DespensaNeedPlan[];
  /** Productos de la referencia oficial (PACIC) sin oferta vigente en Aventa. */
  referenceGaps: DespensaReferenceGap[];
  verifiedCount: number;
  /** Ofertas de despensa que no compiten: incompletas o con precio de más de 7 días. */
  staleCount: number;
  incompleteCount: number;
  rulesVersion: string;
};

const KIND_ORDER = { esencial: 0, cotidiano: 1, discrecional: 2 } as const;

function priceStatus(s: DespensaSignals): DespensaPriceStatus {
  if (s.saving.status === 'verified') return 'verified_saving';
  return s.evidence === 'reported' ? 'reported_price' : 'observed_price';
}

function notesFor(offer: DespensaOffer, s: DespensaSignals): DespensaNote[] {
  const notes: DespensaNote[] = [];
  if (s.saving.status === 'list_contradicted') notes.push('list_contradicted');
  if (s.evidence !== 'published_with_validity') notes.push('availability_unconfirmed');
  if (offer.offerScope === 'in_store') notes.push('branch_unconfirmed');
  else if (offer.offerScope === 'online') notes.push('zone_unconfirmed');
  else notes.push('location_unknown');
  if (s.budgetFit === 'over_share') notes.push('over_budget_share');
  if (!s.unitPrice) notes.push('no_unit_price');
  return notes;
}

const UNIT_LABEL: Record<string, string> = { kg: 'kg', l: 'litro' };

const MXN_CENTS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Pesos con centavos cuando los hay: los precios por kilo o por pieza los necesitan. */
export function formatMxnCents(amount: number): string {
  return MXN_CENTS.format(amount);
}

export function unitPriceLabel(u: UnitPrice): string {
  return `${formatMxnCents(u.value)} por ${UNIT_LABEL[u.per] ?? u.per}`;
}

/** Motivos en lenguaje llano, en el mismo orden de las claves del ranking. Máximo tres. */
export function explainPick(
  s: DespensaSignals,
  standing: UnitPriceStanding,
  unitPeers: number,
  budget: DespensaBudget | null,
  price: number,
): string[] {
  const reasons: string[] = [];
  if (s.evidence === 'published_with_validity') reasons.push('La tienda publica el precio y hasta cuándo es válido.');
  else if (s.evidence === 'published_source') reasons.push('Precio publicado por una tienda identificada.');
  if (standing === 'at_or_below_median' && s.unitPrice) {
    reasons.push(`Por ${UNIT_LABEL[s.unitPrice.per] ?? s.unitPrice.per}, está en la mitad más barata de ${unitPeers} opciones comparables.`);
  }
  if (s.saving.status === 'verified') {
    reasons.push(`${formatMxnCents(s.saving.amount)} menos que el precio más alto visto en Aventa en 90 días.`);
  }
  if (budget && s.budgetFit === 'fits') {
    const weekly = weeklyEquivalentMxn(budget);
    const pct = weekly > 0 ? Math.round((price / weekly) * 100) : null;
    if (pct != null) reasons.push(`Equivale a ${pct}% de tu presupuesto semanal.`);
  }
  if (s.personal) reasons.push('Lo marcaste en tus intereses.');
  if (s.freshness === 'fresh') reasons.push('Precio visto en los últimos 2 días.');
  return reasons.slice(0, 3);
}

export type DespensaPlanOptions = {
  now: Date;
  budget?: DespensaBudget | null;
  preferredNeedIds?: ReadonlySet<string>;
};

/**
 * Arma la vista por necesidad con el ranking de Despensa. No oculta ofertas por presupuesto:
 * el presupuesto solo desempata dentro de cada necesidad.
 */
export function buildDespensaPlan(offers: readonly DespensaOffer[], opts: DespensaPlanOptions): DespensaPlan {
  const rankOpts = { now: opts.now, budget: opts.budget ?? null, preferredNeedIds: opts.preferredNeedIds };
  const { ranked, demotions, rulesVersion } = rankDespensa(offers, rankOpts);
  const signals = ranked.map((o) => despensaSignals(o, rankOpts));
  const standings = unitPriceStandings(signals);

  const groupMin = new Map<string, number>();
  const groupSize = new Map<string, number>();
  signals.forEach((s) => {
    const key = unitPriceGroupKey(s);
    if (!key || !s.unitPrice) return;
    groupSize.set(key, (groupSize.get(key) ?? 0) + 1);
    groupMin.set(key, Math.min(groupMin.get(key) ?? Infinity, s.unitPrice.value));
  });

  const byNeed = new Map<string, DespensaPick[]>();
  ranked.forEach((offer, i) => {
    const s = signals[i];
    if (!s.needId) return;
    const key = unitPriceGroupKey(s);
    const peers = key ? groupSize.get(key) ?? 0 : 0;
    const pick: DespensaPick = {
      offer,
      needId: s.needId,
      variantId: s.variantId,
      variantLabel: despensaVariant(s.needId, s.variantId)?.label ?? null,
      unitPrice: s.unitPrice,
      standing: standings[i],
      unitPeers: peers,
      cheapestPerUnit: Boolean(key && peers >= 2 && s.unitPrice && s.unitPrice.value === groupMin.get(key)),
      saving: s.saving,
      evidence: s.evidence,
      freshness: s.freshness,
      budgetFit: s.budgetFit,
      personal: s.personal,
      status: priceStatus(s),
      notes: notesFor(offer, s),
      reasons: explainPick(s, standings[i], peers, opts.budget ?? null, offer.discountPrice),
    };
    const list = byNeed.get(s.needId) ?? [];
    list.push(pick);
    byNeed.set(s.needId, list);
  });

  const needs: DespensaNeedPlan[] = [];
  for (const [needId, picks] of byNeed) {
    const need = despensaNeedById(needId);
    const aisle = despensaAisleFor(needId);
    if (!need || !aisle) continue;
    needs.push({ need, aisle, personal: Boolean(opts.preferredNeedIds?.has(needId)), picks });
  }
  const catalogOrder = new Map(activeDespensaNeeds().map((n, i) => [n.id, i]));
  needs.sort(
    (a, b) =>
      Number(b.personal) - Number(a.personal) ||
      KIND_ORDER[a.need.kind] - KIND_ORDER[b.need.kind] ||
      (catalogOrder.get(a.need.id) ?? 0) - (catalogOrder.get(b.need.id) ?? 0),
  );

  const pacic = DESPENSA_OFFICIAL_REFERENCES.find((r) => r.id === 'profeco_pacic_24');
  const referenceGaps: DespensaReferenceGap[] = [];
  for (const item of pacic?.items ?? []) {
    const covered = (byNeed.get(item.needId) ?? []).some((p) => item.variantId == null || p.variantId === item.variantId);
    const aisle = despensaAisleFor(item.needId);
    if (!covered && aisle) referenceGaps.push({ needId: item.needId, label: item.label, presentation: item.presentation, aisle });
  }

  return {
    needs,
    referenceGaps,
    verifiedCount: needs.reduce((n, x) => n + x.picks.filter((p) => p.status === 'verified_saving').length, 0),
    staleCount: demotions.filter((d) => d.reason === 'stale_evidence').length,
    incompleteCount: demotions.filter((d) => d.reason === 'incomplete').length,
    rulesVersion,
  };
}

/** Producto guardado en la lista del usuario. Guarda el precio visto para que la suma no cambie sola. */
export type DespensaListItem = { id: string; title: string; price: number; needId: string | null; addedAt: string };

export const DESPENSA_LIST_LOCAL_KEY = 'aventa:despensa-list:v1';
export const DESPENSA_LIST_MAX_ITEMS = 60;

/** Lee la lista guardada en el dispositivo. Descarta entradas inválidas en vez de fallar. */
export function parseDespensaList(raw: unknown): DespensaListItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: DespensaListItem[] = [];
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    if (typeof o.id !== 'string' || !o.id || seen.has(o.id)) continue;
    if (typeof o.title !== 'string' || typeof o.price !== 'number' || !(o.price > 0)) continue;
    seen.add(o.id);
    out.push({
      id: o.id,
      title: o.title.slice(0, 200),
      price: o.price,
      needId: typeof o.needId === 'string' ? o.needId : null,
      addedAt: typeof o.addedAt === 'string' ? o.addedAt : '',
    });
    if (out.length >= DESPENSA_LIST_MAX_ITEMS) break;
  }
  return out;
}

export type DespensaListEstimate = {
  totalMxn: number;
  count: number;
  budgetMxn: number | null;
  horizon: DespensaBudget['horizon'] | null;
  /** Diferencia contra el presupuesto declarado; negativa si lo supera. `null` sin presupuesto. */
  remainingMxn: number | null;
  sharePct: number | null;
};

/** Gasto estimado de la lista con los precios vistos. No garantiza que alcance ni que el precio siga igual. */
export function estimateDespensaList(items: readonly Pick<DespensaListItem, 'price'>[], budget: DespensaBudget | null): DespensaListEstimate {
  const totalMxn = Math.round(items.reduce((sum, i) => sum + (i.price > 0 ? i.price : 0), 0) * 100) / 100;
  if (!budget) return { totalMxn, count: items.length, budgetMxn: null, horizon: null, remainingMxn: null, sharePct: null };
  return {
    totalMxn,
    count: items.length,
    budgetMxn: budget.amountMxn,
    horizon: budget.horizon,
    remainingMxn: Math.round((budget.amountMxn - totalMxn) * 100) / 100,
    sharePct: Math.round((totalMxn / budget.amountMxn) * 100),
  };
}

export const DESPENSA_PLAN_COPY = {
  title: 'Mi despensa',
  intro:
    'Ofertas de productos básicos ordenadas por necesidad, evidencia del precio y precio por unidad. Tu presupuesto solo ayuda a desempatar: no ocultamos nada.',
  disclaimer:
    'El total es un estimado con los precios vistos en Aventa. No garantiza que tu presupuesto alcance ni que el precio siga igual en tienda.',
  shareRule: `Una oferta «cabe» si cuesta hasta ${Math.round(DESPENSA_BUDGET_RULES.maxShareOfWeeklyBudget * 100)}% de tu presupuesto semanal.`,
  status: {
    verified_saving: 'Ahorro verificado',
    observed_price: 'Precio observado',
    reported_price: 'Precio reportado',
  } satisfies Record<DespensaPriceStatus, string>,
  statusHelp: {
    verified_saving: 'El historial de Aventa muestra este producto más caro en los últimos 90 días.',
    observed_price: 'Precio publicado por la tienda. No hay historial que demuestre un descuento.',
    reported_price: 'Precio enviado por la comunidad sin tienda identificable. Confírmalo antes de comprar.',
  } satisfies Record<DespensaPriceStatus, string>,
  notes: {
    list_contradicted: 'El historial de Aventa no respalda el precio de lista.',
    availability_unconfirmed: 'Disponibilidad no confirmada.',
    branch_unconfirmed: 'Precio de tienda física; sucursal no confirmada.',
    zone_unconfirmed: 'Precio en línea; puede variar por zona o envío.',
    location_unknown: 'No sabemos si el precio es en línea o en una sucursal.',
    over_budget_share: `Cuesta más del ${Math.round(DESPENSA_BUDGET_RULES.maxShareOfWeeklyBudget * 100)}% de tu presupuesto semanal; se muestra porque cubre esta necesidad.`,
    no_unit_price: 'No se pudo leer la presentación para compararla por unidad.',
  } satisfies Record<DespensaNote, string>,
  noOffers: 'Esta semana no hay ofertas de despensa validadas. Vuelve pronto o revisa «Día a día».',
  referenceGapsTitle: 'De la canasta de referencia, sin oferta esta semana',
  referenceGapsHelp: 'Productos de la canasta de 24 de Profeco (PACIC). Es una referencia, no una lista de lo que necesitas.',
} as const;
