import { despensaNeedById, type ComparableDimension } from '@/lib/despensa/catalog';

/**
 * Presentación comparable leída del título.
 * Solo se acepta cuando la lectura no es ambigua; si no, devuelve null y la comparación
 * queda «no disponible». Nunca se inventan equivalencias entre dimensiones.
 */
export type Presentation = {
  dimension: ComparableDimension;
  /** Total en unidad base: gramos (mass), mililitros (volume) o piezas (count). */
  totalBase: number;
  /** Para `count`: qué se cuenta (rollos, pañales, sobres…). */
  countUnit: string | null;
  /** Número de empaques multiplicado (paquete de N, N x …). 1 si no aplica. */
  packs: number;
  raw: string;
};

const MASS: Record<string, number> = { kg: 1000, kgs: 1000, kilo: 1000, kilos: 1000, kilogramo: 1000, kilogramos: 1000, g: 1, gr: 1, grs: 1, gramo: 1, gramos: 1 };
const VOLUME: Record<string, number> = { l: 1000, lt: 1000, lts: 1000, litro: 1000, litros: 1000, ml: 1, mililitro: 1, mililitros: 1 };
const COUNT_UNITS: Record<string, string> = {
  rollo: 'rollo', rollos: 'rollo',
  pieza: 'pieza', piezas: 'pieza', pza: 'pieza', pzas: 'pieza', pz: 'pieza', unidades: 'pieza', unidad: 'pieza',
  panal: 'panal', panales: 'panal',
  toallita: 'toallita', toallitas: 'toallita',
  sobre: 'sobre', sobres: 'sobre',
  capsula: 'capsula', capsulas: 'capsula',
  tableta: 'tableta', tabletas: 'tableta',
  bolsa: 'bolsa', bolsas: 'bolsa',
  hoja: 'hoja', hojas: 'hoja',
  huevo: 'pieza', huevos: 'pieza',
  lata: 'lata', latas: 'lata',
  barra: 'barra', barras: 'barra',
};

const PER_CONTAINER_UNITS = new Set(['lata', 'barra']);

const NUM = '(\\d+(?:[.,]\\d+)?)';
const MASS_UNITS = Object.keys(MASS).sort((a, b) => b.length - a.length).join('|');
const VOLUME_UNITS = Object.keys(VOLUME).sort((a, b) => b.length - a.length).join('|');
const COUNT_WORDS = Object.keys(COUNT_UNITS).sort((a, b) => b.length - a.length).join('|');

const RE_MULTI = new RegExp(`\\b(\\d+)\\s*x\\s*${NUM}\\s*(${MASS_UNITS}|${VOLUME_UNITS})\\b`, 'g');
const RE_SIZE = new RegExp(`\\b${NUM}\\s*(${MASS_UNITS}|${VOLUME_UNITS})\\b`, 'g');
const RE_COUNT = new RegExp(`\\b(\\d+)\\s*(${COUNT_WORDS})\\b`, 'g');
const RE_PACK = /\b(?:paquete|pack|caja|kit|set|bulto|display)\s+(?:de|con)\s+(\d+)\b|\b(\d+)\s*(?:pack|paquetes)\b/g;

function normalizeForPresentation(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/[^a-z0-9.,x ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** «1,000» es separador de miles; «1,5» es decimal. */
function toNumber(s: string): number {
  if (/^\d{1,3},\d{3}$/.test(s)) return Number(s.replace(',', ''));
  return Number(s.replace(',', '.'));
}

function unitDimension(unit: string): { dimension: 'mass' | 'volume'; factor: number } | null {
  if (unit in MASS) return { dimension: 'mass', factor: MASS[unit] };
  if (unit in VOLUME) return { dimension: 'volume', factor: VOLUME[unit] };
  return null;
}

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * Lee la presentación del título.
 * Orden: «N x tamaño» explícito; si no, un único tamaño (masa o volumen) o un único conteo,
 * multiplicado por «paquete de N» si aparece. Varias lecturas distintas → null.
 */
export function parsePresentation(title: string | null | undefined): Presentation | null {
  const text = normalizeForPresentation(title ?? '');
  if (!text) return null;

  const packsFound = distinct([...text.matchAll(RE_PACK)].map((m) => Number(m[1] ?? m[2])).filter((n) => n > 1));
  if (packsFound.length > 1) return null;
  const packs = packsFound[0] ?? 1;

  const multis = [...text.matchAll(RE_MULTI)];
  if (multis.length > 0) {
    const readings = distinct(
      multis.map((m) => {
        const dim = unitDimension(m[3]);
        return dim ? `${dim.dimension}:${Number(m[1]) * toNumber(m[2]) * dim.factor}` : '';
      }),
    ).filter(Boolean);
    if (readings.length !== 1) return null;
    const [dimension, total] = readings[0].split(':');
    const totalBase = Number(total);
    if (!(totalBase > 0)) return null;
    return { dimension: dimension as 'mass' | 'volume', totalBase, countUnit: null, packs: 1, raw: multis[0][0] };
  }

  const sizes = [...text.matchAll(RE_SIZE)].flatMap((m) => {
    const dim = unitDimension(m[2]);
    const base = dim ? toNumber(m[1]) * dim.factor : 0;
    return dim && base > 0 ? [{ dimension: dim.dimension, base, raw: m[0] }] : [];
  });
  const counts = [...text.matchAll(RE_COUNT)]
    .map((m) => ({ n: Number(m[1]), unit: COUNT_UNITS[m[2]], raw: m[0] }))
    .filter((c) => c.n > 0 && c.unit);

  const sizeReadings = distinct(sizes.map((s) => `${s.dimension}:${s.base}`));
  const countReadings = distinct(counts.map((c) => `${c.unit}:${c.n}`));

  if (sizeReadings.length > 1) return null;
  if (sizeReadings.length === 1) {
    const s = sizes[0];
    if (countReadings.length === 0) {
      return { dimension: s.dimension, totalBase: s.base * packs, countUnit: null, packs, raw: s.raw };
    }
    // «3 latas 140 g»: el tamaño es por envase. Con piezas genéricas no se sabe si el tamaño es total.
    if (countReadings.length > 1 || !PER_CONTAINER_UNITS.has(counts[0].unit)) return null;
    const containers = counts[0].n;
    if (packs > 1 && packs !== containers) return null;
    return { dimension: s.dimension, totalBase: s.base * containers, countUnit: null, packs: containers, raw: `${counts[0].raw} ${s.raw}` };
  }
  if (countReadings.length === 1) {
    const c = counts[0];
    return { dimension: 'count', totalBase: c.n * packs, countUnit: c.unit, packs, raw: c.raw };
  }
  return null;
}

export type UnitPrice = {
  dimension: ComparableDimension;
  /** Precio por kilogramo, por litro o por pieza. */
  value: number;
  per: 'kg' | 'l' | string;
};

/** Precio unitario normalizado. Null si falta precio o presentación, o si la dimensión no aplica a la necesidad. */
export function unitPriceFor(
  price: number | null | undefined,
  presentation: Presentation | null,
  allowed: readonly ComparableDimension[],
): UnitPrice | null {
  if (!presentation || price == null || !(price > 0)) return null;
  if (!allowed.includes(presentation.dimension)) return null;
  if (presentation.dimension === 'mass') {
    return { dimension: 'mass', value: round2((price / presentation.totalBase) * 1000), per: 'kg' };
  }
  if (presentation.dimension === 'volume') {
    return { dimension: 'volume', value: round2((price / presentation.totalBase) * 1000), per: 'l' };
  }
  return { dimension: 'count', value: round2(price / presentation.totalBase), per: presentation.countUnit ?? 'pieza' };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type UnitPriceComparison =
  | { comparable: true; cheaper: 'a' | 'b' | 'equal'; ratio: number }
  | {
      comparable: false;
      reason:
        | 'missing_unit_price'
        | 'different_need'
        | 'unknown_variant'
        | 'different_variant'
        | 'different_dimension'
        | 'different_count_unit';
    };

type Comparable = { needId: string | null; variantId?: string | null; unitPrice: UnitPrice | null };

/**
 * Solo compara misma necesidad, misma variante (si la necesidad las declara), misma dimensión
 * y, si se cuentan piezas, la misma pieza. Una variante no identificada no se compara.
 */
export function compareUnitPrices(a: Comparable, b: Comparable): UnitPriceComparison {
  if (!a.unitPrice || !b.unitPrice) return { comparable: false, reason: 'missing_unit_price' };
  if (!a.needId || a.needId !== b.needId) return { comparable: false, reason: 'different_need' };
  if (despensaNeedById(a.needId)?.variants?.length) {
    if (!a.variantId || !b.variantId) return { comparable: false, reason: 'unknown_variant' };
    if (a.variantId !== b.variantId) return { comparable: false, reason: 'different_variant' };
  }
  if (a.unitPrice.dimension !== b.unitPrice.dimension) return { comparable: false, reason: 'different_dimension' };
  if (a.unitPrice.per !== b.unitPrice.per) return { comparable: false, reason: 'different_count_unit' };
  const ratio = round2(a.unitPrice.value / b.unitPrice.value);
  return { comparable: true, cheaper: ratio < 1 ? 'a' : ratio > 1 ? 'b' : 'equal', ratio };
}
