import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appendOffersById, refreshFeedWithoutDroppingPages } from '@/lib/offers/feedList';
import { planPublicFeedTakedown } from '@/lib/moderation/feedTakedown';

const read = (path: string) => readFileSync(path, 'utf8');

describe('retiro público del feed', () => {
  it('approved y published se retiran; pending desde el feed se rechaza', () => {
    expect(planPublicFeedTakedown({ surface: 'feed', nextStatus: 'rejected', previousStatus: 'approved' })).toEqual({
      action: 'takedown',
    });
    expect(planPublicFeedTakedown({ surface: 'feed', nextStatus: 'rejected', previousStatus: 'published' })).toEqual({
      action: 'takedown',
    });
    expect(planPublicFeedTakedown({ surface: 'feed', nextStatus: 'rejected', previousStatus: 'pending' })).toMatchObject({
      action: 'reject',
      httpStatus: 409,
    });
    expect(planPublicFeedTakedown({ surface: 'queue', nextStatus: 'rejected', previousStatus: 'pending' })).toEqual({
      action: 'not-feed',
    });
  });

  it('la ruta persiste el rechazo, invalida la caché y no borra la fila', () => {
    const route = read('app/api/admin/moderate-offer/route.ts');
    expect(route).toContain('planPublicFeedTakedown');
    expect(route).toContain('requireModerationActor');
    expect(route).toContain(".in('status', ['approved', 'published'])");
    expect(route).toContain('rejection_reason');
    expect(route).toContain('moderation_logs');
    expect(route).toContain('await invalidateHomeFeedCache()');
    expect(route).toContain('No se pudo retirar la oferta del feed.');
    expect(route).not.toContain('.delete(');
    const expire = read('app/api/admin/expire-offer/route.ts');
    expect(expire).toContain('requireModerationActor');
    expect(expire).toContain('invalidateHomeFeedCache');
  });

  it('el cliente solo quita la tarjeta después de la confirmación del servidor', () => {
    const action = read('app/components/moderation/FeedModerationAction.tsx');
    const okBranch = action.slice(action.indexOf('if (!res.ok)'));
    expect(okBranch.indexOf('onRemoved()')).toBeGreaterThan(okBranch.indexOf('return;'));
    expect(read('app/page.tsx')).not.toContain('removedFromFeed');
  });

  it('el refresco saca la oferta de la primera página y conserva el resto vigente', () => {
    const refreshed = refreshFeedWithoutDroppingPages(
      [
        { id: 'gone', title: 'retirada' },
        { id: 'b', title: 'viejo' },
        { id: 'c', title: 'página 2' },
      ],
      [
        { id: 'b', title: 'nuevo' },
        { id: 'd', title: 'entra' },
      ],
    );
    expect(refreshed.map((row) => row.id)).toEqual(['b', 'd', 'c']);
    expect(refreshed[0]).toMatchObject({ title: 'nuevo' });
    expect(refreshFeedWithoutDroppingPages([{ id: 'a' }, { id: 'tail' }], [])).toEqual([]);
    const paged = appendOffersById(refreshed, [{ id: 'c' }, { id: 'e' }]);
    expect(paged.map((row) => row.id)).toEqual(['b', 'd', 'c', 'e']);
  });

  it('el copy comunitario no promete publicar ofertas al instante', () => {
    expect(read('app/components/ReputationBar.tsx')).not.toMatch(/ofertas también se publican al instante/);
    expect(read('app/descubre/guides/content.ts')).not.toMatch(/publicarse al instante|salvo auto-aprobación/);
    expect(read('lib/rewards/onboarding.ts')).toMatch(/Las ofertas siempre quedan en revisión/);
    expect(read('app/me/recompensas/page.tsx')).toContain('rewardsHeroCopy');
  });
});
