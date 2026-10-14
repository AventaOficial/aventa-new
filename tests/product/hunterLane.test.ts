import { describe, expect, it } from 'vitest';
import {
  hunterLaneMismatch,
  isRecientesHunterCode,
  offerLaneCode,
  suggestSupplyHunter,
} from '@/lib/product/hunters/lane';
import { mergeNewestFirst } from '@/lib/offers/feedService';
import { excludeMachineOffers } from '@/lib/offers/homeFeedClient';

describe('carril de hunters', () => {
  it('Recientes admite especialidad (Kai, Éléonore) y no el uso diario', () => {
    expect(isRecientesHunterCode('kai')).toBe(true);
    expect(isRecientesHunterCode('eleonore')).toBe(true);
    expect(isRecientesHunterCode('ximena')).toBe(false);
    expect(isRecientesHunterCode(null)).toBe(false);
    expect(isRecientesHunterCode('otro')).toBe(false);
  });

  it('sin sello, la oferta es de Ximena', () => {
    expect(offerLaneCode(null)).toBe('ximena');
    expect(offerLaneCode('kai')).toBe('kai');
  });

  it('sugiere por título con títulos reales de producción', () => {
    expect(suggestSupplyHunter({ title: 'Samsung Galaxy S26FE 256 GB', category: 'other' })).toBe('kai');
    expect(suggestSupplyHunter({ title: 'ASUS ROG Strix G16 Laptop Gamer' })).toBe('kai');
    expect(suggestSupplyHunter({ title: 'Audífonos Sony WF-C710N' })).toBe('kai');
    expect(suggestSupplyHunter({ title: 'Perfume Carolina Herrera 212 VIP 100 ml' })).toBe('eleonore');
    expect(suggestSupplyHunter({ title: 'Tenis Nike Air Max' })).toBe('eleonore');
    expect(suggestSupplyHunter({ title: 'Huevo Rojo Bachoco 30 piezas', category: 'other' })).toBe('ximena');
  });

  it('sin señal clara no sugiere; la categoría sirve de respaldo', () => {
    expect(suggestSupplyHunter({ title: 'LEGO Star Wars Halcón Milenario' })).toBeNull();
    expect(suggestSupplyHunter({ title: 'Producto genérico', category: 'tecnologia' })).toBe('kai');
    expect(suggestSupplyHunter({ title: '', category: null })).toBeNull();
  });

  it('marca incongruencia solo cuando el contenido apunta a otro hunter', () => {
    expect(hunterLaneMismatch({ hunterCode: 'ximena', title: 'Lenovo LOQ 15 laptop gamer' })).toEqual({
      current: 'ximena',
      suggested: 'kai',
    });
    expect(hunterLaneMismatch({ hunterCode: null, title: 'Samsung Galaxy S26FE' })).toEqual({
      current: 'ximena',
      suggested: 'kai',
    });
    expect(hunterLaneMismatch({ hunterCode: 'kai', title: 'Samsung Galaxy S26FE' })).toBeNull();
    expect(hunterLaneMismatch({ hunterCode: 'ximena', title: 'LEGO Star Wars' })).toBeNull();
  });
});

describe('Recientes con hunters de especialidad', () => {
  it('mergeNewestFirst une sin duplicados y en orden cronológico', () => {
    const a = [
      { id: 'c1', created_at: '2026-10-11T09:00:00Z' },
      { id: 'c2', created_at: '2026-10-11T07:00:00Z' },
    ];
    const b = [
      { id: 'k1', created_at: '2026-10-11T10:00:00Z' },
      { id: 'c1', created_at: '2026-10-11T09:00:00Z' },
      { id: 'e1', created_at: '2026-10-11T08:00:00Z' },
    ];
    expect(mergeNewestFirst(a, b).map((r) => r.id)).toEqual(['k1', 'c1', 'e1', 'c2']);
  });

  it('el filtro del cliente conserva comunidad, Kai y Éléonore; quita Ximena y máquina sin hunter', () => {
    const items = [
      { id: 'c', origin: 'community' as const },
      { id: 'k', origin: 'machine' as const, author: { hunter: { code: 'kai' } } },
      { id: 'e', origin: 'machine' as const, author: { hunter: { code: 'eleonore' } } },
      { id: 'x', origin: 'machine' as const, author: { hunter: { code: 'ximena' } } },
      { id: 'n', origin: 'machine' as const, author: null },
    ];
    expect(excludeMachineOffers(items).map((i) => i.id)).toEqual(['c', 'k', 'e']);
  });
});
