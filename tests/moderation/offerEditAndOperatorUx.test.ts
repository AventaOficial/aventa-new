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

  it('acepta price/original_price/coupons y audita edited', () => {
    expect(src).toContain('parseOfferEditMoney');
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
  it('desktop context hidden on mobile; action bar unchanged contract', () => {
    const ws = readFileSync(
      join(process.cwd(), 'app/components/moderation/ModerationFocusWorkspace.tsx'),
      'utf8'
    );
    expect(ws).toContain('FocusDesktopContext');
    expect(ws).toContain('ModerationFixSheet');
    expect(ws).toContain('data-focus-actions-bar');
    expect(ws).toContain('onApprove={() => void queue.approve()}');
    const desk = readFileSync(
      join(process.cwd(), 'app/components/moderation/FocusDesktopContext.tsx'),
      'utf8'
    );
    expect(desk).toMatch(/hidden md:flex/);
    expect(desk).toContain('data-focus-desktop-context');
  });

  it('OfferCard desktop ya no usa object-cover', () => {
    const card = readFileSync(join(process.cwd(), 'app/components/OfferCard.tsx'), 'utf8');
    expect(card).toContain('object-contain object-center');
    expect(card).not.toMatch(/object-contain md:object-cover/);
  });
});
