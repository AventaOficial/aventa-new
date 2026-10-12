import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PUBLIC_OFFER_DETAIL_STATUSES,
  isPublicOfferDetailStatus,
  presentOfferSharePreview,
} from '@/lib/offers/offerSharePreview';
import { VOTABLE_OFFER_STATUSES } from '@/lib/votes/offerVoteEligibility';

const NOW = Date.parse('2026-10-12T12:00:00.000Z');
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('presentOfferSharePreview — misma visibilidad que el detalle', () => {
  it('aprobada vigente ⇒ visible, no expirada', () => {
    expect(
      presentOfferSharePreview({ status: 'approved', deleted_at: null, expires_at: '2026-10-20T00:00:00Z' }, NOW),
    ).toEqual({ visible: true, expired: false });
  });

  it('aprobada caducada (bots a 7 días) ⇒ visible y marcada expirada', () => {
    expect(
      presentOfferSharePreview({ status: 'approved', deleted_at: null, expires_at: '2026-10-01T00:00:00Z' }, NOW),
    ).toEqual({ visible: true, expired: true });
  });

  it('sin expires_at ⇒ visible, no expirada', () => {
    expect(presentOfferSharePreview({ status: 'approved' }, NOW)).toEqual({ visible: true, expired: false });
  });

  it.each(['pending', 'rejected', 'withdrawn', 'removed', 'draft', '', null])(
    'status %s ⇒ no visible',
    (status) => {
      expect(presentOfferSharePreview({ status, deleted_at: null, expires_at: null }, NOW)).toEqual({ visible: false });
    },
  );

  it('borrada (deleted_at) ⇒ no visible aunque esté aprobada', () => {
    expect(
      presentOfferSharePreview({ status: 'approved', deleted_at: '2026-10-02T00:00:00Z', expires_at: null }, NOW),
    ).toEqual({ visible: false });
  });

  it('sin fila ⇒ no visible', () => {
    expect(presentOfferSharePreview(null, NOW)).toEqual({ visible: false });
  });

  it('published vigente ⇒ visible (lo que el feed muestra, el detalle lo abre)', () => {
    expect(
      presentOfferSharePreview({ status: 'published', deleted_at: null, expires_at: '2026-10-20T00:00:00Z' }, NOW),
    ).toEqual({ visible: true, expired: false });
  });

  it('los estados públicos del detalle son los mismos que feed y votos', () => {
    expect([...PUBLIC_OFFER_DETAIL_STATUSES].sort()).toEqual(['approved', 'published']);
    expect(PUBLIC_OFFER_DETAIL_STATUSES).toEqual(VOTABLE_OFFER_STATUSES);
    expect(isPublicOfferDetailStatus('published')).toBe(true);
    expect(isPublicOfferDetailStatus('pending')).toBe(false);
    expect(read('lib/offers/feedService.ts')).toMatch(/approved.*published|published.*approved/s);
  });

  it('la página de detalle filtra por los estados públicos, no solo approved', () => {
    const page = read('app/oferta/[id]/page.tsx');
    expect(page).toContain(".in('status', [...PUBLIC_OFFER_DETAIL_STATUSES])");
    expect(page).not.toContain(".eq('status', 'approved')");
  });
});

describe('opengraph-image de oferta', () => {
  const og = read('app/oferta/[id]/opengraph-image.tsx');

  it('ya no exige expires_at >= now', () => {
    expect(og).not.toMatch(/expires_at\.is\.null,expires_at\.gte/);
  });

  it('filtra por estado del detalle y excluye borradas en la consulta y en el helper', () => {
    expect(og).toContain(".in('status', [...PUBLIC_OFFER_DETAIL_STATUSES])");
    expect(og).toContain(".is('deleted_at', null)");
    expect(og).toContain('presentOfferSharePreview(row)');
    expect(og).toContain('const offer = preview.visible ? row : null;');
  });

  it('marca «Expirada» y normaliza &amp; en la foto', () => {
    expect(og).toContain('Expirada');
    expect(og).toContain('normalizeOfferImageUrl(offer?.image_url)');
  });
});
