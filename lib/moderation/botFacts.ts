import { ALL_CATEGORIES, normalizeCategoryForStorage, isVitalCategory } from '@/lib/categories';
import { assessOfferAffiliateLink } from '@/lib/affiliate/assessOfferAffiliateLink';

/** Título más largo que esto se marca para recortar antes de publicar. */
export const MODERATION_TITLE_MAX = 110;

/** Lectura defensiva de `offers.bot_meta` (jsonb libre escrito por el bot). */
export type BotMetaSignals = {
  ratingAverage?: number | null;
  ratingCount?: number | null;
  soldQuantity?: number | null;
  condition?: string | null;
  categoryId?: string | null;
  listingTypeId?: string | null;
  priceLowest30d?: number | null;
  priceLowest90d?: number | null;
  priceVsLowest90dPct?: number | null;
  habitual30d?: number | null;
  savingsVsHabitualPct?: number | null;
  effectiveDiscountPercent?: number | null;
  suspectedArtificialListPrice?: boolean | null;
  priceIntelSource?: string | null;
};

export type BotMetaScore = {
  total?: number | null;
  discount?: number | null;
  popularity?: number | null;
  rating?: number | null;
  category?: number | null;
  priceAppeal?: number | null;
  historical?: number | null;
};

export type BotMeta = {
  source?: string | null;
  sourceDetail?: string | null;
  decision?: string | null;
  capturedAt?: string | null;
  score?: BotMetaScore;
  signals?: BotMetaSignals;
};

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function num(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function parseBotMeta(raw: unknown): BotMeta | null {
  const root = asRecord(raw);
  if (!root) return null;

  const scoreRaw = asRecord(root.score) ?? {};
  const signalsRaw = asRecord(root.signals) ?? {};

  const score: BotMetaScore = {
    total: num(scoreRaw.total),
    discount: num(scoreRaw.discount),
    popularity: num(scoreRaw.popularity),
    rating: num(scoreRaw.rating),
    category: num(scoreRaw.category),
    priceAppeal: num(scoreRaw.priceAppeal),
    historical: num(scoreRaw.historical),
  };

  const signals: BotMetaSignals = {
    ratingAverage: num(signalsRaw.ratingAverage),
    ratingCount: num(signalsRaw.ratingCount),
    soldQuantity: num(signalsRaw.soldQuantity),
    condition: str(signalsRaw.condition),
    categoryId: str(signalsRaw.categoryId),
    listingTypeId: str(signalsRaw.listingTypeId),
    priceLowest30d: num(signalsRaw.priceLowest30d),
    priceLowest90d: num(signalsRaw.priceLowest90d),
    priceVsLowest90dPct: num(signalsRaw.priceVsLowest90dPct),
    habitual30d: num(signalsRaw.habitual30d),
    savingsVsHabitualPct: num(signalsRaw.savingsVsHabitualPct),
    effectiveDiscountPercent: num(signalsRaw.effectiveDiscountPercent),
    suspectedArtificialListPrice:
      typeof signalsRaw.suspectedArtificialListPrice === 'boolean'
        ? signalsRaw.suspectedArtificialListPrice
        : null,
    priceIntelSource: str(signalsRaw.priceIntelSource),
  };

  return {
    source: str(root.source),
    sourceDetail: str(root.sourceDetail),
    decision: str(root.decision),
    capturedAt: str(root.capturedAt),
    score,
    signals,
  };
}

/** Desglose legado embebido en el comentario: `d53 p58 r60 c35 $88`. */
export function parseLegacyScoreBreakdown(moderatorComment?: string | null): BotMetaScore | null {
  const text = moderatorComment ?? '';
  const m = text.match(/d(\d{1,3})\s+p(\d{1,3})\s+r(\d{1,3})\s+c(\d{1,3})\s+\$(\d{1,3})/i);
  if (!m) return null;
  return {
    discount: Number(m[1]),
    popularity: Number(m[2]),
    rating: Number(m[3]),
    category: Number(m[4]),
    priceAppeal: Number(m[5]),
  };
}

export type BotSignalLevel = 'good' | 'mid' | 'weak';

export type BotScoreChip = {
  key: string;
  label: string;
  /** Palabra en lenguaje humano: bueno / medio / flojo. */
  verdict: string;
  level: BotSignalLevel;
  score: number;
};

const SCORE_LABELS: { key: keyof BotMetaScore; label: string }[] = [
  { key: 'discount', label: 'Descuento' },
  { key: 'popularity', label: 'Demanda' },
  { key: 'rating', label: 'Reseñas' },
  { key: 'priceAppeal', label: 'Precio' },
  { key: 'historical', label: 'Historial' },
  { key: 'category', label: 'Categoría' },
];

function levelFor(score: number): BotSignalLevel {
  if (score >= 70) return 'good';
  if (score >= 45) return 'mid';
  return 'weak';
}

const VERDICTS: Record<BotSignalLevel, string> = {
  good: 'bueno',
  mid: 'medio',
  weak: 'flojo',
};

/**
 * Traduce el desglose técnico (`d53 p58 r60…`) a chips legibles.
 * Prefiere `bot_meta`; cae al comentario para ofertas antiguas.
 */
export function buildBotScoreChips(input: {
  botMeta?: BotMeta | null;
  moderatorComment?: string | null;
}): BotScoreChip[] {
  const fromMeta = input.botMeta?.score;
  const hasMeta =
    fromMeta != null && SCORE_LABELS.some(({ key }) => num(fromMeta[key]) != null);
  const score = hasMeta ? fromMeta : parseLegacyScoreBreakdown(input.moderatorComment);
  if (!score) return [];

  const chips: BotScoreChip[] = [];
  for (const { key, label } of SCORE_LABELS) {
    const value = num(score[key]);
    if (value == null) continue;
    const level = levelFor(value);
    chips.push({ key: String(key), label, verdict: VERDICTS[level], level, score: value });
  }
  return chips;
}

export type BotFact = {
  key: string;
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'warn';
};

function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('es-MX')}`;
}

/** Datos duros que el bot capturó de la tienda y sirven para decidir sin foto. */
export function buildBotFacts(botMeta?: BotMeta | null): BotFact[] {
  const s = botMeta?.signals;
  if (!s) return [];
  const facts: BotFact[] = [];

  if (s.soldQuantity != null && s.soldQuantity > 0) {
    facts.push({
      key: 'sold',
      label: 'Vendidos',
      value: `${s.soldQuantity.toLocaleString('es-MX')} unidades`,
      tone: s.soldQuantity >= 100 ? 'good' : 'neutral',
    });
  }

  if (s.ratingAverage != null) {
    const count = s.ratingCount != null && s.ratingCount > 0 ? ` (${s.ratingCount.toLocaleString('es-MX')})` : '';
    facts.push({
      key: 'rating',
      label: 'Calificación',
      value: `${s.ratingAverage.toFixed(1)} de 5${count}`,
      tone: s.ratingAverage >= 4.3 ? 'good' : s.ratingAverage < 3.8 ? 'warn' : 'neutral',
    });
  }

  if (s.condition) {
    facts.push({
      key: 'condition',
      label: 'Condición',
      value: s.condition.toLowerCase() === 'new' ? 'Nuevo' : s.condition,
      tone: s.condition.toLowerCase() === 'new' ? 'good' : 'warn',
    });
  }

  if (s.savingsVsHabitualPct != null) {
    const pct = Math.round(s.savingsVsHabitualPct);
    facts.push({
      key: 'vs-habitual',
      label: 'Vs. precio habitual',
      value: pct >= 0 ? `${pct}% más barato` : `${Math.abs(pct)}% más caro`,
      tone: pct >= 12 ? 'good' : pct < 0 ? 'warn' : 'neutral',
    });
  }

  if (s.priceLowest90d != null) {
    const gap = s.priceVsLowest90dPct != null ? Math.round(s.priceVsLowest90dPct) : null;
    facts.push({
      key: 'lowest-90d',
      label: 'Mínimo 90 días',
      value: gap != null ? `${formatMoney(s.priceLowest90d)} (${gap}% arriba hoy)` : formatMoney(s.priceLowest90d),
      tone: gap != null && gap <= 8 ? 'good' : 'neutral',
    });
  }

  if (s.suspectedArtificialListPrice) {
    facts.push({
      key: 'fake-list-price',
      label: 'Aviso',
      value: 'El precio anterior parece inflado',
      tone: 'warn',
    });
  }

  return facts;
}

export type ChecklistState = 'ok' | 'missing' | 'warn';

export type ModerationChecklistItem = {
  id: 'photo' | 'link' | 'affiliate' | 'category' | 'title';
  label: string;
  state: ChecklistState;
  detail: string;
};

export type ChecklistInput = {
  title?: string | null;
  image_url?: string | null;
  image_urls?: string[] | null;
  offer_url?: string | null;
  category?: string | null;
};

/**
 * Lo único que el moderador necesita saber: qué falta para poder publicar.
 */
export function buildModerationChecklist(offer: ChecklistInput): ModerationChecklistItem[] {
  const hasPhoto =
    Boolean(offer.image_url?.trim()) ||
    (offer.image_urls ?? []).some((u) => Boolean(u?.trim()));
  const hasLink = Boolean(offer.offer_url?.trim());
  const categoryNorm = normalizeCategoryForStorage(offer.category ?? null);
  const categoryLabel = categoryNorm
    ? ALL_CATEGORIES.find((c) => c.value === categoryNorm)?.label ?? categoryNorm
    : null;
  const title = (offer.title ?? '').trim();
  const affiliate = assessOfferAffiliateLink(offer.offer_url);

  const linkItems: ModerationChecklistItem[] = [
    {
      id: 'link',
      label: 'Enlace',
      state: hasLink ? 'ok' : 'missing',
      detail: hasLink ? 'Listo' : 'Falta — pega la URL del producto',
    },
    {
      id: 'affiliate',
      label: 'Enlace Aventa',
      state: !hasLink
        ? 'missing'
        : !affiliate.isProduct
          ? 'missing'
          : affiliate.needsAffiliate && !affiliate.isTagged
            ? 'warn'
            : 'ok',
      detail: !hasLink
        ? 'Primero pega el enlace de la tienda'
        : !affiliate.isProduct
          ? 'No resuelve a un producto — abre y corrige la URL'
          : affiliate.needsAffiliate && !affiliate.isTagged
            ? 'Sin tag aún — al aprobar AVENTA lo aplica sola'
            : affiliate.needsAffiliate
              ? 'Tag Aventa aplicado'
              : 'Listo (tienda sin programa configurado)',
    },
  ];

  return [
    {
      id: 'photo',
      label: 'Foto',
      state: hasPhoto ? 'ok' : 'missing',
      detail: hasPhoto ? 'Lista' : 'Falta — pega la imagen de la tienda',
    },
    ...linkItems,
    {
      id: 'category',
      label: 'Categoría',
      state: categoryLabel ? 'ok' : 'missing',
      detail: categoryLabel
        ? isVitalCategory(categoryNorm)
          ? `${categoryLabel} · Día a día`
          : categoryLabel
        : 'Falta — elige dónde va en el feed',
    },
    {
      id: 'title',
      label: 'Título',
      state: !title ? 'missing' : title.length > MODERATION_TITLE_MAX ? 'warn' : 'ok',
      detail: !title
        ? 'Falta'
        : title.length > MODERATION_TITLE_MAX
          ? `Largo (${title.length}) — conviene recortar`
          : 'Listo',
    },
  ];
}

/** Cuántas cosas impiden publicar (los avisos no bloquean). */
export function countChecklistBlockers(items: ModerationChecklistItem[]): number {
  return items.filter((i) => i.state === 'missing').length;
}
