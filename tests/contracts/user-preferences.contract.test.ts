import { describe, it, expect } from 'vitest';
import {
  buildAffinityFromPreferredSelections,
  enrichAffinityFromBehavior,
  offerMatchesAffinity,
  sortOffersByAffinity,
  storeMatchesAffinity,
} from '../../lib/preferences/affinity';
import {
  mergePreferredCategories,
  normalizeStorePreferenceKey,
  partitionPreferredSelections,
  preferredCategoriesEqual,
} from '../../lib/preferences/userPreferences';

describe('Preferencias de usuario', () => {
  it('mergePreferredCategories es idempotente y elimina duplicados', () => {
    const merged = mergePreferredCategories(
      ['tecnologia', 'amazon'],
      ['Tecnología', 'AMAZON', 'gaming', 'mercadolibre'],
    );
    expect(merged).toEqual(['tecnologia', 'amazon', 'gaming', 'mercado-libre']);
    expect(mergePreferredCategories(merged, [])).toEqual(merged);
  });

  it('preferredCategoriesEqual ignora casing y alias de tienda', () => {
    const a = ['tecnologia', 'Amazon'];
    const b = ['gaming', 'amazon'];
    expect(preferredCategoriesEqual(a, a)).toBe(true);
    expect(preferredCategoriesEqual(['tecnologia', 'amazon'], ['Amazon', 'tecnologia'])).toBe(true);
    expect(preferredCategoriesEqual(a, b)).toBe(false);
  });

  it('partitionPreferredSelections separa categorías y tiendas', () => {
    const { categories, stores } = partitionPreferredSelections(['moda', 'nike', 'supermercado']);
    expect(categories).toEqual(['moda', 'supermercado']);
    expect(stores).toEqual(['nike']);
  });

  it('normalizeStorePreferenceKey unifica mercadolibre y Mercado Libre', () => {
    expect(normalizeStorePreferenceKey('mercadolibre')).toBe('mercado-libre');
    expect(normalizeStorePreferenceKey('Mercado Libre')).toBe('mercado-libre');
  });
});

describe('Afinidad Para ti', () => {
  it('storeMatchesAffinity enlaza amazon con Amazon México', () => {
    const keys = new Set([normalizeStorePreferenceKey('amazon')]);
    expect(storeMatchesAffinity(keys, 'Amazon México')).toBe(true);
    expect(storeMatchesAffinity(keys, 'Walmart')).toBe(false);
  });

  it('buildAffinityFromPreferredSelections incluye tiendas del onboarding', () => {
    const affinity = buildAffinityFromPreferredSelections(['tecnologia', 'zara']);
    expect(affinity.categoryIds.has('tecnologia')).toBe(true);
    expect(affinity.storeKeys.has('zara')).toBe(true);
    expect(offerMatchesAffinity({ category: 'moda', store: 'Zara' }, affinity)).toBe(true);
  });

  it('enrichAffinityFromBehavior añade señales de votos y favoritos', () => {
    const base = buildAffinityFromPreferredSelections(['gaming']);
    const enriched = enrichAffinityFromBehavior(base, [
      { category: 'moda', store: 'Nike' },
    ]);
    expect(enriched.categoryIds.has('moda')).toBe(true);
    expect(enriched.storeKeys.has('nike')).toBe(true);
  });

  it('sortOffersByAffinity prioriza coincidencias sobre ranking_blend', () => {
    const affinity = buildAffinityFromPreferredSelections(['amazon']);
    const offers = [
      { store: 'Walmart', category: 'supermercado', ranking_blend: 100 },
      { store: 'Amazon México', category: 'tecnologia', ranking_blend: 1 },
      { store: 'Liverpool', category: 'moda', ranking_blend: 50 },
    ];
    const sorted = sortOffersByAffinity(offers, affinity);
    expect(sorted[0].store).toBe('Amazon México');
  });

  it('combinación categoría + tienda en preferencias de perfil', () => {
    const affinity = buildAffinityFromPreferredSelections(['belleza', 'costco']);
    expect(offerMatchesAffinity({ category: 'belleza', store: 'Amazon' }, affinity)).toBe(true);
    expect(offerMatchesAffinity({ category: 'hogar', store: 'Costco' }, affinity)).toBe(true);
    expect(offerMatchesAffinity({ category: 'gaming', store: 'Amazon' }, affinity)).toBe(false);
  });
});
