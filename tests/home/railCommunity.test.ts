import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { activeHuntersFromFeed } from '@/lib/community/feedHunters';

const author = (userId: string | null, username: string) => ({ username, userId, slug: null, avatar_url: null });

describe('activeHuntersFromFeed', () => {
  it('agrupa por cazador, ordena por ofertas y limita', () => {
    const hunters = activeHuntersFromFeed([
      { id: '1', author: author('u1', 'Ana') },
      { id: '2', author: author('u2', 'Beto') },
      { id: '3', author: author('u2', 'Beto') },
      { id: '4', author: author('u3', 'Carla') },
      { id: '5', author: author('u4', 'Dani') },
    ]);
    expect(hunters.map((h) => [h.name, h.offers])).toEqual([
      ['Beto', 2],
      ['Ana', 1],
      ['Carla', 1],
    ]);
  });

  it('excluye autores sin cuenta y ofertas de prueba', () => {
    expect(
      activeHuntersFromFeed([
        { id: '1', author: author(null, 'Bot') },
        { id: 'tester-1', author: author('u1', 'QA') },
        { id: '2', author: null },
      ]),
    ).toEqual([]);
  });
});

describe('RailCommunity', () => {
  const rail = readFileSync(join(process.cwd(), 'app/components/RailCommunity.tsx'), 'utf8');

  it('reúne pedidos de caza, conversaciones y cazadores con fuentes públicas existentes', () => {
    expect(rail).toContain("fetch('/api/plaza/requests?limit=12')");
    expect(rail).toContain("fetch('/api/plaza/discussions')");
    expect(rail).toContain('Pedidos de caza');
    expect(rail).toContain('En la Plaza');
    expect(rail).toContain('Cazadores en el feed');
  });

  it('conversaciones y cazadores no se pintan como tarjetas vacías', () => {
    expect(rail).toMatch(/discussions\.length > 0 \?/);
    expect(rail).toMatch(/hunters\.length > 0 \?/);
  });
});
