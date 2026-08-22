import { describe, it, expect } from 'vitest';
import { inferOfferTags, buildOfferSearchOrFilter } from '@/lib/offers/inferOfferTags';
import { inferSubgroupTagsFromTitle } from '@/lib/categories/subgroups';

describe('inferOfferTags', () => {
  it('asigna tags de pantallas para Smart TV en tecnologia', () => {
    const tags = inferOfferTags({
      title: 'Smart TV Motorola MOT32HLE11 32" HD DLED',
      store: 'Mercado Libre',
      category: 'tecnologia',
    });
    expect(tags).toContain('televisiones');
    expect(tags).toContain('smart-tv');
    expect(tags).toContain('tecnologia');
  });

  it('incluye tienda como tag slug', () => {
    const tags = inferOfferTags({
      title: 'Cereal Kelloggs',
      store: 'Amazon',
      category: 'supermercado',
    });
    expect(tags).toContain('amazon');
    expect(tags).toContain('despensa');
  });
});

describe('inferSubgroupTagsFromTitle', () => {
  it('detecta uber eats en servicios', () => {
    expect(inferSubgroupTagsFromTitle('Promo Uber Eats 50%', 'servicios')).toContain('comida-domicilio');
  });
});

describe('buildOfferSearchOrFilter', () => {
  it('incluye filtro tags.cs para slug de la query', () => {
    const or = buildOfferSearchOrFilter('smart tv');
    expect(or).toContain('tags.cs.{smart-tv}');
    expect(or).toContain('title.ilike.');
  });
});
