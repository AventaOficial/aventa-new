import {
  normalizeCategoryForStorage,
  type CategoryId,
} from '@/lib/categories';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';

/** MLM ids frecuentes en seeds / listados (card-only suele no traer category_id). */
const ML_CATEGORY_TO_AVENTA: Record<string, CategoryId> = {
  MLM1000: 'tecnologia',
  MLM1051: 'tecnologia',
  MLM1648: 'tecnologia',
  MLM1144: 'tecnologia',
  MLM1574: 'hogar',
  MLM1499: 'hogar',
  MLM1246: 'hogar',
  MLM1276: 'moda',
  MLM1430: 'belleza',
  MLM1747: 'supermercado',
  MLM1168: 'servicios',
  MLM1540: 'viajes',
};

type KeywordRule = { category: CategoryId; patterns: RegExp[] };

const KEYWORD_RULES: KeywordRule[] = [
  {
    category: 'servicios',
    patterns: [
      /\buber\s*eats?\b/i,
      /\brappi\b/i,
      /\bdomino'?s?\b/i,
      /\bpizza hut\b/i,
      /\bspotify\b/i,
      /\bnetflix\b/i,
      /\bprime video\b/i,
      /\bsuscripci[oó]n\b/i,
      /\bplan\s+(mensual|anual)\b/i,
      /\bbanco\b/i,
      /\btarjeta de cr[eé]dito\b/i,
    ],
  },
  {
    category: 'supermercado',
    patterns: [
      /\bsuper(mercado)?\b/i,
      /\bdespensa\b/i,
      /\bcomestible\b/i,
      /\balimento\b/i,
      /\bcerveza\b/i,
      /\bvino\b/i,
      /\brefresco\b/i,
      /\bsnack\b/i,
      /\bcereal\b/i,
      /\bleche\b/i,
      /\bcaf[eé]\b/i,
      /\bat[uú]n\b/i,
      /\barroz\b/i,
      /\bpasta\b/i,
      /\bhelado\b/i,
      /\bpan\b/i,
      /\bgalleta\b/i,
    ],
  },
  {
    category: 'hogar',
    patterns: [
      /\blimpieza\b/i,
      /\bdetergente\b/i,
      /\bcloro\b/i,
      /\bpapel (higi[eé]nico|toalla)\b/i,
      /\bhigiene del hogar\b/i,
      /\btrapo\b/i,
      /\bescoba\b/i,
      /\btrapeador\b/i,
      /\baspiradora\b/i,
      /\blicuadora\b/i,
      /\bfreidora\b/i,
      /\bmicroondas\b/i,
      /\brefrigerador\b/i,
      /\blavadora\b/i,
      /\bcolch[oó]n\b/i,
      /\bs[aá]bana\b/i,
      /\btoalla\b/i,
      /\bcocina\b/i,
      /\bollas?\b/i,
      /\bsarten\b/i,
    ],
  },
  {
    category: 'belleza',
    patterns: [
      /\bperfume\b/i,
      /\bmaquillaje\b/i,
      /\brubor\b/i,
      /\blabial\b/i,
      /\bshampoo\b/i,
      /\bchamp[uú]\b/i,
      /\bacondicionador\b/i,
      /\bcuidado (facial|personal|de la piel)\b/i,
      /\bcream\b/i,
      /\bcrema\b/i,
      /\bserum\b/i,
      /\bdesodorante\b/i,
      /\bafeitad\b/i,
    ],
  },
  {
    category: 'moda',
    patterns: [
      /\btenis\b/i,
      /\bzapatos?\b/i,
      /\bsneaker\b/i,
      /\bplayera\b/i,
      /\bcamisa\b/i,
      /\bpantal[oó]n\b/i,
      /\bjeans\b/i,
      /\bvestido\b/i,
      /\bbolsa\b/i,
      /\bmochila\b/i,
      /\brolex\b/i,
      /\breloj\b/i,
    ],
  },
  {
    category: 'viajes',
    patterns: [/\bvuelo\b/i, /\bhotel\b/i, /\bvolaris\b/i, /\bairbnb\b/i, /\bmaleta\b/i],
  },
  {
    category: 'gaming',
    patterns: [
      /\bplaystation\b/i,
      /\bxbox\b/i,
      /\bnintendo\b/i,
      /\bvideojuego\b/i,
      /\bgame\s?pass\b/i,
      /\bcontrol(ler)?\b/i,
      /\bsteam deck\b/i,
    ],
  },
  {
    category: 'tecnologia',
    patterns: [
      /\blaptop\b/i,
      /\bnotebook\b/i,
      /\bcelular\b/i,
      /\bsmartphone\b/i,
      /\biphone\b/i,
      /\bsamsung galaxy\b/i,
      /\baud[ií]fonos?\b/i,
      /\btablet\b/i,
      /\bmonitor\b/i,
      /\bssd\b/i,
      /\bnvme\b/i,
      /\btarjeta gr[aá]fica\b/i,
      /\brouter\b/i,
      /\bsmart\s?watch\b/i,
      /\btelevisor\b/i,
      /\btv\b/i,
    ],
  },
];

function matchKeywords(title: string, store: string): CategoryId | null {
  const haystack = `${title} ${store}`.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.patterns.some((re) => re.test(haystack))) return rule.category;
  }
  return null;
}

function mlIdFromUrl(url: string): string | null {
  const m = url.match(/[?&]category=(MLM\d+)/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Infiere categoría Aventa para ofertas del bot (card-only ML, sin category_id fiable).
 */
export function classifyBotCategory(
  meta: ParsedOfferMetadata,
  techCategoryIds?: Set<string>
): CategoryId | null {
  const mlCat = meta.signals?.categoryId?.trim()?.toUpperCase() ?? null;
  if (mlCat) {
    if (ML_CATEGORY_TO_AVENTA[mlCat]) return ML_CATEGORY_TO_AVENTA[mlCat];
    if (techCategoryIds?.has(mlCat)) return 'tecnologia';
  }

  const fromUrl = mlIdFromUrl(meta.canonicalUrl);
  if (fromUrl && ML_CATEGORY_TO_AVENTA[fromUrl]) return ML_CATEGORY_TO_AVENTA[fromUrl];

  const byKeywords = matchKeywords(meta.title, meta.store);
  if (byKeywords) return byKeywords;

  if (mlCat && techCategoryIds?.has(mlCat)) return 'tecnologia';

  return null;
}

export function classifyBotCategoryForStorage(
  meta: ParsedOfferMetadata,
  techCategoryIds?: Set<string>
): string | null {
  const raw = classifyBotCategory(meta, techCategoryIds);
  return raw ? normalizeCategoryForStorage(raw) : null;
}
