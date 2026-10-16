import type { CategoryId } from '@/lib/categories';
import { normalizeCategoryForStorage } from '@/lib/categories';
import { inferOfferCategory } from '@/lib/offers/inferOfferCategory';

export type CategoryConsistencyResult =
  | { ok: true; stored: CategoryId | null; inferred: CategoryId | null }
  | {
      ok: false;
      kind: 'confirmed' | 'review';
      stored: CategoryId | null;
      inferred: CategoryId;
      ruleId: string;
      evidence: string;
    };

/** Reglas fuertes: título demuestra el producto; la categoría guardada es incompatible. */
const STRONG_RULES: Array<{
  id: string;
  pattern: RegExp;
  expected: CategoryId;
  incompatible: readonly CategoryId[];
}> = [
  {
    id: 'perfume-not-servicios',
    pattern: /\b(perfume|parfum|eau de toilette|eau de parfum|fragancia|acqua di parma|colonia)\b/i,
    expected: 'belleza',
    incompatible: ['servicios', 'jardin', 'autos', 'viajes'],
  },
  {
    id: 'dental-not-jardin',
    pattern: /\b(pasta dental|dent[ií]frico|colgate|oral[- ]b|crest)\b/i,
    expected: 'belleza',
    incompatible: ['jardin', 'servicios', 'autos'],
  },
];

/**
 * Palabras ambiguas que no deben reclasificar solas (p. ej. "servicios" en un título técnico).
 * Si solo coincide inferencia débil por keyword genérica y el título contiene estas señales tech, no forzar.
 */
const AMBIGUOUS_BLOCK_RE =
  /\b(usb|hdmi|hub|router|ssd|nvme|laptop|celular|smartphone|tablet|playstation|xbox|nintendo)\b/i;

function normalizeTitle(title: string | null | undefined): string {
  return (title ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ' ');
}

export function assessCategoryConsistency(input: {
  title?: string | null;
  category?: string | null;
  store?: string | null;
}): CategoryConsistencyResult {
  const stored = normalizeCategoryForStorage(input.category ?? null);
  const title = normalizeTitle(input.title);
  if (!title.trim()) {
    return { ok: true, stored, inferred: null };
  }

  for (const rule of STRONG_RULES) {
    if (!rule.pattern.test(title)) continue;
    if (stored && (rule.incompatible as readonly string[]).includes(stored)) {
      return {
        ok: false,
        kind: 'confirmed',
        stored,
        inferred: rule.expected,
        ruleId: rule.id,
        evidence: `Título coincide con «${rule.id}» pero categoría=${stored}`,
      };
    }
    if (stored && stored !== rule.expected && rule.expected !== stored) {
      return {
        ok: false,
        kind: 'review',
        stored,
        inferred: rule.expected,
        ruleId: rule.id,
        evidence: `Título sugiere ${rule.expected} (regla ${rule.id}); categoría=${stored}`,
      };
    }
  }

  const inferred = inferOfferCategory({ title: input.title });
  if (!inferred || !stored || inferred === stored) {
    return { ok: true, stored, inferred };
  }

  if (AMBIGUOUS_BLOCK_RE.test(title) && inferred === 'servicios') {
    return { ok: true, stored, inferred };
  }

  const farApart =
    (stored === 'servicios' && inferred !== 'servicios') ||
    (stored === 'jardin' && (inferred === 'belleza' || inferred === 'supermercado' || inferred === 'tecnologia'));

  if (!farApart) {
    return { ok: true, stored, inferred };
  }

  return {
    ok: false,
    kind: 'review',
    stored,
    inferred,
    ruleId: 'infer-far-apart',
    evidence: `inferOfferCategory=${inferred} vs almacenada=${stored}`,
  };
}

/** Categoría a persistir tras prevención: corrige solo conflictos confirmados. */
export function resolvePreventedCategory(input: {
  title?: string | null;
  category?: string | null;
  store?: string | null;
}): { category: CategoryId | null; corrected: boolean; ruleId?: string } {
  const stored = normalizeCategoryForStorage(input.category ?? null);
  const assessment = assessCategoryConsistency(input);
  if (assessment.ok) return { category: stored, corrected: false };
  if (assessment.kind === 'confirmed') {
    return { category: assessment.inferred, corrected: true, ruleId: assessment.ruleId };
  }
  return { category: stored, corrected: false, ruleId: assessment.ruleId };
}
