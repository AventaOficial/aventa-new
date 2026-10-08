import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appendOffersById, refreshFeedWithoutDroppingPages } from '@/lib/offers/feedList';
import { getRetailerPresentation } from '@/lib/stores/storeBrand';
import { assessOfferReportText, offerReportRateIdentity } from '@/lib/reports/offerReportContract';

describe('retailer presentation', () => {
  it('resuelve las tiendas prioritarias y un fallback', () => {
    expect(getRetailerPresentation('Amazon').logo).toBe('/stores/amazon.svg');
    expect(getRetailerPresentation('Mercado Libre').key).toBe('mercado_libre');
    expect(getRetailerPresentation('Costco').logo).toBe('/stores/costco.svg');
    expect(getRetailerPresentation('Soriana').logo).toBe('/stores/soriana.svg');
    expect(getRetailerPresentation('Chedraui').logo).toBe('/stores/chedraui.svg');
    const unknown = getRetailerPresentation('Tienda local');
    expect(unknown.key).toBe('unknown');
    expect(unknown.logo).toBeNull();
    expect(unknown.fallback.length).toBeGreaterThan(0);
  });
});

describe('feed append', () => {
  it('agrega sin duplicar por id y un refresco no tira la cola', () => {
    const first = [{ id: 'a' }, { id: 'b' }];
    const page = appendOffersById(first, [{ id: 'b' }, { id: 'c' }]);
    expect(page.map((row) => row.id)).toEqual(['a', 'b', 'c']);
    const refreshed = refreshFeedWithoutDroppingPages(
      [{ id: 'a', title: 'viejo' }, { id: 'b' }, { id: 'c' }],
      [{ id: 'a', title: 'nuevo' }, { id: 'b' }],
    );
    expect(refreshed.map((row) => row.id)).toEqual(['a', 'b', 'c']);
    expect(refreshed[0]).toMatchObject({ title: 'nuevo' });
  });

  it('cargar más no sustituye el feed por el skeleton', () => {
    const page = readFileSync('app/page.tsx', 'utf8');
    const next = page.slice(page.indexOf('const fetchNextPage'));
    expect(next.slice(0, 900)).not.toContain('setLoading(true)');
    expect(page).toContain('appendOffersById');
    expect(page).not.toContain('scrollTo');
  });
});

describe('moderación desde el feed', () => {
  it('reutiliza moderate-offer, no borra y exige la sesión', () => {
    const route = readFileSync('app/api/admin/moderate-offer/route.ts', 'utf8');
    expect(route).toContain("body?.surface === 'feed'");
    expect(route).toContain("status: 'rejected'");
    expect(route).toContain('moderation_logs');
    expect(route).not.toContain('.delete(');
    const access = readFileSync('app/api/me/moderation-access/route.ts', 'utf8');
    expect(access).toContain('requireModerationActor');
    expect(access).not.toContain('body.role');
    const card = readFileSync('app/components/OfferCard.tsx', 'utf8');
    expect(card).toContain('canModerate');
    expect(card).toContain('FeedModerationAction');
  });
});

describe('reportes y guías', () => {
  it('el contrato de texto y la identidad del límite siguen por usuario', () => {
    expect(assessOfferReportText('a'.repeat(29)).ok).toBe(false);
    expect(assessOfferReportText('a'.repeat(30)).ok).toBe(true);
    expect(assessOfferReportText('a'.repeat(500)).ok).toBe(true);
    expect(assessOfferReportText('a'.repeat(501)).ok).toBe(false);
    expect(offerReportRateIdentity('user-1')).toBe('user:user-1');
    const sql = readFileSync('docs/supabase-migrations/20261007_offer_reports_reporter_offer_unique.sql', 'utf8');
    expect(sql).toContain('offer_reports_reporter_offer_uidx');
  });

  it('las guías públicas no son placeholders y sus destinos existen', () => {
    const content = readFileSync('app/descubre/guides/content.ts', 'utf8');
    expect(content).not.toMatch(/próximamente|lorem ipsum|TODO:/i);
    expect(content).toContain('/me/recompensas');
    for (const href of ['/', '/me/favorites', '/settings', '/subir', '/me/nivel', '/me/recompensas']) {
      expect(content).toContain(href);
    }
    expect(readFileSync('app/guias/page.tsx', 'utf8')).toContain("redirect('/descubre')");
  });
});
