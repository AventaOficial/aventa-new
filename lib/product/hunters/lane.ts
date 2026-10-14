import { classifyDespensaText } from '@/lib/despensa/classify';
import { normalizeInterestText } from '@/lib/interests/normalize';
import { SUPPLY_HUNTER_CODE, toSupplyHunterCode, type SupplyHunterCode } from './identity';

/** Hunters de especialidad: sus ofertas sí entran a Recientes. Las de uso diario no. */
export const RECIENTES_HUNTER_CODES = ['kai', 'eleonore'] as const satisfies readonly SupplyHunterCode[];

export function isRecientesHunterCode(code: string | null | undefined): boolean {
  return (RECIENTES_HUNTER_CODES as readonly string[]).includes(toSupplyHunterCode(code) ?? '');
}

/** Code efectivo de una oferta máquina: el estampado o, sin él, el hunter de uso diario. */
export function offerLaneCode(hunterCode: string | null | undefined): SupplyHunterCode {
  return toSupplyHunterCode(hunterCode) ?? SUPPLY_HUNTER_CODE;
}

const TECH_RE =
  /\b(laptop|notebook|macbook|chromebook|smartphone|celular|iphone|ipad|tablet|galaxy|pixel|huawei|xiaomi|motorola|audifonos|auriculares|earbuds|airpods|bocina|monitor|teclado|mouse|webcam|consola|nintendo|playstation|ps5|xbox|smartwatch|smart tv|ssd|router|rtx|ryzen|gamer|gaming|videojuego)\b/;

const FASHION_RE =
  /\b(perfume|parfum|eau de toilette|colonia|fragancia|tenis|sneakers|zapatos|zapatillas|botas|vestido|playera|camisa|jeans|pantalon|sudadera|chamarra|nike|adidas|puma|converse|vans|new balance)\b/;

const MAKEUP_RE =
  /\b(maquillaje|labial|labiales|lip gloss|brillo labial|delineador|rimel|mascara de pestanas|pestanas postizas|sombras? de ojos|paleta de sombras|rubor|blush|bronzer|contorno facial|iluminador facial|corrector de ojeras|corrector facial|concealer|polvo compacto|polvo traslucido|primer facial|fijador de maquillaje|setting spray|bb cream|cc cream|maybelline|l oreal|loreal|revlon|nyx|nars|fenty|rare beauty|charlotte tilbury|too faced|urban decay|huda beauty|benefit cosmetics|mac cosmetics|clinique|lancome|estee lauder|bobbi brown|essence cosmetics|e l f cosmetics)\b/;

const CATEGORY_HUNTER: Readonly<Record<string, SupplyHunterCode>> = {
  tecnologia: 'kai',
  gaming: 'kai',
  moda: 'eleonore',
  supermercado: 'ximena',
  bebes: 'ximena',
  hogar: 'ximena',
};

/**
 * Hunter que corresponde por título y categoría. Null si no hay señal clara:
 * entonces no se marca incongruencia. El título manda sobre la categoría.
 */
export function suggestSupplyHunter(input: { title?: string | null; category?: string | null }): SupplyHunterCode | null {
  const text = normalizeInterestText(input.title ?? '');
  if (text) {
    if (TECH_RE.test(text)) return 'kai';
    if (FASHION_RE.test(text) || MAKEUP_RE.test(text)) return 'eleonore';
    if (classifyDespensaText(input.title)) return 'ximena';
  }
  return CATEGORY_HUNTER[input.category?.trim().toLowerCase() ?? ''] ?? null;
}

/** Incongruencia entre el hunter de la oferta y lo que sugiere su contenido. */
export function hunterLaneMismatch(input: {
  hunterCode: string | null | undefined;
  title?: string | null;
  category?: string | null;
}): { current: SupplyHunterCode; suggested: SupplyHunterCode } | null {
  const current = offerLaneCode(input.hunterCode);
  const suggested = suggestSupplyHunter(input);
  return suggested && suggested !== current ? { current, suggested } : null;
}
