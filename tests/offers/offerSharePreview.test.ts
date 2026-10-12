import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OFFER_SHARE_PREVIEW_STATUS, presentOfferSharePreview } from '@/lib/offers/offerSharePreview';

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

  it('el estado coincide con el que carga la página de detalle', () => {
    expect(OFFER_SHARE_PREVIEW_STATUS).toBe('approved');
    expect(read('app/oferta/[id]/page.tsx')).toContain(".eq('status', 'approved')");
  });
});

describe('opengraph-image de oferta', () => {
  const og = read('app/oferta/[id]/opengraph-image.tsx');

  it('ya no exige expires_at >= now', () => {
    expect(og).not.toMatch(/expires_at\.is\.null,expires_at\.gte/);
  });

  it('filtra por estado del detalle y excluye borradas en la consulta y en el helper', () => {
    expect(og).toContain('.eq(\'status\', OFFER_SHARE_PREVIEW_STATUS)');
    expect(og).toContain(".is('deleted_at', null)");
    expect(og).toContain('presentOfferSharePreview(row)');
    expect(og).toContain('const offer = preview.visible ? row : null;');
  });

  it('marca «Expirada» y normaliza &amp; en la foto', () => {
    expect(og).toContain('Expirada');
    expect(og).toContain('normalizeOfferImageUrl(offer?.image_url)');
  });
});
