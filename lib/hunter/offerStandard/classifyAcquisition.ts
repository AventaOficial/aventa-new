import type { OfferEventFamily } from './families';
import { FAMILY_ACQUISITION_BONUS } from './families';
import { matchDemandCatalog } from './demandCatalog';
import { parseUnitEconomics } from './unitEconomics';

export type AcquisitionSignals = {
  family: OfferEventFamily;
  demandScore: number;
  /** 0–100 advisory. No sustituye DealScore ni DQE. */
  acquisitionScore: number;
  familyKey: string | null;
  brand: string | null;
  model: string | null;
  unitPackCount: number | null;
};

const STOCK_UP_RE =
  /\b(papel higienico|papel de ba[nñ]o|detergente|suavizante|jabon (?:en )?polvo|pasta dental|crema dental|shampoo|toalla (?:de )?(?:cocina|papel)|servilletas|cloro|desinfectante|aceite (?:de )?(?:cocina|canola|oliva)|arroz|frijol|atun|leche|pan de caja|cereal|pañales|panales|toallas humedas)\b/i;

const UTILITY_RE =
  /\b(taladro|rotomartillo|minisplit|mini split|tinaco|calentador|escalera|desbrozadora|podadora|compresor|soldadora|generador|lavadora|refrigerador|estufa)\b/i;

const PREMIUM_RE =
  /\b(iphone|macbook|ipad pro|galaxy s2[45]|oled|neo qled|playstation|ps5|switch 2|airpods (?:pro|max)|dyson)\b/i;

const FREEBIE_RE = /\b(gratis|3 meses gratis|incluido)\b/i;
const BUNDLE_RE = /\b(paquete|bundle|combo|kit)\b/i;
const STACK_RE = /\b(msi|meses sin intereses|cupon|cupón|envio gratis|envío gratis|prime)\b/i;
const GAME_KEY_RE = /\b(nuuvem|clave (?:cd|digital)|cd key|steam key)\b/i;

function fold(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function classifyOfferFamily(title: string): OfferEventFamily {
  const t = fold(title);
  if (!t.trim()) return 'unknown';
  if (FREEBIE_RE.test(t) && /\b(suscripcion|subscription|meses|netflix|spotify|disney)\b/i.test(t)) {
    return 'freebie';
  }
  if (GAME_KEY_RE.test(t)) return 'anomaly';
  if (PREMIUM_RE.test(t)) return 'premium_crush';
  if (STOCK_UP_RE.test(t)) return 'stock_up';
  if (UTILITY_RE.test(t)) return 'utility';
  if (BUNDLE_RE.test(t) && STOCK_UP_RE.test(t)) return 'bundle';
  if (STACK_RE.test(t)) return 'stack';
  const demand = matchDemandCatalog(title);
  if (demand?.model) return 'brand_model';
  if (demand && demand.demand >= 4) return 'brand_model';
  return 'unknown';
}

function familyKeyFrom(title: string, brand: string | null, model: string | null): string | null {
  if (brand && model) return `${fold(brand)}:${fold(model)}`;
  if (brand) {
    const units = parseUnitEconomics(title, null);
    if (units.raw) return `${fold(brand)}:${fold(units.raw)}`;
    return fold(brand);
  }
  return null;
}

export function classifyAcquisitionCandidate(input: {
  title?: string | null;
  url?: string | null;
  currentPrice?: number | null;
}): AcquisitionSignals {
  const title = (input.title ?? '').trim();
  if (!title) {
    return {
      family: 'unknown',
      demandScore: 0,
      acquisitionScore: 40,
      familyKey: input.url ? fold(input.url).slice(0, 80) : null,
      brand: null,
      model: null,
      unitPackCount: null,
    };
  }

  const demand = matchDemandCatalog(title);
  const family = classifyOfferFamily(title);
  const units = parseUnitEconomics(title, input.currentPrice ?? null);
  const demandScore = demand?.demand ?? 0;
  let score = demandScore * 14 + FAMILY_ACQUISITION_BONUS[family];
  if (units.packCount != null && units.packCount >= 4 && family === 'stock_up') {
    score += 8;
  }
  if (family === 'anomaly') {
    score = Math.min(score, 18);
  }

  return {
    family,
    demandScore,
    acquisitionScore: Math.max(0, Math.min(100, score)),
    familyKey: familyKeyFrom(title, demand?.brand ?? null, demand?.model ?? null),
    brand: demand?.brand ?? null,
    model: demand?.model ?? null,
    unitPackCount: units.packCount,
  };
}
