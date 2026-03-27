import { describe, it, expect } from 'vitest';
import {
  ALL_CATEGORIES,
  LEGACY_CATEGORY_MAP,
  VITAL_CATEGORY_IDS,
  VITAL_FILTER_VALUES,
  getValidCategoryValuesForFeed,
  isValidCategoryId,
  normalizeCategoryForStorage,
} from '../../lib/categories';

describe('Contrato de categorías', () => {
  it('todas las categorías UI son válidas y únicas', () => {
    const values = ALL_CATEGORIES.map((c) => c.value);
    const set = new Set(values);
    expect(values.length).toBe(set.size);
    values.forEach((value) => expect(isValidCategoryId(value)).toBe(true));
  });

  it('normaliza categorías legacy a macro canónica', () => {
    expect(normalizeCategoryForStorage('electronics')).toBe('tecnologia');
    expect(normalizeCategoryForStorage('fashion')).toBe('moda');
    expect(normalizeCategoryForStorage('home')).toBe('hogar');
    expect(normalizeCategoryForStorage('bancaria')).toBe('servicios');
    expect(normalizeCategoryForStorage('despensa')).toBe('supermercado');
  });

  it('cualquier entrada del mapa legacy termina en category id válida', () => {
    Object.keys(LEGACY_CATEGORY_MAP).forEach((legacy) => {
      const normalized = normalizeCategoryForStorage(legacy);
      expect(normalized).not.toBeNull();
      expect(isValidCategoryId(normalized)).toBe(true);
    });
  });

  it('cada macro tiene valores de query para feed', () => {
    ALL_CATEGORIES.forEach((category) => {
      const values = getValidCategoryValuesForFeed(category.value);
      expect(values.length).toBeGreaterThan(0);
      expect(values.includes(category.value)).toBe(true);
    });
  });

  it('vitales incluyen al menos las macros vitales', () => {
    VITAL_CATEGORY_IDS.forEach((vital) => {
      expect(VITAL_FILTER_VALUES.includes(vital)).toBe(true);
    });
  });

  it('categoría desconocida no se pierde en fallback de query', () => {
    expect(getValidCategoryValuesForFeed('categoria-no-existe')).toEqual(['categoria-no-existe']);
  });
});
