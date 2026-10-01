/**
 * Catálogo de demanda para orientar discovery (México).
 * Capa C: marca/modelo → búsqueda. No es Price Memory (capa A) ni catálogo retailer (B).
 */

export type DemandNiche =
  | 'electronics'
  | 'day_to_day'
  | 'beauty'
  | 'mobility'
  | 'fashion'
  | 'home'
  | 'media';

/** Discrete catalog demand level — never a free-form number. */
export type DemandLevel = 1 | 2 | 3 | 4 | 5;

export type DemandEntry = {
  brand: string;
  /** Modelos concretos; si hay match, la demanda sube. */
  models?: readonly string[];
  /** 1 = filler, 5 = objeto de deseo habitual. */
  demand: DemandLevel;
  niche: DemandNiche;
};

/** Raise demand one step when a concrete model matches; stay within 1..5. */
function bumpDemandOnModelMatch(level: DemandLevel): DemandLevel {
  switch (level) {
    case 1:
      return 2;
    case 2:
      return 3;
    case 3:
      return 4;
    case 4:
    case 5:
      return 5;
  }
}

export const DEMAND_CATALOG: readonly DemandEntry[] = [
  { brand: 'apple', models: ['iphone 17', 'iphone 16', 'iphone 15', 'iphone 14', 'macbook', 'ipad', 'airpods', 'watch'], demand: 5, niche: 'electronics' },
  { brand: 'samsung', models: ['galaxy s26', 'galaxy s25', 'galaxy s24', 'galaxy a56', 'galaxy a55', 'galaxy a54', 'tab s10', 'neo qled', 'oled', 'odyssey'], demand: 5, niche: 'electronics' },
  { brand: 'ugreen', models: ['nexode', '100w'], demand: 3, niche: 'electronics' },
  { brand: 'xiaomi', models: ['redmi', 'poco', 'poco x7', 'redmi note'], demand: 4, niche: 'electronics' },
  { brand: 'motorola', models: ['edge 60', 'edge 50', 'g85', 'g54'], demand: 4, niche: 'electronics' },
  { brand: 'google', models: ['pixel'], demand: 4, niche: 'electronics' },
  { brand: 'sony', models: ['playstation', 'ps5', 'wh-1000', 'bravia'], demand: 5, niche: 'electronics' },
  { brand: 'nintendo', models: ['switch 2', 'switch oled', 'switch'], demand: 5, niche: 'electronics' },
  { brand: 'microsoft', models: ['xbox', 'surface'], demand: 4, niche: 'electronics' },
  { brand: 'asus', models: ['rog', 'tuf', 'vivobook', 'zenbook'], demand: 4, niche: 'electronics' },
  { brand: 'lenovo', models: ['legion', 'loq', 'thinkpad', 'ideapad'], demand: 4, niche: 'electronics' },
  { brand: 'hp', models: ['omen', 'victus', 'pavilion'], demand: 3, niche: 'electronics' },
  { brand: 'acer', models: ['nitro', 'predator', 'aspire'], demand: 3, niche: 'electronics' },
  { brand: 'dell', models: ['xps', 'g15', 'alienware'], demand: 3, niche: 'electronics' },
  { brand: 'lg', models: ['oled', 'gram', 'thinq'], demand: 4, niche: 'electronics' },
  { brand: 'hisense', models: ['u8', 'u7', 'u6', 'vidaa'], demand: 4, niche: 'electronics' },
  { brand: 'tcl', models: ['qled', 'mini led'], demand: 3, niche: 'electronics' },
  { brand: 'dyson', models: ['airwrap', 'supersonic', 'v15', 'v12'], demand: 5, niche: 'home' },
  { brand: 'bose', models: ['quietcomfort', 'qc'], demand: 4, niche: 'electronics' },
  { brand: 'jbl', models: ['charge', 'flip', 'tune'], demand: 3, niche: 'electronics' },
  { brand: 'kindle', models: ['paperwhite', 'oasis'], demand: 4, niche: 'electronics' },
  { brand: 'amazon', models: ['echo', 'fire tv', 'kindle'], demand: 3, niche: 'electronics' },
  { brand: 'gopro', models: ['hero'], demand: 3, niche: 'electronics' },
  { brand: 'dji', models: ['mini', 'osmo', 'air'], demand: 4, niche: 'electronics' },
  { brand: 'nike', models: ['dunk', 'air force', 'air max', 'pegasus', 'vomero', 'jordan'], demand: 5, niche: 'fashion' },
  { brand: 'adidas', models: ['samba', 'campus', 'ultraboost', 'gazelle', 'superstar'], demand: 5, niche: 'fashion' },
  { brand: 'new balance', models: ['550', '9060', '530', '327'], demand: 4, niche: 'fashion' },
  { brand: 'puma', models: ['suede', 'palermo'], demand: 3, niche: 'fashion' },
  { brand: 'converse', models: ['chuck'], demand: 3, niche: 'fashion' },
  { brand: 'vans', models: ['old skool'], demand: 3, niche: 'fashion' },
  { brand: 'italika', models: ['250z', 'ft 150', 'dt 150', 'vitalia'], demand: 5, niche: 'mobility' },
  { brand: 'honda', models: ['cb190', 'cb300', 'navi', 'cargo'], demand: 5, niche: 'mobility' },
  { brand: 'yamaha', models: ['yzf', 'fz', 'nmax'], demand: 4, niche: 'mobility' },
  { brand: 'suzuki', models: ['gn125', 'gixxer'], demand: 3, niche: 'mobility' },
  { brand: 'bajaj', models: ['pulsar', 'dominar'], demand: 3, niche: 'mobility' },
  { brand: 'v<fim-middle>espa', models: ['primavera', 'gts'], demand: 4, niche: 'mobility' },
  { brand: 'netflix', demand: 5, niche: 'media' },
  { brand: 'spotify', models: ['premium'], demand: 5, niche: 'media' },
  { brand: 'disney', models: ['plus', 'disney+'], demand: 4, niche: 'media' },
  { brand: 'hbo', models: ['max'], demand: 4, niche: 'media' },
  { brand: 'youtube', models: ['premium'], demand: 4, niche: 'media' },
  { brand: 'microsoft 365', models: ['office'], demand: 3, niche: 'media' },
  { brand: 'norton', demand: 2, niche: 'media' },
  { brand: 'mcafee', demand: 1, niche: 'media' },
  { brand: 'persil', demand: 4, niche: 'day_to_day' },
  { brand: 'ariel', demand: 3, niche: 'day_to_day' },
  { brand: 'downy', demand: 3, niche: 'day_to_day' },
  { brand: 'suavitel', demand: 3, niche: 'day_to_day' },
  { brand: 'ace', demand: 3, niche: 'day_to_day' },
  { brand: 'vanish', demand: 3, niche: 'day_to_day' },
  { brand: 'regio', demand: 4, niche: 'day_to_day' },
  { brand: 'lysol', demand: 4, niche: 'day_to_day' },
  { brand: 'cottonelle', demand: 3, niche: 'day_to_day' },
  { brand: 'petal', demand: 3, niche: 'day_to_day' },
  { brand: 'kleenex', demand: 3, niche: 'day_to_day' },
  { brand: 'suavel', demand: 2, niche: 'day_to_day' },
  { brand: 'colgate', demand: 4, niche: 'day_to_day' },
  { brand: 'oral-b', demand: 3, niche: 'day_to_day' },
  { brand: 'head & shoulders', demand: 3, niche: 'day_to_day' },
  { brand: 'pantene', demand: 3, niche: 'day_to_day' },
  { brand: 'dove', demand: 3, niche: 'day_to_day' },
  { brand: 'nivea', demand: 3, niche: 'beauty' },
  { brand: 'cerave', demand: 4, niche: 'beauty' },
  { brand: 'la roche', demand: 4, niche: 'beauty' },
  { brand: 'eucerin', demand: 3, niche: 'beauty' },
  { brand: 'isdin', demand: 3, niche: 'beauty' },
  { brand: 'vichy', demand: 3, niche: 'beauty' },
  { brand: 'loreal', demand: 3, niche: 'beauty' },
  { brand: 'maybelline', demand: 3, niche: 'beauty' },
  { brand: 'dior', demand: 5, niche: 'beauty' },
  { brand: 'chanel', demand: 5, niche: 'beauty' },
  { brand: 'versace', demand: 4, niche: 'beauty' },
  { brand: 'carolina herrera', demand: 4, niche: 'beauty' },
  { brand: 'paco rabanne', demand: 4, niche: 'beauty' },
  { brand: 'creed', demand: 4, niche: 'beauty' },
  { brand: 'nescafe', demand: 3, niche: 'day_to_day' },
  { brand: 'nespresso', demand: 4, niche: 'day_to_day' },
  { brand: 'lala', demand: 3, niche: 'day_to_day' },
  { brand: 'alpura', demand: 3, niche: 'day_to_day' },
  { brand: 'bimbo', demand: 2, niche: 'day_to_day' },
  { brand: 'sabritas', demand: 2, niche: 'day_to_day' },
  { brand: 'coca-cola', demand: 2, niche: 'day_to_day' },
  { brand: 'heineken', demand: 3, niche: 'day_to_day' },
  { brand: 'corona', demand: 3, niche: 'day_to_day' },
  { brand: 'makita', demand: 4, niche: 'home' },
  { brand: 'dewalt', demand: 4, niche: 'home' },
  { brand: 'bosch', demand: 4, niche: 'home' },
  { brand: 'truper', demand: 3, niche: 'home' },
  { brand: 'midea', models: ['minisplit'], demand: 4, niche: 'home' },
  { brand: 'carrier', models: ['minisplit'], demand: 4, niche: 'home' },
  { brand: 'whirlpool', demand: 3, niche: 'home' },
  { brand: 'mabe', demand: 3, niche: 'home' },
  { brand: 'oster', demand: 2, niche: 'home' },
  { brand: 'nutribullet', demand: 3, niche: 'home' },
  { brand: 'instant pot', demand: 3, niche: 'home' },
  { brand: 'lego', demand: 4, niche: 'electronics' },
  { brand: 'pokemon', demand: 4, niche: 'electronics' },
];

function normalizeHaystack(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRe(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Evita que "ace"/"lg"/"hp" peguen dentro de otras palabras. */
function containsToken(hay: string, needle: string): boolean {
  if (!needle) return false;
  if (needle.includes(' ')) return hay.includes(needle);
  const re = new RegExp(`(?:^|[^a-z0-9])${escapeRe(needle)}(?:[^a-z0-9]|$)`);
  return re.test(hay);
}

export type DemandMatch = {
  brand: string;
  model: string | null;
  demand: DemandLevel;
  niche: DemandNiche;
};

export function matchDemandCatalog(title: string): DemandMatch | null {
  const hay = normalizeHaystack(title);
  if (!hay) return null;
  let best: DemandMatch | null = null;
  for (const entry of DEMAND_CATALOG) {
    const brand = normalizeHaystack(entry.brand);
    if (!brand || !containsToken(hay, brand)) continue;
    let model: string | null = null;
    let demand: DemandLevel = entry.demand;
    if (entry.models) {
      for (const m of entry.models) {
        const nm = normalizeHaystack(m);
        if (nm && containsToken(hay, nm)) {
          model = m;
          demand = bumpDemandOnModelMatch(entry.demand);
          break;
        }
      }
    }
    if (!best || demand > best.demand || (demand === best.demand && (model ? 1 : 0) > (best.model ? 1 : 0))) {
      best = { brand: entry.brand, model, demand, niche: entry.niche };
    }
  }
  return best;
}
