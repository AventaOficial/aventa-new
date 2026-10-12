import { describe, expect, it } from 'vitest';
import {
  activeDespensaNeeds,
  DESPENSA_CATALOG_VERSION,
  DESPENSA_FAMILIES,
  DESPENSA_NEEDS,
  DESPENSA_OFFICIAL_REFERENCES,
  despensaNeedById,
  despensaVariant,
} from '@/lib/despensa/catalog';
import { classifyDespensaText, despensaNeedIdsFromInterests } from '@/lib/despensa/classify';
import { normalizeInterestText } from '@/lib/interests/normalize';
import { ALL_CATEGORIES } from '@/lib/categories';

describe('catálogo de Despensa', () => {
  it('tiene versión, ids únicos y estables con prefijo de familia', () => {
    expect(DESPENSA_CATALOG_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    const ids = DESPENSA_NEEDS.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const need of DESPENSA_NEEDS) {
      expect(need.id).toMatch(/^[a-z]+\.[a-z_]+$/);
      expect(DESPENSA_FAMILIES).toContain(need.family);
    }
  });

  it('cubre las cinco familias con necesidades activas', () => {
    const families = new Set(activeDespensaNeeds().map((n) => n.family));
    expect([...families].sort()).toEqual([...DESPENSA_FAMILIES].sort());
  });

  it('escribe sinónimos y exclusiones ya normalizados, sin duplicados entre necesidades', () => {
    const seen = new Map<string, string>();
    for (const need of DESPENSA_NEEDS) {
      for (const phrase of [...need.synonyms, ...(need.excludes ?? [])]) {
        expect(normalizeInterestText(phrase)).toBe(phrase);
      }
      for (const synonym of need.synonyms) {
        expect(seen.get(synonym), `«${synonym}» repetido`).toBeUndefined();
        seen.set(synonym, need.id);
      }
    }
  });

  it('solo usa categorías existentes y solo declara listas oficiales registradas', () => {
    const categoryIds = new Set(ALL_CATEGORIES.map((c) => c.value));
    const refIds = new Set(DESPENSA_OFFICIAL_REFERENCES.map((r) => r.id));
    for (const need of DESPENSA_NEEDS) {
      for (const cat of need.expectedCategories) expect(categoryIds.has(cat)).toBe(true);
      if (need.basis === 'official_list') {
        expect(need.officialRefs?.length).toBeGreaterThan(0);
        for (const ref of need.officialRefs ?? []) expect(refIds.has(ref), ref).toBe(true);
      } else {
        expect(need.officialRefs ?? []).toEqual([]);
      }
      if (need.status !== 'active') expect(need.basis).toBe('hypothesis');
    }
  });

  it('cada referencia oficial cita fuente, fecha de lectura y apunta a necesidades y variantes activas', () => {
    for (const ref of DESPENSA_OFFICIAL_REFERENCES) {
      expect(ref.url).toMatch(/^https:\/\/[a-z0-9.-]+\.gob\.mx\//);
      expect(ref.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(JSON.stringify(ref.items)).not.toMatch(/precio|\$|costo|mxn/i);
      for (const item of ref.items) {
        const need = despensaNeedById(item.needId);
        expect(need?.status, item.label).toBe('active');
        expect(need?.officialRefs).toContain(ref.id);
        if (item.variantId) expect(despensaVariant(item.needId, item.variantId), item.label).not.toBeNull();
      }
    }
    expect(DESPENSA_OFFICIAL_REFERENCES.find((r) => r.id === 'profeco_pacic_24')?.items).toHaveLength(24);
  });

  it('cada sinónimo de variante clasifica a su necesidad y a esa variante', () => {
    for (const need of activeDespensaNeeds()) {
      const ids = (need.variants ?? []).map((v) => v.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const variant of need.variants ?? []) {
        for (const synonym of variant.synonyms) {
          expect(normalizeInterestText(synonym)).toBe(synonym);
          const hit = classifyDespensaText(synonym);
          expect(hit?.needId, synonym).toBe(need.id);
          expect(hit?.variantId, synonym).toBe(variant.id);
        }
      }
    }
  });

  it('marca cada necesidad con tipo y subcategoría', () => {
    for (const need of activeDespensaNeeds()) {
      expect(['esencial', 'cotidiano', 'discrecional']).toContain(need.kind);
      expect(need.subcategory.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('clasificación por texto', () => {
  const cases: Array<[string, string | null]> = [
    ['Papel Higiénico Pétalo 32 rollos', 'higiene.papel_higienico'],
    ['Jabón para trastes Salvo 900 ml', 'limpieza.lavatrastes'],
    ['Detergente líquido Ariel 5 L', 'limpieza.detergente_ropa'],
    ['Pasta dental Colgate 100 ml', 'higiene.pasta_dental'],
    ['Pasta para sopa coditos 200 g', 'alimentos.pasta'],
    ['Toallitas húmedas Huggies 3 x 80', 'bebes.toallitas'],
    ['Toallitas desinfectantes Clorox 75 piezas', 'limpieza.superficies'],
    ['Jabón para bebé 400 ml', 'bebes.cuidado'],
    ['Shampoo para perro 500 ml', 'mascotas.higiene'],
    ['Croquetas para perro adulto 4 kg', 'mascotas.alimento_perro'],
    ['Vanish Líquido Quitamanchas Sin Cloro White 1.7 L', 'limpieza.detergente_ropa'],
    ['Windex Limpiador de Vidrios Atomizador 640 ml', 'limpieza.superficies'],
    ['Café Garat Tostado y Molido con Colageno 340 g', 'alimentos.cafe_te'],
    ['Del Fuerte, Pure Tomate Del Fuerte Brik, 1 kilogramos', 'alimentos.atun_enlatados'],
    ['Cloro en gel 1 L', 'limpieza.cloro'],
    ['Leche de arroz 1 L', null],
    ['Arrocera eléctrica 1.8 L', null],
    ['Sofá café 3 plazas', null],
    ['Audífonos bluetooth', null],
    ['Cafetera de goteo', null],
    ['Jitomate saladet 1 kg', 'alimentos.verduras'],
    ['Pechuga de pollo sin hueso 1 kg', 'alimentos.pollo'],
    ['Croquetas para perro sabor pollo 4 kg', 'mascotas.alimento_perro'],
    ['Consomé de pollo 400 g', 'alimentos.sal_condimentos'],
    ['Carne molida de res 500 g', 'alimentos.res'],
    ['Pan blanco de caja Bimbo 680 g', 'alimentos.pan'],
    ['Manzana roja 1 kg', 'alimentos.frutas'],
    ['Funda iPhone color naranja', null],
    ['Shampoo aroma limón 750 ml', 'higiene.champu'],
    ['Té de limón 25 sobres', 'alimentos.cafe_te'],
    ['Papas fritas sabor cebolla 150 g', null],
    ['Tortillas de maíz 1 kg', 'alimentos.maiz_harina'],
  ];
  it.each(cases)('«%s» → %s', (title, expected) => {
    expect(classifyDespensaText(title)?.needId ?? null).toBe(expected);
  });

  it('identifica la variante y deja ambigua la que nombra dos', () => {
    expect(classifyDespensaText('Tortillas de maíz 1 kg')?.variantId).toBe('tortilla_maiz');
    expect(classifyDespensaText('Harina de maíz Maseca 1 kg')?.variantId).toBe('harina_maiz');
    expect(classifyDespensaText('Leche entera Lala 1 L')?.variantId).toBe('entera');
    expect(classifyDespensaText('Leche Lala 1 L')?.variantId).toBeNull();
    expect(classifyDespensaText('Kit leche entera 1 L y leche deslactosada 1 L')?.variantId).toBeNull();
    expect(classifyDespensaText('Papel higiénico 4 rollos')?.variantId).toBeNull();
  });

  it('reporta la versión del catálogo usada', () => {
    expect(classifyDespensaText('Arroz 1 kg')?.catalogVersion).toBe(DESPENSA_CATALOG_VERSION);
  });
});

describe('integración con /me/intereses', () => {
  it('lee necesidades desde nombre y alias de los intereses existentes', () => {
    const ids = despensaNeedIdsFromInterests([
      { label: 'Pañales etapa 4', aliases: ['toallitas húmedas'] },
      { label: 'iPhone 15', aliases: null },
    ]);
    expect([...ids].sort()).toEqual(['bebes.panales', 'bebes.toallitas']);
  });

  it('preferencias vacías o incompletas no fallan ni inventan necesidades', () => {
    expect(despensaNeedIdsFromInterests([]).size).toBe(0);
    expect(despensaNeedIdsFromInterests([{ label: '' }, { label: '   ', aliases: [] }]).size).toBe(0);
  });
});
