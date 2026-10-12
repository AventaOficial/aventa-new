import { describe, expect, it, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyVitalesFeedTransform,
  DIA_A_DIA_SCORE_CAP,
  limitConsecutiveMachineOffers,
  resolveHomeFeedPeriod,
} from '@/lib/offers/homeFeedClient';
import { mapOfferToCard, type FeedApiItemShape } from '@/lib/offers/transform';

const NOW = new Date('2026-10-11T12:00:00.000Z');

describe('Día a día con reglas de Despensa', () => {
  it('mantiene el contrato de la vista: mismo periodo y el score alto sigue fuera', () => {
    expect(resolveHomeFeedPeriod('vitales', 'day')).toBe('week');
    const list = [
      { id: 'top', title: 'Arroz 1 kg', discountPrice: 20, votes: { up: 0, down: 0, score: DIA_A_DIA_SCORE_CAP } },
      { id: 'ok', title: 'Arroz 1 kg', discountPrice: 20, votes: { up: 0, down: 0, score: 1 } },
    ];
    expect(applyVitalesFeedTransform(list, 10, 2, { now: NOW }).map((o) => o.id)).toEqual(['ok']);
  });

  it('pone primero las necesidades del catálogo y deja al final lo incompleto', () => {
    const list = [
      { id: 'gadget', title: 'Bocina', discountPrice: 500, votes: { up: 0, down: 0, score: 40 } },
      { id: 'sin_precio', title: 'Arroz 1 kg', discountPrice: 0, votes: { up: 0, down: 0, score: 60 } },
      { id: 'papel', title: 'Papel higiénico 12 rollos', discountPrice: 90, votes: { up: 0, down: 0, score: 1 } },
    ];
    expect(applyVitalesFeedTransform(list, 10, 2, { now: NOW }).map((o) => o.id)).toEqual(['papel', 'gadget', 'sin_precio']);
  });

  it('la API sigue pidiendo view=vitales', () => {
    const src = readFileSync(join(process.cwd(), 'lib/offers/homeFeedClient.ts'), 'utf8');
    expect(src).toMatch(/qs\.set\('view', params\.viewMode\)/);
    const page = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');
    expect(page).toMatch(/'Día a día'/);
  });
});

describe('Recientes con origen confiable', () => {
  const m = (id: string) => ({ id, origin: 'machine' as const });
  const c = (id: string) => ({ id, origin: 'community' as const });

  it('limita rachas de ofertas automáticas sin eliminar ninguna', () => {
    const list = [m('m1'), m('m2'), m('m3'), m('m4'), c('c1'), m('m5'), c('c2')];
    const out = limitConsecutiveMachineOffers(list, 2).map((o) => o.id);
    expect(out).toEqual(['m1', 'm2', 'c1', 'm3', 'm4', 'c2', 'm5']);
    expect([...out].sort()).toEqual(list.map((o) => o.id).sort());
  });

  it('conserva el orden de la comunidad y trata el origen ausente como comunidad', () => {
    const list = [c('c1'), { id: 'x', origin: null }, c('c2'), m('m1')];
    expect(limitConsecutiveMachineOffers(list).map((o) => o.id)).toEqual(['c1', 'x', 'c2', 'm1']);
  });

  describe('el origen se decide por id de autor, no por nombre visible', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('un usuario que se llama «Aventa Bot» sigue siendo comunidad en el origen', async () => {
      vi.stubEnv('BOT_INGEST_USER_ID', '11111111-1111-4111-8111-111111111111');
      vi.stubEnv('MCP_BOT_AUTHOR_USER_IDS', '');
      const { isBotUserId } = await import('@/lib/bots/ingest/isBotUserId');
      expect(isBotUserId('22222222-2222-4222-8222-222222222222')).toBe(false);
      expect(isBotUserId('11111111-1111-4111-8111-111111111111')).toBe(true);
      const src = readFileSync(join(process.cwd(), 'lib/offers/feedService.ts'), 'utf8');
      expect(src).toMatch(/origin: isBotUserId\(createdBy\) \? 'machine' : 'community'/);
    });
  });

  it('la card conserva el origen y el dominio, no la URL', () => {
    const card = mapOfferToCard({
      id: '1',
      title: 'Arroz 1 kg',
      price: 30,
      original_price: null,
      offer_url: 'https://www.walmart.com.mx/ip/123?ref=abc',
      created_at: NOW.toISOString(),
      score: 0,
      images: [],
      author: { display_name: 'Aventa Bot' },
      origin: 'community',
      expires_at: null,
    } as FeedApiItemShape);
    expect(card).toMatchObject({ origin: 'community', sourceHost: 'walmart.com.mx', offerUrl: '', dailyNeed: true, despensaNeedId: 'alimentos.arroz' });
  });
});
