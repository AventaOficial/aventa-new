import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildOfferEditDiff,
  isMaterialOfferEdit,
  parseOfferEditMoney,
  sanitizeOfferEditCoupons,
  sanitizeOfferEditDescription,
} from '@/lib/moderation/offerEditContract';

describe('offerEditContract', () => {
  it('parsea precios con comas de miles', () => {
    expect(parseOfferEditMoney('19,999.99')).toEqual({ ok: true, value: 19999.99 });
    expect(parseOfferEditMoney('1,000')).toEqual({ ok: true, value: 1000 });
  });

  it('parsea precios válidos y rechaza inválidos', () => {
    expect(parseOfferEditMoney('199.5')).toEqual({ ok: true, value: 199.5 });
    expect(parseOfferEditMoney(0)).toEqual({ ok: true, value: 0 });
    expect(parseOfferEditMoney(-1).ok).toBe(false);
    expect(parseOfferEditMoney('abc').ok).toBe(false);
  });

  it('sanitiza descripción sin HTML', () => {
    expect(sanitizeOfferEditDescription('  Hola <script>x</script> mundo  ')).toBe(
      'Hola x mundo'
    );
    expect(sanitizeOfferEditDescription('')).toBeNull();
    expect(sanitizeOfferEditCoupons('  CUPON10  ')).toBe('CUPON10');
  });

  it('detecta edits materiales', () => {
    expect(isMaterialOfferEdit(['title'])).toBe(false);
    expect(isMaterialOfferEdit(['price'])).toBe(true);
    expect(isMaterialOfferEdit(['offer_url', 'description'])).toBe(true);
  });

  it('diff ignora no-cambios', () => {
    const { fields, changes } = buildOfferEditDiff(
      { title: 'A', price: 10, description: 'x' },
      { title: 'A', price: 12, description: 'x' }
    );
    expect(fields).toEqual(['price']);
    expect(changes.price).toEqual({ from: 10, to: 12 });
  });
});

describe('update-offer edit surface', () => {
  const src = readFileSync(
    join(process.cwd(), 'app/api/admin/update-offer/route.ts'),
    'utf8'
  );

  it('acepta price/original_price/coupons/msi/bank_coupon y audita edited', () => {
    expect(src).toContain('parseOfferEditMoney');
    expect(src).toContain('parseOfferEditMsiMonths');
    expect(src).toContain('parseOfferEditBankCoupon');
    expect(src).toContain('sanitizeOfferEditDescription');
    expect(src).toContain("action: 'edited'");
    expect(src).toContain('isMaterialOfferEdit');
    expect(src).toContain("payload.status = 'pending'");
  });

  it('no aprueba al editar', () => {
    expect(src).not.toMatch(/status:\s*['"]approved['"]/);
  });
});

describe('Focus edit + desktop context + mobile intact', () => {
  it('el contexto de escritorio vive en la columna del workspace y la barra sigue en el flujo', () => {
    const ws = readFileSync(
      join(process.cwd(), 'app/components/moderation/ModerationFocusWorkspace.tsx'),
      'utf8'
    );
    expect(ws).toContain('FocusDesktopContext');
    expect(ws).toContain('ModerationFixSheet');
    expect(ws).toContain('data-focus-actions-bar');
    expect(ws).toContain('onApprove={() => void queue.approve()}');
    expect(ws).toContain('xl:grid-cols-');
    const desk = readFileSync(
      join(process.cwd(), 'app/components/moderation/FocusDesktopContext.tsx'),
      'utf8'
    );
    expect(desk).toMatch(/<aside/);
    expect(desk).toContain('data-focus-desktop-context');
  });

  it('OfferCard desktop ya no recorta la foto del producto', () => {
    const card = readFileSync(join(process.cwd(), 'app/components/OfferCard.tsx'), 'utf8');
    const media = readFileSync(join(process.cwd(), 'app/components/offers/OfferMedia.tsx'), 'utf8');
    expect(card).toContain('<OfferMedia');
    expect(card).not.toMatch(/object-contain md:object-cover/);
    expect(media).toContain('object-contain object-center');
    expect(media).toContain('isNextImageAllowedSrc');
    expect(media).not.toMatch(/object-contain md:object-cover/);
  });
});
