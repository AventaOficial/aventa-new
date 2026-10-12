import type { CategoryId } from '@/lib/categories';

/**
 * Catálogo de necesidades de Despensa.
 *
 * Es una clasificación de consumo construida por Aventa. No es la canasta básica oficial
 * de ninguna institución y no contiene cifras de gasto ni información nutricional.
 *
 * Reglas de mantenimiento:
 * - `id` es estable: no se renombra ni se reutiliza. Para retirar una necesidad, cambia `status`.
 * - Cualquier cambio de sinónimos, exclusiones o entradas sube `DESPENSA_CATALOG_VERSION`.
 * - Los sinónimos se escriben ya normalizados (minúsculas, sin acentos, sin signos) y se
 *   comparan como frases completas contra el título normalizado.
 */
export const DESPENSA_CATALOG_VERSION = '2026-10-11.2';

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
 * - `official_list`: publicada por una fuente identificable. Hoy no hay ninguna codificada.
 * - `aventa_category`: categoría de consumo definida por Aventa.
 * - `household_profile`: perfil configurable de compra doméstica (aún no existe).
 * - `hypothesis`: idea de producto pendiente de validar; no clasifica ofertas.
 */
export type DespensaReferenceBasis = 'official_list' | 'aventa_category' | 'household_profile' | 'hypothesis';

/** Dimensión con la que una presentación puede compararse. */
export type ComparableDimension = 'mass' | 'volume' | 'count';

export type DespensaNeed = {
  id: string;
  family: DespensaFamilyId;
  label: string;
  synonyms: readonly string[];
  /** Frases que, si aparecen, descartan esta necesidad (p. ej. «arena» decorativa). */
  excludes?: readonly string[];
  /** Dimensiones válidas para precio unitario. Vacío: no se compara por unidad. */
  comparableBy: readonly ComparableDimension[];
  basis: DespensaReferenceBasis;
  /** `active` clasifica ofertas; `hypothesis` queda documentada pero no clasifica. */
  status: 'active' | 'hypothesis';
  /** Categorías de `lib/categories.ts` donde se espera encontrar la necesidad. */
  expectedCategories: readonly CategoryId[];
};

const need = (n: Omit<DespensaNeed, 'basis' | 'status'> & Partial<Pick<DespensaNeed, 'basis' | 'status'>>): DespensaNeed => ({
  basis: 'aventa_category',
  status: 'active',
  ...n,
});

export const DESPENSA_NEEDS: readonly DespensaNeed[] = [
  // Alimentación básica
  need({ id: 'alimentos.arroz', family: 'alimentacion_basica', label: 'Arroz', synonyms: ['arroz'], excludes: ['arrocera', 'galletas de arroz', 'leche de arroz'], comparableBy: ['mass'], expectedCategories: ['supermercado'] }),
  need({ id: 'alimentos.frijol', family: 'alimentacion_basica', label: 'Frijol', synonyms: ['frijol', 'frijoles'], comparableBy: ['mass'], expectedCategories: ['supermercado'] }),
  need({ id: 'alimentos.legumbres', family: 'alimentacion_basica', label: 'Lentejas y otras legumbres', synonyms: ['lenteja', 'lentejas', 'garbanzo', 'garbanzos', 'haba seca', 'habas secas'], comparableBy: ['mass'], expectedCategories: ['supermercado'] }),
  need({ id: 'alimentos.maiz_harina', family: 'alimentacion_basica', label: 'Maíz, harina y tortillas', synonyms: ['harina de maiz', 'harina de trigo', 'harina', 'tortillas', 'tortilla', 'maiz pozolero'], excludes: ['harina de proteina', 'tortillero', 'tortilladora'], comparableBy: ['mass', 'count'], expectedCategories: ['supermercado'] }),
  need({ id: 'alimentos.aceite', family: 'alimentacion_basica', label: 'Aceite comestible', synonyms: ['aceite vegetal', 'aceite de canola', 'aceite de girasol', 'aceite de maiz', 'aceite de oliva', 'aceite comestible'], excludes: ['aceite para motor', 'aceite esencial', 'aceite corporal', 'aceite para bebe'], comparableBy: ['volume'], expectedCategories: ['supermercado'] }),
  need({ id: 'alimentos.azucar', family: 'alimentacion_basica', label: 'Azúcar', synonyms: ['azucar'], excludes: ['sin azucar', 'libre de azucar', 'cero azucar'], comparableBy: ['mass'], expectedCategories: ['supermercado'] }),
  need({ id: 'alimentos.sal_condimentos', family: 'alimentacion_basica', label: 'Sal y condimentos esenciales', synonyms: ['sal de mesa', 'sal yodada', 'consome de pollo', 'pimienta molida', 'consome'], comparableBy: ['mass'], expectedCategories: ['supermercado'] }),
  need({ id: 'alimentos.leche', family: 'alimentacion_basica', label: 'Leche', synonyms: ['leche entera', 'leche deslactosada', 'leche semidescremada', 'leche descremada', 'leche en polvo', 'leche ultrapasteurizada', 'leche'], excludes: ['leche corporal', 'crema corporal', 'leche limpiadora', 'leche de arroz'], comparableBy: ['volume', 'mass'], expectedCategories: ['supermercado', 'bebes'] }),
  need({ id: 'alimentos.huevo', family: 'alimentacion_basica', label: 'Huevo', synonyms: ['huevo', 'huevos'], excludes: ['huevo de pascua', 'huevo sorpresa', 'huevera'], comparableBy: ['count'], expectedCategories: ['supermercado'] }),
  need({ id: 'alimentos.pasta', family: 'alimentacion_basica', label: 'Pasta', synonyms: ['pasta para sopa', 'sopa de pasta', 'spaghetti', 'espagueti', 'fideo', 'fideos', 'codito', 'coditos', 'macarron'], excludes: ['pasta dental', 'pasta de dientes'], comparableBy: ['mass'], expectedCategories: ['supermercado'] }),
  need({ id: 'alimentos.avena_cereal', family: 'alimentacion_basica', label: 'Avena y cereales', synonyms: ['avena', 'cereal', 'hojuelas de maiz', 'granola'], excludes: ['jabon de avena', 'crema de avena', 'shampoo de avena', 'barra de cereal'], comparableBy: ['mass'], expectedCategories: ['supermercado'] }),
  need({ id: 'alimentos.atun_enlatados', family: 'alimentacion_basica', label: 'Atún y enlatados básicos', synonyms: ['atun', 'sardina', 'sardinas', 'chiles en lata', 'chile chipotle', 'chiles jalapenos', 'pure de tomate', 'pure tomate'], comparableBy: ['mass', 'count'], expectedCategories: ['supermercado'] }),
  need({ id: 'alimentos.cafe_te', family: 'alimentacion_basica', label: 'Café y té', synonyms: ['cafe soluble', 'cafe molido', 'cafe en grano', 'cafe de grano', 'tostado y molido', 'te de', 'te verde', 'te negro'], excludes: ['cafetera', 'molino de cafe'], comparableBy: ['mass', 'count'], expectedCategories: ['supermercado'] }),
  need({ id: 'alimentos.frescos', family: 'alimentacion_basica', label: 'Frutas, verduras y carnes frescas', synonyms: ['jitomate', 'cebolla', 'aguacate', 'platano', 'pollo fresco', 'carne molida'], comparableBy: ['mass'], status: 'hypothesis', basis: 'hypothesis', expectedCategories: ['supermercado'] }),

  // Limpieza del hogar
  need({ id: 'limpieza.detergente_ropa', family: 'limpieza_hogar', label: 'Detergente para ropa', synonyms: ['detergente para ropa', 'detergente liquido', 'detergente en polvo', 'jabon para ropa', 'jabon liquido para ropa', 'detergente', 'suavizante de telas', 'suavizante', 'quitamanchas'], excludes: ['detergente para trastes', 'lavavajillas'], comparableBy: ['volume', 'mass'], expectedCategories: ['supermercado', 'hogar'] }),
  need({ id: 'limpieza.lavatrastes', family: 'limpieza_hogar', label: 'Lavatrastes', synonyms: ['lavatrastes', 'jabon para trastes', 'detergente para trastes', 'lavaplatos', 'lavavajillas', 'jabon lavatrastes'], excludes: ['maquina lavavajillas', 'lavavajillas empotrable'], comparableBy: ['volume', 'mass'], expectedCategories: ['supermercado', 'hogar'] }),
  need({ id: 'limpieza.superficies', family: 'limpieza_hogar', label: 'Limpiadores de superficies', synonyms: ['limpiador multiusos', 'limpiador de pisos', 'limpiador desinfectante', 'desengrasante', 'limpiavidrios', 'limpiador de vidrios', 'multiusos', 'toallitas desinfectantes'], comparableBy: ['volume'], expectedCategories: ['supermercado', 'hogar'] }),
  need({ id: 'limpieza.cloro', family: 'limpieza_hogar', label: 'Cloro y blanqueadores', synonyms: ['cloro', 'blanqueador', 'hipoclorito'], excludes: ['sin cloro'], comparableBy: ['volume'], expectedCategories: ['supermercado', 'hogar'] }),
  need({ id: 'limpieza.bolsas_basura', family: 'limpieza_hogar', label: 'Bolsas para basura', synonyms: ['bolsas para basura', 'bolsa para basura', 'bolsas de basura', 'bolsa de basura'], comparableBy: ['count'], expectedCategories: ['supermercado', 'hogar'] }),
  need({ id: 'limpieza.papel_cocina', family: 'limpieza_hogar', label: 'Toallas de papel y servilletas', synonyms: ['toallas de papel', 'toalla de papel', 'papel de cocina', 'servilletas'], comparableBy: ['count'], expectedCategories: ['supermercado', 'hogar'] }),

  // Higiene personal
  need({ id: 'higiene.papel_higienico', family: 'higiene_personal', label: 'Papel higiénico', synonyms: ['papel higienico'], comparableBy: ['count'], expectedCategories: ['supermercado', 'hogar'] }),
  need({ id: 'higiene.jabon', family: 'higiene_personal', label: 'Jabón de tocador', synonyms: ['jabon de tocador', 'jabon en barra', 'jabon liquido para manos', 'jabon corporal', 'gel de bano', 'jabon'], excludes: ['para ropa', 'para trastes', 'lavatrastes', 'jabonera', 'dispensador'], comparableBy: ['mass', 'volume', 'count'], expectedCategories: ['supermercado', 'belleza'] }),
  need({ id: 'higiene.pasta_dental', family: 'higiene_personal', label: 'Pasta dental', synonyms: ['pasta dental', 'pasta de dientes', 'crema dental'], comparableBy: ['volume', 'mass'], expectedCategories: ['supermercado', 'belleza'] }),
  need({ id: 'higiene.champu', family: 'higiene_personal', label: 'Champú', synonyms: ['shampoo', 'champu', 'acondicionador'], comparableBy: ['volume'], expectedCategories: ['supermercado', 'belleza'] }),
  need({ id: 'higiene.desodorante', family: 'higiene_personal', label: 'Desodorante', synonyms: ['desodorante', 'antitranspirante'], excludes: ['desodorante ambiental', 'desodorante para auto'], comparableBy: ['volume', 'mass'], expectedCategories: ['supermercado', 'belleza'] }),
  need({ id: 'higiene.cuidado_femenino', family: 'higiene_personal', label: 'Toallas femeninas y protectores', synonyms: ['toallas femeninas', 'toalla femenina', 'protectores diarios', 'tampones'], comparableBy: ['count'], expectedCategories: ['supermercado', 'belleza'] }),
  need({ id: 'higiene.cepillo_dental', family: 'higiene_personal', label: 'Cepillo dental e hilo', synonyms: ['cepillo dental', 'cepillo de dientes', 'hilo dental', 'enjuague bucal'], excludes: ['cepillo dental electrico'], comparableBy: ['count', 'volume'], expectedCategories: ['supermercado', 'belleza'] }),

  // Familia y bebés
  need({ id: 'bebes.panales', family: 'familia_bebes', label: 'Pañales', synonyms: ['panales', 'panal', 'calzoncito entrenador', 'pants entrenador'], excludes: ['panalera', 'cambiador de panales', 'panalero'], comparableBy: ['count'], expectedCategories: ['bebes', 'supermercado'] }),
  need({ id: 'bebes.toallitas', family: 'familia_bebes', label: 'Toallitas húmedas', synonyms: ['toallitas humedas', 'toallitas', 'toallas humedas'], excludes: ['toallitas desmaquillantes', 'toallitas desinfectantes'], comparableBy: ['count'], expectedCategories: ['bebes', 'supermercado'] }),
  need({ id: 'bebes.formula', family: 'familia_bebes', label: 'Fórmula infantil', synonyms: ['formula infantil', 'formula lactea', 'leche de formula'], comparableBy: ['mass'], expectedCategories: ['bebes', 'supermercado'] }),
  need({ id: 'bebes.cuidado', family: 'familia_bebes', label: 'Cuidado infantil', synonyms: ['shampoo para bebe', 'crema para rozaduras', 'jabon para bebe', 'aceite para bebe'], comparableBy: ['volume', 'mass'], expectedCategories: ['bebes'] }),

  // Mascotas
  need({ id: 'mascotas.alimento_perro', family: 'mascotas', label: 'Alimento para perro', synonyms: ['alimento para perro', 'alimento para perros', 'croquetas para perro', 'croquetas para perros', 'alimento seco para perro', 'alimento humedo para perro'], comparableBy: ['mass'], expectedCategories: ['supermercado', 'bebes'] }),
  need({ id: 'mascotas.alimento_gato', family: 'mascotas', label: 'Alimento para gato', synonyms: ['alimento para gato', 'alimento para gatos', 'croquetas para gato', 'croquetas para gatos', 'alimento humedo para gato'], comparableBy: ['mass'], expectedCategories: ['supermercado', 'bebes'] }),
  need({ id: 'mascotas.arena_gato', family: 'mascotas', label: 'Arena para gato', synonyms: ['arena para gato', 'arena para gatos', 'arena sanitaria'], excludes: ['arenero autolimpiable'], comparableBy: ['mass', 'volume'], expectedCategories: ['supermercado', 'bebes'] }),
  need({ id: 'mascotas.higiene', family: 'mascotas', label: 'Higiene de mascotas', synonyms: ['tapetes entrenadores', 'tapete entrenador', 'bolsas para popo', 'shampoo para perro', 'shampoo para gato'], comparableBy: ['count', 'volume'], expectedCategories: ['supermercado', 'bebes'] }),
];

const NEEDS_BY_ID = new Map(DESPENSA_NEEDS.map((n) => [n.id, n]));

export function despensaNeedById(id: string | null | undefined): DespensaNeed | null {
  if (!id) return null;
  return NEEDS_BY_ID.get(id) ?? null;
}

export function activeDespensaNeeds(): DespensaNeed[] {
  return DESPENSA_NEEDS.filter((n) => n.status === 'active');
}
