import { despensaNeedById } from '@/lib/despensa/catalog';
import { readProduct } from '@/lib/offers/priceObservations/identity';

/**
 * Referencias de precio publicadas por Profeco («Quién es Quién en los Precios», datos abiertos).
 *
 * Es otra clase de dato que las observaciones de Aventa:
 * - lo publica un tercero, con retraso (~2 meses) y por establecimiento físico;
 * - no se observa en una oferta ni en una tienda en línea;
 * - se etiqueta siempre como «Referencia publicada por Profeco (QQP)» con su fecha.
 * Nunca es una captura de Aventa, nunca entra en el historial de observaciones y nunca es ahorro verificado.
 */

export const PROFECO_QQP = {
  sourceId: 'profeco_qqp',
  datasetId: 'programa_quien_es_quien_precios_2026',
  datasetUrl: 'https://www.datos.gob.mx/dataset/programa_quien_es_quien_precios_2026',
  packageApiUrl: 'https://www.datos.gob.mx/api/3/action/package_show?id=programa_quien_es_quien_precios_2026',
  resourceHost: 'repodatos.atdt.gob.mx',
  license: 'CC-BY-4.0',
  attribution: 'Fuente: Profeco, «Quién es Quién en los Precios», datos.gob.mx (CC BY 4.0).',
  parserVersion: 'profeco-qqp-v1',
} as const;

export const PROFECO_QQP_HEADER = [
  'producto',
  'presentacion',
  'marca',
  'categoria',
  'catalogo',
  'precio',
  'fecha_registro',
  'cadena_comercial',
  'giro',
  'nombre_comercial',
  'direccion',
  'estado',
  'municipio',
  'latitud',
  'longitud',
] as const;

const COL = Object.fromEntries(PROFECO_QQP_HEADER.map((c, i) => [c, i])) as Record<(typeof PROFECO_QQP_HEADER)[number], number>;

/** Productos de Profeco que corresponden sin ambigüedad a una necesidad del catálogo. El resto se rechaza. */
const PRODUCT_MAP: Record<string, { needId: string; base: string }> = {
  arroz: { needId: 'alimentos.arroz', base: 'arroz' },
  frijol: { needId: 'alimentos.frijol', base: 'frijol' },
  huevo: { needId: 'alimentos.huevo', base: 'huevo' },
  'leche pasteurizada': { needId: 'alimentos.leche', base: 'leche' },
  'leche ultrapasteurizada': { needId: 'alimentos.leche', base: 'leche' },
  'leche en polvo': { needId: 'alimentos.leche', base: 'leche en polvo' },
  aceite: { needId: 'alimentos.aceite', base: 'aceite' },
  azucar: { needId: 'alimentos.azucar', base: 'azucar' },
  'tortilla de maiz': { needId: 'alimentos.maiz_harina', base: 'tortilla de maiz' },
  atun: { needId: 'alimentos.atun_enlatados', base: 'atun' },
  'papel higienico': { needId: 'higiene.papel_higienico', base: 'papel higienico' },
  'pasta para sopa': { needId: 'alimentos.pasta', base: 'pasta para sopa' },
};

const CONTAINER_WORDS = new Set(['bolsa', 'caja', 'botella', 'paquete', 'lata', 'plastico', 'frasco', 'granel', 'envase', 'tetrapak', 'sobre', 'carton', 'pieza']);

const MAX_PRICE = 100_000;

export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Una línea CSV (RFC 4180, sin saltos dentro de comillas). `null` si las comillas no cierran. */
export function parseCsvLine(line: string): string[] | null {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"' && cur === '') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (quoted) return null;
  out.push(cur);
  return out;
}

export type HeaderCheck = { ok: true } | { ok: false; expected: readonly string[]; received: string[] };

export function checkProfecoHeader(line: string): HeaderCheck {
  const received = (parseCsvLine(line.replace(/^\uFEFF/, '').replace(/\r$/, '')) ?? []).map((c) => c.trim());
  const ok = received.length === PROFECO_QQP_HEADER.length && PROFECO_QQP_HEADER.every((c, i) => received[i] === c);
  return ok ? { ok: true } : { ok: false, expected: PROFECO_QQP_HEADER, received };
}

/** Periodo del recurso a partir de su nombre (`b07_2026_q1.csv` → julio 2026, primera parte). */
export function resourcePeriod(urlOrName: string): { year: number; month: number; part: number } | null {
  const m = /b(\d{2})_(\d{4})_q(\d)\.csv/i.exec(urlOrName);
  if (!m) return null;
  const month = Number(m[1]);
  if (month < 1 || month > 12) return null;
  return { year: Number(m[2]), month, part: Number(m[3]) };
}

export type ProfecoRejectReason =
  | 'malformed_row'
  | 'column_count'
  | 'not_in_catalog_map'
  | 'invalid_price'
  | 'invalid_date'
  | 'date_outside_period'
  | 'presentation_unreadable'
  | 'identity_ambiguous'
  | 'missing_location';

export type ProfecoRow = {
  needId: string;
  variantId: string | null;
  presentationKey: string;
  brand: string | null;
  productText: string;
  chainKey: string;
  chainLabel: string;
  establishmentKey: string;
  estado: string;
  municipio: string;
  price: number;
  date: string;
};

function sizeOf(presentacion: string): { text: string; rest: string } | null {
  const p = fold(presentacion);
  const mass = /(\d+(?:\.\d+)?)\s*(kg|kgs|gr|grs|g|lt|lts|l|ml)\b\.?/.exec(p);
  if (mass) {
    const unit = { kg: 'kg', kgs: 'kg', gr: 'g', grs: 'g', g: 'g', lt: 'l', lts: 'l', l: 'l', ml: 'ml' }[mass[2]]!;
    return { text: `${mass[1]} ${unit}`, rest: p.replace(mass[0], ' ') };
  }
  const box = /c\/\s*(\d+)/.exec(p);
  if (box) return { text: `${box[1]} piezas`, rest: p.replace(box[0], ' ') };
  const count = /(\d+)\s*(rollos|piezas|pzas)\b\.?/.exec(p);
  if (count) return { text: `${count[1]} ${count[2] === 'rollos' ? 'rollos' : 'piezas'}`, rest: p.replace(count[0], ' ') };
  return null;
}

function slug(s: string): string {
  return fold(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/**
 * Normaliza una fila. Lee variante y presentación con el mismo lector que las observaciones de
 * Aventa (`readProduct`) sobre «base + descriptores + tamaño». La necesidad la fija `PRODUCT_MAP`;
 * si el lector ve otra necesidad, la fila es ambigua y se rechaza.
 */
export function normalizeProfecoRow(
  fields: readonly string[] | null,
  period: { year: number; month: number } | null,
): { ok: true; row: ProfecoRow } | { ok: false; reason: ProfecoRejectReason } {
  if (!fields) return { ok: false, reason: 'malformed_row' };
  if (fields.length !== PROFECO_QQP_HEADER.length) return { ok: false, reason: 'column_count' };
  const get = (c: keyof typeof COL) => (fields[COL[c]] ?? '').trim();

  const mapped = PRODUCT_MAP[fold(get('producto'))];
  if (!mapped) return { ok: false, reason: 'not_in_catalog_map' };

  const price = Number(get('precio'));
  if (!Number.isFinite(price) || price <= 0 || price > MAX_PRICE) return { ok: false, reason: 'invalid_price' };

  const date = get('fecha_registro');
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!d || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return { ok: false, reason: 'invalid_date' };
  if (period && (Number(d[1]) !== period.year || Number(d[2]) !== period.month)) return { ok: false, reason: 'date_outside_period' };

  const estado = get('estado');
  const municipio = get('municipio');
  const chainLabel = get('cadena_comercial');
  if (!estado || !municipio || !chainLabel) return { ok: false, reason: 'missing_location' };

  const size = sizeOf(get('presentacion'));
  if (!size) return { ok: false, reason: 'presentation_unreadable' };
  const descriptors = size.rest
    .split(/[.,()]/)
    .flatMap((part) => part.trim().split(' '))
    .filter((w) => w && !CONTAINER_WORDS.has(w))
    .join(' ');
  const text = `${mapped.base} ${descriptors} ${size.text}`.replace(/\s+/g, ' ').trim();
  const reading = readProduct(text);
  if (!reading.presentationKey) return { ok: false, reason: 'presentation_unreadable' };
  if (reading.needId && reading.needId !== mapped.needId) return { ok: false, reason: 'identity_ambiguous' };

  const brandRaw = get('marca');
  const brand = brandRaw && fold(brandRaw) !== 's/m' ? brandRaw : null;
  return {
    ok: true,
    row: {
      needId: mapped.needId,
      variantId: reading.needId === mapped.needId ? reading.variantId : null,
      presentationKey: reading.presentationKey,
      brand,
      productText: `${get('producto')} ${get('presentacion')}`.trim(),
      chainKey: slug(chainLabel),
      chainLabel,
      establishmentKey: slug(`${get('nombre_comercial')} ${get('direccion')}`),
      estado,
      municipio,
      price: Math.round(price * 100) / 100,
      date,
    },
  };
}

export type ResourceRevision = {
  /** URL del recurso CSV en el repositorio oficial. */
  url: string;
  /** `last_modified` del recurso en CKAN; identifica la revisión publicada. */
  lastModified: string;
};

export type ProfecoReference = {
  source: typeof PROFECO_QQP.sourceId;
  referenceKey: string;
  needId: string;
  variantId: string | null;
  presentationKey: string;
  brand: string | null;
  chainKey: string;
  chainLabel: string;
  estado: string;
  municipio: string;
  periodStart: string;
  periodEnd: string;
  currency: 'MXN';
  minPrice: number;
  medianPrice: number;
  maxPrice: number;
  /** Registros distintos (establecimiento + día); los duplicados entre catálogos cuentan una vez. */
  observations: number;
  establishments: number;
  productSample: string;
  sourceResourceUrl: string;
  sourceRevision: string;
  parserVersion: string;
  license: string;
  idempotencyKey: string;
};

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return Math.round((s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2) * 100) / 100;
}

/**
 * Agrega filas por producto comparable, marca, cadena, estado y municipio. Determinista: el mismo
 * recurso y revisión producen las mismas referencias y llaves, en el mismo orden.
 */
export class ProfecoAggregator {
  private groups = new Map<string, { row: ProfecoRow; seen: Map<string, number>; establishments: Set<string>; from: string; to: string }>();

  constructor(private readonly revision: ResourceRevision) {}

  add(row: ProfecoRow): void {
    const key = [row.needId, row.variantId ?? '-', row.presentationKey, row.brand ? slug(row.brand) : '-', row.chainKey, slug(row.estado), slug(row.municipio)].join('|');
    let g = this.groups.get(key);
    if (!g) {
      g = { row, seen: new Map(), establishments: new Set(), from: row.date, to: row.date };
      this.groups.set(key, g);
    }
    const visit = `${row.establishmentKey}|${row.date}`;
    if (!g.seen.has(visit)) g.seen.set(visit, row.price);
    g.establishments.add(row.establishmentKey);
    if (row.date < g.from) g.from = row.date;
    if (row.date > g.to) g.to = row.date;
  }

  references(): ProfecoReference[] {
    const resource = this.revision.url.split('/').pop() ?? this.revision.url;
    return [...this.groups.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([referenceKey, g]) => {
        const prices = [...g.seen.values()];
        return {
          source: PROFECO_QQP.sourceId,
          referenceKey,
          needId: g.row.needId,
          variantId: g.row.variantId,
          presentationKey: g.row.presentationKey,
          brand: g.row.brand,
          chainKey: g.row.chainKey,
          chainLabel: g.row.chainLabel,
          estado: g.row.estado,
          municipio: g.row.municipio,
          periodStart: g.from,
          periodEnd: g.to,
          currency: 'MXN' as const,
          minPrice: Math.min(...prices),
          medianPrice: median(prices),
          maxPrice: Math.max(...prices),
          observations: prices.length,
          establishments: g.establishments.size,
          productSample: g.row.productText,
          sourceResourceUrl: this.revision.url,
          sourceRevision: this.revision.lastModified,
          parserVersion: PROFECO_QQP.parserVersion,
          license: PROFECO_QQP.license,
          idempotencyKey: [PROFECO_QQP.parserVersion, resource, this.revision.lastModified, referenceKey].join('|'),
        };
      });
  }
}

export type ProfecoImportReport = {
  header: HeaderCheck;
  rows: number;
  accepted: number;
  rejected: Partial<Record<ProfecoRejectReason, number>>;
  references: ProfecoReference[];
};

/** Procesa líneas de un recurso (la primera es el encabezado). Sin red ni base de datos. */
export async function importProfecoLines(lines: AsyncIterable<string> | Iterable<string>, revision: ResourceRevision): Promise<ProfecoImportReport> {
  const period = resourcePeriod(revision.url);
  const agg = new ProfecoAggregator(revision);
  const report: ProfecoImportReport = { header: { ok: false, expected: PROFECO_QQP_HEADER, received: [] }, rows: 0, accepted: 0, rejected: {}, references: [] };
  let first = true;
  for await (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (first) {
      first = false;
      report.header = checkProfecoHeader(line);
      if (!report.header.ok) return report;
      continue;
    }
    if (!line.trim()) continue;
    report.rows += 1;
    const res = normalizeProfecoRow(parseCsvLine(line), period);
    if (!res.ok) {
      report.rejected[res.reason] = (report.rejected[res.reason] ?? 0) + 1;
      continue;
    }
    report.accepted += 1;
    agg.add(res.row);
  }
  report.references = agg.references();
  return report;
}

const LABEL_DATE = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const LABEL_MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** Etiqueta pública. Siempre dice de quién es el dato y de cuándo; nunca habla de ahorro. */
export function profecoReferenceLabel(ref: Pick<ProfecoReference, 'medianPrice' | 'periodEnd' | 'chainLabel' | 'municipio' | 'estado'>): string {
  const date = LABEL_DATE.format(new Date(`${ref.periodEnd}T00:00:00Z`));
  return `Referencia publicada por Profeco (QQP), ${date}: ${LABEL_MXN.format(ref.medianPrice)} en ${ref.chainLabel}, ${ref.municipio}, ${ref.estado}.`;
}

/**
 * Referencias comparables con una oferta: misma necesidad, variante y presentación leídas del
 * título, y el título nombra la marca de la referencia. Referencias sin marca («S/M»), o sin
 * variante legible cuando la necesidad tiene variantes, no se comparan: no hay forma de saber
 * que es el mismo producto.
 */
export function matchProfecoReferences<T extends Pick<ProfecoReference, 'needId' | 'variantId' | 'presentationKey' | 'brand'>>(
  offerTitle: string,
  refs: readonly T[],
): T[] {
  const r = readProduct(offerTitle);
  if (!r.needId || !r.presentationKey) return [];
  const title = fold(offerTitle);
  const needsVariant = (despensaNeedById(r.needId)?.variants?.length ?? 0) > 0;
  return refs.filter(
    (ref) =>
      ref.needId === r.needId &&
      (ref.variantId != null || !needsVariant) &&
      ref.variantId === r.variantId &&
      ref.presentationKey === r.presentationKey &&
      ref.brand != null &&
      title.includes(fold(ref.brand.split('.')[0])),
  );
}
