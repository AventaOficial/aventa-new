import { normalizeCategoryForStorage, type CategoryId } from '@/lib/categories';

export const INTEREST_CADENCES = ['daily', 'weekly', 'monthly', 'occasional'] as const;
export type InterestCadence = (typeof INTEREST_CADENCES)[number];

export const INTEREST_LIMITS = {
  maxPerUser: 30,
  labelMin: 2,
  labelMax: 80,
  optionalMax: 40,
  aliasMax: 5,
  personalPerDigest: 3,
  personalInFeed: 6,
  discoveryInFeed: 8,
  categoryMinUpvotes: 5,
  discoveryMinUpvotes: 5,
} as const;

const STOPWORDS = new Set(['para', 'con', 'sin', 'the', 'and', 'una', 'uno', 'los', 'las', 'del', 'por']);

export function normalizeInterestText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function significantTokens(normalized: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of normalized.split(' ')) {
    if (token.length < 4 || STOPWORDS.has(token) || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

export type InterestDraft = {
  label: string;
  brand?: string | null;
  model?: string | null;
  category?: string | null;
  aliases?: string[] | null;
  cadence?: InterestCadence | null;
  notify?: boolean | null;
};

export type NormalizedInterest = {
  label: string;
  labelNorm: string;
  brand: string | null;
  brandNorm: string | null;
  model: string | null;
  modelNorm: string | null;
  category: CategoryId | null;
  aliases: string[];
  aliasNorms: string[];
  cadence: InterestCadence;
  notify: boolean;
};

function cleanOptional(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export function normalizeInterestDraft(draft: InterestDraft): NormalizedInterest | { error: string } {
  const label = draft.label.trim();
  const labelNorm = normalizeInterestText(label);
  if (labelNorm.length < INTEREST_LIMITS.labelMin || label.length > INTEREST_LIMITS.labelMax) {
    return { error: 'Escribe un interés de 2 a 80 caracteres.' };
  }
  const brand = cleanOptional(draft.brand, INTEREST_LIMITS.optionalMax);
  const model = cleanOptional(draft.model, INTEREST_LIMITS.optionalMax);
  let category: CategoryId | null = null;
  if (draft.category?.trim()) {
    category = normalizeCategoryForStorage(draft.category);
    if (!category) return { error: 'Esa categoría no existe.' };
  }
  const aliases: string[] = [];
  const aliasNorms: string[] = [];
  for (const alias of draft.aliases ?? []) {
    const clean = alias.trim().slice(0, INTEREST_LIMITS.optionalMax);
    const norm = normalizeInterestText(clean);
    if (norm.length < INTEREST_LIMITS.labelMin || aliasNorms.includes(norm) || norm === labelNorm) continue;
    aliases.push(clean);
    aliasNorms.push(norm);
    if (aliases.length >= INTEREST_LIMITS.aliasMax) break;
  }
  const cadence = draft.cadence && INTEREST_CADENCES.includes(draft.cadence) ? draft.cadence : 'occasional';
  return {
    label,
    labelNorm,
    brand,
    brandNorm: brand ? normalizeInterestText(brand) : null,
    model,
    modelNorm: model ? normalizeInterestText(model) : null,
    category,
    aliases,
    aliasNorms,
    cadence,
    notify: draft.notify !== false,
  };
}

export function interestIdentity(interest: Pick<NormalizedInterest, 'labelNorm' | 'brandNorm' | 'modelNorm'>): string {
  return `${interest.labelNorm}|${interest.brandNorm ?? ''}|${interest.modelNorm ?? ''}`;
}
