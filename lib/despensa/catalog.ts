import type { CategoryId } from '@/lib/categories';

/**
 * Catálogo de necesidades de Despensa.
 *
 * Es una clasificación de consumo construida por Aventa. Las necesidades marcadas
 * `official_list` citan una lista publicada (ver `DESPENSA_OFFICIAL_REFERENCES`); de esa
 * lista solo se toma qué productos la integran y su presentación de referencia, nunca
 * precios, costos meta ni cifras de gasto.
 *
 * Reglas de mantenimiento:
 * - `id` es estable: no se renombra ni se reutiliza. Para retirar una necesidad, cambia `status`.
 * - Los ids de variante también son estables dentro de su necesidad.
 * - Cualquier cambio de sinónimos, variantes, exclusiones o entradas sube `DESPENSA_CATALOG_VERSION`.
 * - Los sinónimos se escriben ya normalizados (minúsculas, sin acentos, sin signos) y se
 *   comparan como frases completas contra el título normalizado.
 * - Dos ofertas solo se comparan por precio unitario si son la misma necesidad y, cuando la
 *   necesidad declara variantes, la misma variante. Las sustituciones aproximadas viven aparte
 *   (`substitutes`) y nunca se usan para decir que algo es más barato.
 */
export const DESPENSA_CATALOG_VERSION = '2026-10-13.2';

export const DESPENSA_FAMILIES = [
  'alimentacion_basica',
  'limpieza_hogar',
  'higiene_personal',
  'familia_bebes',
  'mascotas',
] as const;
export type DespensaFamilyId = (typeof DESPENSA_FAMILIES)[number];

export const DESPENSA_FAMILY_LABELS: Record<DespensaFamilyId, string> = {
  alimentacion_basica: 'Alimentación básica',
  limpieza_hogar: 'Limpieza del hogar',
  higiene_personal: 'Higiene personal',
  familia_bebes: 'Familia y bebés',
  mascotas: 'Mascotas',
};

/**
 * Origen de una lista de referencia.
 * - `official_list`: aparece en una referencia de `DESPENSA_OFFICIAL_REFERENCES`.
 * - `aventa_category`: categoría de consumo definida por Aventa.
 * - `household_profile`: perfil configurable de compra doméstica (aún no existe).
 * - `hypothesis`: idea de producto pendiente de validar; no clasifica ofertas.
 */
export type DespensaReferenceBasis = 'official_list' | 'aventa_category' | 'household_profile' | 'hypothesis';

/**
 * Tipo de producto según Aventa. No describe a quien compra ni su situación económica.
 * - `esencial`: alimento o higiene básica; incluye todo lo que cita una lista oficial.
 * - `cotidiano`: compra recurrente del hogar.
 * - `discrecional`: recurrente pero prescindible.
 */
export type DespensaProductKind = 'esencial' | 'cotidiano' | 'discrecional';

/** Dimensión con la que una presentación puede compararse. */
export type ComparableDimension = 'mass' | 'volume' | 'count';

export type DespensaOfficialReference = {
  id: string;
  publisher: string;
  title: string;
  url: string;
  /** Fecha en que Aventa leyó la publicación. No es la fecha de los precios. */
  verifiedAt: string;
  /** Productos tal como los publica la fuente, con la necesidad y variante a la que se asignan. */
  items: readonly { label: string; presentation: string; needId: string; variantId: string | null }[];
  limitations: readonly string[];
};

export const DESPENSA_OFFICIAL_REFERENCES: readonly DespensaOfficialReference[] = [
  {
    id: 'profeco_pacic_24',
    publisher: 'Profeco',
    title: 'Quién es Quién en los Precios — Canasta de 24 productos (PACIC)',
    url: 'https://qqph.profeco.gob.mx/storage/attachment/primeran/2026/QQPPRIMERAN_090726.pdf',
    verifiedAt: '2026-10-12',
    items: [
      { label: 'Aceite vegetal comestible', presentation: '1 botella 946 ml', needId: 'alimentos.aceite', variantId: 'vegetal' },
      { label: 'Arroz en grano', presentation: '1 kg', needId: 'alimentos.arroz', variantId: 'blanco' },
      { label: 'Atún en hojuela (máx. 5% soya)', presentation: '2 latas de 140 g', needId: 'alimentos.atun_enlatados', variantId: null },
      { label: 'Azúcar estándar', presentation: '1 kg', needId: 'alimentos.azucar', variantId: 'estandar' },
      { label: 'Carne de res', presentation: '1 kg', needId: 'alimentos.res', variantId: null },
      { label: 'Cebolla blanca', presentation: '1 kg', needId: 'alimentos.verduras', variantId: 'cebolla' },
      { label: 'Chile jalapeño', presentation: '1 kg', needId: 'alimentos.verduras', variantId: 'chile_jalapeno' },
      { label: 'Carne de cerdo', presentation: '1 kg', needId: 'alimentos.cerdo', variantId: null },
      { label: 'Frijol negro', presentation: '1 paquete de 900 g', needId: 'alimentos.frijol', variantId: 'negro' },
      { label: 'Huevo de gallina', presentation: '1 paquete de 18 piezas', needId: 'alimentos.huevo', variantId: null },
      { label: 'Jabón de tocador', presentation: '1 pieza', needId: 'higiene.jabon', variantId: 'barra' },
      { label: 'Jitomate saladet', presentation: '1 kg', needId: 'alimentos.verduras', variantId: 'jitomate' },
      { label: 'Leche de vaca', presentation: '5 piezas de 1 L c/u', needId: 'alimentos.leche', variantId: null },
      { label: 'Limón', presentation: '1 kg', needId: 'alimentos.frutas', variantId: 'limon' },
      { label: 'Manzana', presentation: '1 kg', needId: 'alimentos.frutas', variantId: 'manzana' },
      { label: 'Plátano', presentation: '1 kg', needId: 'alimentos.frutas', variantId: 'platano' },
      { label: 'Pan blanco de caja', presentation: '1 paquete grande de 680 g', needId: 'alimentos.pan', variantId: 'caja_blanco' },
      { label: 'Papa blanca', presentation: '1 kg', needId: 'alimentos.verduras', variantId: 'papa' },
      { label: 'Papel higiénico', presentation: '1 bolsa de 4 piezas', needId: 'higiene.papel_higienico', variantId: null },
      { label: 'Pasta para sopa', presentation: '1 paquete 220 g', needId: 'alimentos.pasta', variantId: 'sopa' },
      { label: 'Carne de pollo', presentation: '1 kg', needId: 'alimentos.pollo', variantId: null },
      { label: 'Sardina en tomate en lata', presentation: '1 lata de 425 g', needId: 'alimentos.atun_enlatados', variantId: 'sardina' },
      { label: 'Tortilla de maíz de supermercado', presentation: '4 kg', needId: 'alimentos.maiz_harina', variantId: 'tortilla_maiz' },
      { label: 'Zanahoria', presentation: '1 kg', needId: 'alimentos.verduras', variantId: 'zanahoria' },
    ],
    limitations: [
      'La canasta está pensada para el consumo semanal de un hogar de referencia; no describe lo que necesita una persona concreta.',
      'Aventa no usa el costo meta de la canasta como precio de referencia ni como umbral de ranking.',
    ],
  },
];

export type DespensaVariant = {
  /** Estable dentro de la necesidad. */
  id: string;
  label: string;
  /** Frases normalizadas que identifican la variante. Cada una también debe clasificar la necesidad. */
  synonyms: readonly string[];
  /** Sustituye la dimensión de la necesidad cuando la variante se mide distinto (p. ej. leche en polvo). */
  comparableBy?: readonly ComparableDimension[];
};

/** Sustitución aproximada: no es equivalencia y nunca alimenta una comparación de precio. */
export type DespensaSubstitute = {
  fromVariantId: string | null;
  toNeedId: string;
  toVariantId: string | null;
  note: string;
};

export type DespensaNeed = {
  id: string;
  family: DespensaFamilyId;
  subcategory: string;
  label: string;
  kind: DespensaProductKind;
  synonyms: readonly string[];
  /** Frases que, si aparecen, descartan esta necesidad (p. ej. «arena» decorativa). */
  excludes?: readonly string[];
  /** Dimensiones válidas para precio unitario. Vacío: no se compara por unidad. */
  comparableBy: readonly ComparableDimension[];
  /**
   * Variantes no intercambiables. Si existen, el precio unitario solo se compara entre
   * ofertas con la misma variante identificada.
   */
  variants?: readonly DespensaVariant[];
  substitutes?: readonly DespensaSubstitute[];
  basis: DespensaReferenceBasis;
  officialRefs?: readonly string[];
  /** `active` clasifica ofertas; `hypothesis` y `retired` quedan documentadas pero no clasifican. */
  status: 'active' | 'hypothesis' | 'retired';
  /** Categorías de `lib/categories.ts` donde se espera encontrar la necesidad. */
  expectedCategories: readonly CategoryId[];
};

type NeedInput = Omit<DespensaNeed, 'basis' | 'status' | 'kind'> &
  Partial<Pick<DespensaNeed, 'basis' | 'status' | 'kind'>>;

const need = (n: NeedInput): DespensaNeed => ({
  basis: n.officialRefs?.length ? 'official_list' : 'aventa_category',
  status: 'active',
  kind: 'cotidiano',
  ...n,
});

const PACIC = ['profeco_pacic_24'] as const;
const OIL_SWAP = 'Aceites de distinta semilla: composición y uso distintos; no es la misma oferta.';

export const DESPENSA_NEEDS: readonly DespensaNeed[] = [
  // Alimentación básica
  need({
    id: 'alimentos.arroz', family: 'alimentacion_basica', subcategory: 'Granos y legumbres', label: 'Arroz', kind: 'esencial',
    synonyms: ['arroz'], excludes: ['arrocera', 'galletas de arroz', 'leche de arroz', 'arroz con leche'], comparableBy: ['mass'],
    variants: [
      { id: 'blanco', label: 'Arroz blanco', synonyms: ['arroz blanco', 'arroz en grano', 'arroz super extra', 'arroz grano largo'] },
      { id: 'integral', label: 'Arroz integral', synonyms: ['arroz integral'] },
    ],
    officialRefs: PACIC, expectedCategories: ['supermercado'],
  }),
  need({
    id: 'alimentos.frijol', family: 'alimentacion_basica', subcategory: 'Granos y legumbres', label: 'Frijol', kind: 'esencial',
    synonyms: ['frijol', 'frijoles'], comparableBy: ['mass'],
    variants: [
      { id: 'negro', label: 'Frijol negro', synonyms: ['frijol negro', 'frijoles negros'] },
      { id: 'pinto', label: 'Frijol pinto', synonyms: ['frijol pinto'] },
      { id: 'bayo', label: 'Frijol bayo', synonyms: ['frijol bayo'] },
      { id: 'peruano', label: 'Frijol peruano', synonyms: ['frijol peruano'] },
      { id: 'refrito', label: 'Frijoles refritos', synonyms: ['frijoles refritos', 'frijol refrito'] },
    ],
    substitutes: [{ fromVariantId: 'negro', toNeedId: 'alimentos.frijol', toVariantId: 'pinto', note: 'Otra variedad de frijol; sabor y cocción distintos.' }],
    officialRefs: PACIC, expectedCategories: ['supermercado'],
  }),
  need({ id: 'alimentos.legumbres', family: 'alimentacion_basica', subcategory: 'Granos y legumbres', label: 'Lentejas y otras legumbres', kind: 'esencial', synonyms: ['lenteja', 'lentejas', 'garbanzo', 'garbanzos', 'haba seca', 'habas secas'], comparableBy: ['mass'],
    variants: [
      { id: 'lenteja', label: 'Lenteja', synonyms: ['lenteja', 'lentejas'] },
      { id: 'garbanzo', label: 'Garbanzo', synonyms: ['garbanzo', 'garbanzos'] },
      { id: 'haba', label: 'Haba seca', synonyms: ['haba seca', 'habas secas'] },
    ],
    expectedCategories: ['supermercado'] }),
  need({
    id: 'alimentos.maiz_harina', family: 'alimentacion_basica', subcategory: 'Tortillas y harinas', label: 'Maíz, harina y tortillas', kind: 'esencial',
    synonyms: ['harina de maiz', 'harina de trigo', 'harina', 'tortillas', 'tortilla', 'maiz pozolero', 'tortilla de maiz', 'tortillas de maiz', 'tortilla de harina', 'tortillas de harina'],
    excludes: ['harina de proteina', 'tortillero', 'tortilladora'], comparableBy: ['mass', 'count'],
    variants: [
      { id: 'harina_maiz', label: 'Harina de maíz', synonyms: ['harina de maiz'], comparableBy: ['mass'] },
      { id: 'harina_trigo', label: 'Harina de trigo', synonyms: ['harina de trigo'], comparableBy: ['mass'] },
      { id: 'tortilla_maiz', label: 'Tortilla de maíz', synonyms: ['tortilla de maiz', 'tortillas de maiz'] },
      { id: 'tortilla_harina', label: 'Tortilla de harina', synonyms: ['tortilla de harina', 'tortillas de harina'] },
      { id: 'maiz_pozolero', label: 'Maíz pozolero', synonyms: ['maiz pozolero'], comparableBy: ['mass'] },
    ],
    officialRefs: PACIC, expectedCategories: ['supermercado'],
  }),
  need({
    id: 'alimentos.aceite', family: 'alimentacion_basica', subcategory: 'Abarrotes', label: 'Aceite comestible', kind: 'esencial',
    synonyms: ['aceite vegetal', 'aceite de canola', 'aceite de girasol', 'aceite de maiz', 'aceite de oliva', 'aceite comestible', 'aceite de soya'],
    excludes: ['aceite para motor', 'aceite esencial', 'aceite corporal', 'aceite para bebe'], comparableBy: ['volume'],
    variants: [
      { id: 'vegetal', label: 'Aceite vegetal comestible', synonyms: ['aceite vegetal', 'aceite comestible'] },
      { id: 'canola', label: 'Aceite de canola', synonyms: ['aceite de canola'] },
      { id: 'girasol', label: 'Aceite de girasol', synonyms: ['aceite de girasol'] },
      { id: 'maiz', label: 'Aceite de maíz', synonyms: ['aceite de maiz'] },
      { id: 'soya', label: 'Aceite de soya', synonyms: ['aceite de soya'] },
      { id: 'oliva', label: 'Aceite de oliva', synonyms: ['aceite de oliva'] },
    ],
    substitutes: [
      { fromVariantId: 'vegetal', toNeedId: 'alimentos.aceite', toVariantId: 'canola', note: OIL_SWAP },
      { fromVariantId: 'vegetal', toNeedId: 'alimentos.aceite', toVariantId: 'girasol', note: OIL_SWAP },
      { fromVariantId: 'vegetal', toNeedId: 'alimentos.aceite', toVariantId: 'maiz', note: OIL_SWAP },
    ],
    officialRefs: PACIC, expectedCategories: ['supermercado'],
  }),
  need({
    id: 'alimentos.azucar', family: 'alimentacion_basica', subcategory: 'Abarrotes', label: 'Azúcar', kind: 'esencial',
    synonyms: ['azucar'], excludes: ['sin azucar', 'libre de azucar', 'cero azucar'], comparableBy: ['mass'],
    variants: [
      { id: 'estandar', label: 'Azúcar estándar', synonyms: ['azucar estandar'] },
      { id: 'refinada', label: 'Azúcar refinada', synonyms: ['azucar refinada'] },
      { id: 'mascabado', label: 'Azúcar mascabado o morena', synonyms: ['azucar mascabado', 'azucar morena'] },
    ],
    officialRefs: PACIC, expectedCategories: ['supermercado'],
  }),
  need({ id: 'alimentos.sal_condimentos', family: 'alimentacion_basica', subcategory: 'Abarrotes', label: 'Sal y condimentos esenciales', synonyms: ['sal de mesa', 'sal yodada', 'consome de pollo', 'pimienta molida', 'consome'], comparableBy: ['mass'], expectedCategories: ['supermercado'] }),
  need({
    id: 'alimentos.leche', family: 'alimentacion_basica', subcategory: 'Lácteos y huevo', label: 'Leche', kind: 'esencial',
    synonyms: ['leche entera', 'leche deslactosada', 'leche semidescremada', 'leche descremada', 'leche en polvo', 'leche ultrapasteurizada', 'leche'],
    excludes: ['leche corporal', 'crema corporal', 'leche limpiadora', 'leche de arroz', 'leche condensada', 'leche evaporada', 'dulce de leche', 'con leche'], comparableBy: ['volume', 'mass'],
    variants: [
      { id: 'entera', label: 'Leche entera', synonyms: ['leche entera'], comparableBy: ['volume'] },
      { id: 'deslactosada', label: 'Leche deslactosada', synonyms: ['leche deslactosada'], comparableBy: ['volume'] },
      { id: 'semidescremada', label: 'Leche semidescremada', synonyms: ['leche semidescremada'], comparableBy: ['volume'] },
      { id: 'descremada', label: 'Leche descremada', synonyms: ['leche descremada'], comparableBy: ['volume'] },
      { id: 'polvo', label: 'Leche en polvo', synonyms: ['leche en polvo'], comparableBy: ['mass'] },
    ],
    officialRefs: PACIC, expectedCategories: ['supermercado', 'bebes'],
  }),
  need({ id: 'alimentos.huevo', family: 'alimentacion_basica', subcategory: 'Lácteos y huevo', label: 'Huevo', kind: 'esencial', synonyms: ['huevo', 'huevos'], excludes: ['huevo de pascua', 'huevo sorpresa', 'huevera'], comparableBy: ['count'], officialRefs: PACIC, expectedCategories: ['supermercado'] }),
  need({
    id: 'alimentos.pasta', family: 'alimentacion_basica', subcategory: 'Abarrotes', label: 'Pasta', kind: 'esencial',
    synonyms: ['pasta para sopa', 'sopa de pasta', 'spaghetti', 'espagueti', 'fideo', 'fideos', 'codito', 'coditos', 'macarron'],
    excludes: ['pasta dental', 'pasta de dientes'], comparableBy: ['mass'],
    variants: [
      { id: 'sopa', label: 'Pasta para sopa', synonyms: ['pasta para sopa', 'sopa de pasta', 'fideo', 'fideos', 'codito', 'coditos'] },
      { id: 'larga', label: 'Spaghetti', synonyms: ['spaghetti', 'espagueti'] },
      { id: 'macarron', label: 'Macarrón', synonyms: ['macarron'] },
    ],
    officialRefs: PACIC, expectedCategories: ['supermercado'],
  }),
  need({ id: 'alimentos.avena_cereal', family: 'alimentacion_basica', subcategory: 'Desayuno', label: 'Avena y cereales', synonyms: ['avena', 'cereal', 'hojuelas de maiz', 'granola'], excludes: ['jabon de avena', 'crema de avena', 'shampoo de avena', 'barra de cereal'], comparableBy: ['mass'],
    variants: [
      { id: 'avena', label: 'Avena', synonyms: ['avena'] },
      { id: 'cereal', label: 'Cereal de caja', synonyms: ['cereal', 'hojuelas de maiz'] },
      { id: 'granola', label: 'Granola', synonyms: ['granola'] },
    ],
    expectedCategories: ['supermercado'] }),
  need({
    id: 'alimentos.atun_enlatados', family: 'alimentacion_basica', subcategory: 'Enlatados', label: 'Atún, sardina y enlatados básicos', kind: 'esencial',
    synonyms: ['atun', 'sardina', 'sardinas', 'chiles en lata', 'chile chipotle', 'chiles jalapenos', 'pure de tomate', 'pure tomate', 'atun en agua', 'atun en aceite'],
    comparableBy: ['mass', 'count'],
    variants: [
      { id: 'atun_agua', label: 'Atún en agua', synonyms: ['atun en agua'] },
      { id: 'atun_aceite', label: 'Atún en aceite', synonyms: ['atun en aceite'] },
      { id: 'sardina', label: 'Sardina', synonyms: ['sardina', 'sardinas'] },
      { id: 'chiles', label: 'Chiles en lata', synonyms: ['chiles en lata', 'chile chipotle', 'chiles jalapenos'] },
      { id: 'pure_tomate', label: 'Puré de tomate', synonyms: ['pure de tomate', 'pure tomate'] },
    ],
    substitutes: [{ fromVariantId: 'atun_agua', toNeedId: 'alimentos.atun_enlatados', toVariantId: 'atun_aceite', note: 'Mismo pescado, distinto líquido de cobertura y peso drenado.' }],
    officialRefs: PACIC, expectedCategories: ['supermercado'],
  }),
  need({ id: 'alimentos.cafe_te', family: 'alimentacion_basica', subcategory: 'Bebidas', label: 'Café y té', synonyms: ['cafe soluble', 'cafe molido', 'cafe en grano', 'cafe de grano', 'tostado y molido', 'te de', 'te verde', 'te negro'], excludes: ['cafetera', 'molino de cafe'], comparableBy: ['mass', 'count'],
    variants: [
      { id: 'soluble', label: 'Café soluble', synonyms: ['cafe soluble'], comparableBy: ['mass'] },
      { id: 'molido', label: 'Café molido', synonyms: ['cafe molido', 'tostado y molido'], comparableBy: ['mass'] },
      { id: 'grano', label: 'Café en grano', synonyms: ['cafe en grano', 'cafe de grano'], comparableBy: ['mass'] },
      { id: 'te', label: 'Té', synonyms: ['te de', 'te verde', 'te negro'] },
    ],
    expectedCategories: ['supermercado'] }),
  need({
    id: 'alimentos.pollo', family: 'alimentacion_basica', subcategory: 'Carnes', label: 'Pollo', kind: 'esencial',
    synonyms: ['pollo entero', 'pechuga de pollo', 'pierna de pollo', 'muslo de pollo', 'pierna y muslo de pollo', 'alas de pollo', 'carne de pollo'],
    excludes: ['sabor pollo', 'consome', 'caldo de pollo', 'para perro', 'para gato', 'croquetas', 'nuggets'], comparableBy: ['mass'],
    variants: [
      { id: 'entero', label: 'Pollo entero', synonyms: ['pollo entero'] },
      { id: 'pechuga', label: 'Pechuga', synonyms: ['pechuga de pollo'] },
      { id: 'pierna_muslo', label: 'Pierna y muslo', synonyms: ['pierna de pollo', 'muslo de pollo', 'pierna y muslo de pollo'] },
      { id: 'alas', label: 'Alas', synonyms: ['alas de pollo'] },
    ],
    officialRefs: PACIC, expectedCategories: ['supermercado'],
  }),
  need({
    id: 'alimentos.res', family: 'alimentacion_basica', subcategory: 'Carnes', label: 'Carne de res', kind: 'esencial',
    synonyms: ['carne de res', 'carne molida de res', 'carne molida', 'bistec de res', 'bistec'],
    excludes: ['para perro', 'para gato', 'sabor', 'croquetas', 'hamburguesa congelada'], comparableBy: ['mass'],
    variants: [
      { id: 'molida', label: 'Carne molida de res', synonyms: ['carne molida de res', 'carne molida'] },
      { id: 'bistec', label: 'Bistec de res', synonyms: ['bistec de res', 'bistec'] },
    ],
    officialRefs: PACIC, expectedCategories: ['supermercado'],
  }),
  need({
    id: 'alimentos.cerdo', family: 'alimentacion_basica', subcategory: 'Carnes', label: 'Carne de cerdo', kind: 'esencial',
    synonyms: ['carne de cerdo', 'chuleta de cerdo', 'lomo de cerdo', 'pierna de cerdo'],
    excludes: ['para perro', 'sabor', 'croquetas'], comparableBy: ['mass'],
    variants: [
      { id: 'chuleta', label: 'Chuleta', synonyms: ['chuleta de cerdo'] },
      { id: 'lomo', label: 'Lomo', synonyms: ['lomo de cerdo'] },
      { id: 'pierna', label: 'Pierna', synonyms: ['pierna de cerdo'] },
    ],
    officialRefs: PACIC, expectedCategories: ['supermercado'],
  }),
  need({
    id: 'alimentos.frutas', family: 'alimentacion_basica', subcategory: 'Frutas y verduras', label: 'Frutas', kind: 'esencial',
    synonyms: ['limon', 'limones', 'manzana', 'manzanas', 'platano', 'platanos', 'naranjas', 'naranja valencia'],
    excludes: ['verde limon', 'sabor', 'aroma', 'jugo', 'nectar', 'refresco', 'bebida', 'compota', 'esencia', 'fragancia', 'mermelada', 'vinagre', 'te de', 'shampoo', 'jabon', 'jabon liquido', 'deshidratada', 'deshidratado', 'pure'],
    comparableBy: ['mass'],
    variants: [
      { id: 'limon', label: 'Limón', synonyms: ['limon', 'limones'] },
      { id: 'manzana', label: 'Manzana', synonyms: ['manzana', 'manzanas'] },
      { id: 'platano', label: 'Plátano', synonyms: ['platano', 'platanos'] },
      { id: 'naranja', label: 'Naranja', synonyms: ['naranjas', 'naranja valencia'] },
    ],
    officialRefs: PACIC, expectedCategories: ['supermercado'],
  }),
  need({
    id: 'alimentos.verduras', family: 'alimentacion_basica', subcategory: 'Frutas y verduras', label: 'Verduras', kind: 'esencial',
    synonyms: ['jitomate', 'jitomates', 'cebolla', 'cebollas', 'papa blanca', 'zanahoria', 'zanahorias', 'chile jalapeno'],
    excludes: ['sabor', 'aroma', 'pure', 'papas fritas', 'deshidratada', 'en polvo', 'cortador', 'picador', 'rallador'],
    comparableBy: ['mass'],
    variants: [
      { id: 'jitomate', label: 'Jitomate', synonyms: ['jitomate', 'jitomates'] },
      { id: 'cebolla', label: 'Cebolla', synonyms: ['cebolla', 'cebollas'] },
      { id: 'papa', label: 'Papa blanca', synonyms: ['papa blanca'] },
      { id: 'zanahoria', label: 'Zanahoria', synonyms: ['zanahoria', 'zanahorias'] },
      { id: 'chile_jalapeno', label: 'Chile jalapeño fresco', synonyms: ['chile jalapeno'] },
    ],
    officialRefs: PACIC, expectedCategories: ['supermercado'],
  }),
  need({
    id: 'alimentos.pan', family: 'alimentacion_basica', subcategory: 'Panadería', label: 'Pan de caja', kind: 'esencial',
    synonyms: ['pan blanco de caja', 'pan de caja', 'pan blanco', 'pan integral de caja'],
    excludes: ['tostador', 'panera', 'molde para pan'], comparableBy: ['mass'],
    variants: [
      { id: 'caja_blanco', label: 'Pan blanco de caja', synonyms: ['pan blanco de caja', 'pan blanco'] },
      { id: 'caja_integral', label: 'Pan integral de caja', synonyms: ['pan integral de caja'] },
    ],
    officialRefs: PACIC, expectedCategories: ['supermercado'],
  }),
  need({
    id: 'alimentos.frescos', family: 'alimentacion_basica', subcategory: 'Frutas y verduras', label: 'Frutas, verduras y carnes frescas',
    synonyms: [], comparableBy: ['mass'], status: 'retired', basis: 'hypothesis',
    expectedCategories: ['supermercado'],
  }),

  // Limpieza del hogar
  need({
    id: 'limpieza.detergente_ropa', family: 'limpieza_hogar', subcategory: 'Lavandería', label: 'Detergente para ropa',
    synonyms: ['detergente para ropa', 'detergente liquido', 'detergente en polvo', 'jabon para ropa', 'jabon liquido para ropa', 'detergente', 'suavizante de telas', 'suavizante', 'quitamanchas'],
    excludes: ['detergente para trastes', 'lavavajillas'], comparableBy: ['volume', 'mass'],
    variants: [
      { id: 'liquido', label: 'Detergente líquido', synonyms: ['detergente liquido', 'jabon liquido para ropa'], comparableBy: ['volume'] },
      { id: 'polvo', label: 'Detergente en polvo', synonyms: ['detergente en polvo'], comparableBy: ['mass'] },
      { id: 'suavizante', label: 'Suavizante de telas', synonyms: ['suavizante de telas', 'suavizante'], comparableBy: ['volume'] },
      { id: 'quitamanchas', label: 'Quitamanchas', synonyms: ['quitamanchas'] },
    ],
    expectedCategories: ['supermercado', 'hogar'],
  }),
  need({ id: 'limpieza.lavatrastes', family: 'limpieza_hogar', subcategory: 'Cocina', label: 'Lavatrastes', synonyms: ['lavatrastes', 'jabon para trastes', 'detergente para trastes', 'lavaplatos', 'lavavajillas', 'jabon lavatrastes'], excludes: ['maquina lavavajillas', 'lavavajillas empotrable'], comparableBy: ['volume', 'mass'], expectedCategories: ['supermercado', 'hogar'] }),
  need({ id: 'limpieza.superficies', family: 'limpieza_hogar', subcategory: 'Superficies', label: 'Limpiadores de superficies', synonyms: ['limpiador multiusos', 'limpiador de pisos', 'limpiador desinfectante', 'desengrasante', 'limpiavidrios', 'limpiador de vidrios', 'multiusos', 'toallitas desinfectantes'], comparableBy: ['volume'],
    variants: [
      { id: 'vidrios', label: 'Limpiavidrios', synonyms: ['limpiavidrios', 'limpiador de vidrios'] },
      { id: 'pisos', label: 'Limpiador de pisos', synonyms: ['limpiador de pisos'] },
      { id: 'toallitas', label: 'Toallitas desinfectantes', synonyms: ['toallitas desinfectantes'], comparableBy: ['count'] },
      { id: 'multiusos', label: 'Multiusos y desengrasante', synonyms: ['limpiador multiusos', 'multiusos', 'limpiador desinfectante', 'desengrasante'] },
    ],
    expectedCategories: ['supermercado', 'hogar'] }),
  need({ id: 'limpieza.cloro', family: 'limpieza_hogar', subcategory: 'Superficies', label: 'Cloro y blanqueadores', synonyms: ['cloro', 'blanqueador', 'hipoclorito'], excludes: ['sin cloro'], comparableBy: ['volume'], expectedCategories: ['supermercado', 'hogar'] }),
  need({ id: 'limpieza.bolsas_basura', family: 'limpieza_hogar', subcategory: 'Desechables', label: 'Bolsas para basura', synonyms: ['bolsas para basura', 'bolsa para basura', 'bolsas de basura', 'bolsa de basura'], comparableBy: ['count'], expectedCategories: ['supermercado', 'hogar'] }),
  need({ id: 'limpieza.papel_cocina', family: 'limpieza_hogar', subcategory: 'Desechables', label: 'Toallas de papel y servilletas', synonyms: ['toallas de papel', 'toalla de papel', 'papel de cocina', 'servilletas'], comparableBy: ['count'], expectedCategories: ['supermercado', 'hogar'] }),

  // Higiene personal
  need({ id: 'higiene.papel_higienico', family: 'higiene_personal', subcategory: 'Papel', label: 'Papel higiénico', kind: 'esencial', synonyms: ['papel higienico'], comparableBy: ['count'], officialRefs: PACIC, expectedCategories: ['supermercado', 'hogar'] }),
  need({
    id: 'higiene.jabon', family: 'higiene_personal', subcategory: 'Baño', label: 'Jabón de tocador', kind: 'esencial',
    synonyms: ['jabon de tocador', 'jabon en barra', 'jabon liquido para manos', 'jabon corporal', 'gel de bano', 'jabon'],
    excludes: ['para ropa', 'de ropa', 'lavanderia', 'para lavar ropa', 'para trastes', 'lavatrastes', 'jabonera', 'dispensador'], comparableBy: ['mass', 'volume', 'count'],
    variants: [
      { id: 'barra', label: 'Jabón en barra', synonyms: ['jabon de tocador', 'jabon en barra'], comparableBy: ['mass', 'count'] },
      { id: 'liquido', label: 'Jabón líquido o gel', synonyms: ['jabon liquido para manos', 'jabon corporal', 'gel de bano'], comparableBy: ['volume'] },
    ],
    officialRefs: PACIC, expectedCategories: ['supermercado', 'belleza'],
  }),
  need({ id: 'higiene.pasta_dental', family: 'higiene_personal', subcategory: 'Cuidado bucal', label: 'Pasta dental', synonyms: ['pasta dental', 'pasta de dientes', 'crema dental'], comparableBy: ['volume', 'mass'], expectedCategories: ['supermercado', 'belleza'] }),
  need({ id: 'higiene.champu', family: 'higiene_personal', subcategory: 'Cabello', label: 'Champú', synonyms: ['shampoo', 'champu', 'acondicionador'], comparableBy: ['volume'],
    variants: [
      { id: 'champu', label: 'Champú', synonyms: ['shampoo', 'champu'] },
      { id: 'acondicionador', label: 'Acondicionador', synonyms: ['acondicionador'] },
    ],
    expectedCategories: ['supermercado', 'belleza'] }),
  need({ id: 'higiene.desodorante', family: 'higiene_personal', subcategory: 'Cuidado personal', label: 'Desodorante', synonyms: ['desodorante', 'antitranspirante'], excludes: ['desodorante ambiental', 'desodorante para auto'], comparableBy: ['volume', 'mass'], expectedCategories: ['supermercado', 'belleza'] }),
  need({ id: 'higiene.cuidado_femenino', family: 'higiene_personal', subcategory: 'Cuidado personal', label: 'Toallas femeninas y protectores', kind: 'esencial', synonyms: ['toallas femeninas', 'toalla femenina', 'protectores diarios', 'tampones'], comparableBy: ['count'], expectedCategories: ['supermercado', 'belleza'] }),
  need({ id: 'higiene.cepillo_dental', family: 'higiene_personal', subcategory: 'Cuidado bucal', label: 'Cepillo dental e hilo', synonyms: ['cepillo dental', 'cepillo de dientes', 'hilo dental', 'enjuague bucal'], excludes: ['cepillo dental electrico'], comparableBy: ['count', 'volume'], expectedCategories: ['supermercado', 'belleza'] }),

  // Familia y bebés
  need({ id: 'bebes.panales', family: 'familia_bebes', subcategory: 'Pañales', label: 'Pañales', kind: 'esencial', synonyms: ['panales', 'panal', 'calzoncito entrenador', 'pants entrenador'], excludes: ['panalera', 'cambiador de panales', 'panalero'], comparableBy: ['count'], expectedCategories: ['bebes', 'supermercado'] }),
  need({ id: 'bebes.toallitas', family: 'familia_bebes', subcategory: 'Higiene infantil', label: 'Toallitas húmedas', synonyms: ['toallitas humedas', 'toallitas', 'toallas humedas'], excludes: ['toallitas desmaquillantes', 'toallitas desinfectantes'], comparableBy: ['count'], expectedCategories: ['bebes', 'supermercado'] }),
  need({ id: 'bebes.formula', family: 'familia_bebes', subcategory: 'Alimentación infantil', label: 'Fórmula infantil', kind: 'esencial', synonyms: ['formula infantil', 'formula lactea', 'leche de formula'], comparableBy: ['mass'], expectedCategories: ['bebes', 'supermercado'] }),
  need({ id: 'bebes.cuidado', family: 'familia_bebes', subcategory: 'Higiene infantil', label: 'Cuidado infantil', synonyms: ['shampoo para bebe', 'crema para rozaduras', 'jabon para bebe', 'aceite para bebe'], comparableBy: ['volume', 'mass'], expectedCategories: ['bebes'] }),

  // Mascotas
  need({ id: 'mascotas.alimento_perro', family: 'mascotas', subcategory: 'Alimento', label: 'Alimento para perro', synonyms: ['alimento para perro', 'alimento para perros', 'croquetas para perro', 'croquetas para perros', 'alimento seco para perro', 'alimento humedo para perro'], comparableBy: ['mass'], expectedCategories: ['supermercado', 'bebes'] }),
  need({ id: 'mascotas.alimento_gato', family: 'mascotas', subcategory: 'Alimento', label: 'Alimento para gato', synonyms: ['alimento para gato', 'alimento para gatos', 'croquetas para gato', 'croquetas para gatos', 'alimento humedo para gato'], comparableBy: ['mass'], expectedCategories: ['supermercado', 'bebes'] }),
  need({ id: 'mascotas.arena_gato', family: 'mascotas', subcategory: 'Higiene', label: 'Arena para gato', synonyms: ['arena para gato', 'arena para gatos', 'arena sanitaria'], excludes: ['arenero autolimpiable'], comparableBy: ['mass', 'volume'], expectedCategories: ['supermercado', 'bebes'] }),
  need({ id: 'mascotas.higiene', family: 'mascotas', subcategory: 'Higiene', label: 'Higiene de mascotas', synonyms: ['tapetes entrenadores', 'tapete entrenador', 'bolsas para popo', 'shampoo para perro', 'shampoo para gato'], comparableBy: ['count', 'volume'], expectedCategories: ['supermercado', 'bebes'] }),
];

const NEEDS_BY_ID = new Map(DESPENSA_NEEDS.map((n) => [n.id, n]));

export function despensaNeedById(id: string | null | undefined): DespensaNeed | null {
  if (!id) return null;
  return NEEDS_BY_ID.get(id) ?? null;
}

export function activeDespensaNeeds(): DespensaNeed[] {
  return DESPENSA_NEEDS.filter((n) => n.status === 'active');
}

export function despensaVariant(needId: string | null | undefined, variantId: string | null | undefined): DespensaVariant | null {
  if (!variantId) return null;
  return despensaNeedById(needId)?.variants?.find((v) => v.id === variantId) ?? null;
}

/** Dimensiones comparables de una necesidad, restringidas por la variante si la declara. */
export function comparableDimensionsFor(needId: string | null | undefined, variantId: string | null | undefined): readonly ComparableDimension[] {
  const need = despensaNeedById(needId);
  if (!need) return [];
  return despensaVariant(needId, variantId)?.comparableBy ?? need.comparableBy;
}

/** Sustituciones aproximadas registradas. Nunca son equivalencias de precio. */
export function approximateSubstitutes(needId: string | null | undefined, variantId: string | null | undefined): DespensaSubstitute[] {
  const need = despensaNeedById(needId);
  if (!need?.substitutes) return [];
  return need.substitutes.filter((s) => s.fromVariantId === null || s.fromVariantId === (variantId ?? null));
}
