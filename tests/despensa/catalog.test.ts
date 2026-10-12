import { describe, expect, it } from 'vitest';
import {
  activeDespensaNeeds,
  DESPENSA_CATALOG_VERSION,
  DESPENSA_FAMILIES,
  DESPENSA_NEEDS,
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

  it('solo usa categorías existentes y no declara listas oficiales que no tiene', () => {
    const categoryIds = new Set(ALL_CATEGORIES.map((c) => c.value));
    for (const need of DESPENSA_NEEDS) {
      for (const cat of need.expectedCategories) expect(categoryIds.has(cat)).toBe(true);
      expect(need.basis).not.toBe('official_list');
      if (need.status === 'hypothesis') expect(need.basis).toBe('hypothesis');
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
    ['Jitomate saladet 1 kg', null],
  ];
  it.each(cases)('«%s» → %s', (title, expected) => {
    expect(classifyDespensaText(title)?.needId ?? null).toBe(expected);
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
