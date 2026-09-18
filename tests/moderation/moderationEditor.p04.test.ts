/**
 * P0.4 — Editor canónico: bank_coupon, precio derivado, MSI, safety.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildOfferEditDiff,
  deriveOfferEditDiscountPercent,
  isMaterialOfferEdit,
  parseOfferEditBankCoupon,
  parseOfferEditMoney,
  parseOfferEditMsiMonths,
} from '@/lib/moderation/offerEditContract';

function src(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('P0.4 bank_coupon edit contract', () => {
  it('1. bank_coupon valid', () => {
    expect(parseOfferEditBankCoupon('bbva')).toEqual({ ok: true, value: 'bbva' });
    expect(parseOfferEditBankCoupon('Banamex')).toEqual({ ok: true, value: 'banamex' });
  });

  it('2. bank_coupon null / empty', () => {
    expect(parseOfferEditBankCoupon(null)).toEqual({ ok: true, value: null });
    expect(parseOfferEditBankCoupon('')).toEqual({ ok: true, value: null });
  });

  it('3. bank_coupon invalid', () => {
    expect(parseOfferEditBankCoupon('not-a-bank').ok).toBe(false);
    expect(parseOfferEditBankCoupon(123).ok).toBe(false);
  });

  it('4. update-offer accepts bank_coupon + requireModeration', () => {
    const route = src('app/api/admin/update-offer/route.ts');
    expect(route).toContain('requireModeration');
    expect(route).toContain('parseOfferEditBankCoupon');
    expect(route).toContain('payload.bank_coupon');
    expect(route).toContain("action: 'edited'");
  });

  it('5–6. price / original_price parse', () => {
    expect(parseOfferEditMoney('26999')).toEqual({ ok: true, value: 26999 });
    expect(parseOfferEditMoney('abc').ok).toBe(false);
  });

  it('7. discount derivation only from price+original', () => {
    expect(deriveOfferEditDiscountPercent(7500, 10000)).toBe(25);
    expect(deriveOfferEditDiscountPercent(100, 100)).toBe(0);
    expect(deriveOfferEditDiscountPercent(120, 100)).toBe(0);
  });

  it('8–9. MSI edit valid/invalid', () => {
    expect(parseOfferEditMsiMonths(12)).toEqual({ ok: true, value: 12 });
    expect(parseOfferEditMsiMonths(null)).toEqual({ ok: true, value: null });
    expect(parseOfferEditMsiMonths(99).ok).toBe(false);
  });

  it('10. partial update: bank_coupon alone appears in diff', () => {
    const { fields } = buildOfferEditDiff(
      { bank_coupon: null, price: 10 },
      { bank_coupon: 'nu' }
    );
    expect(fields).toEqual(['bank_coupon']);
  });

  it('11. FixSheet double-submit lock + bank field', () => {
    const sheet = src('app/admin/components/ModerationFixSheet.tsx');
    expect(sheet).toContain('saveLockRef');
    expect(sheet).toContain('bank_coupon');
    expect(sheet).toContain('BANK_COUPON_OPTIONS');
    expect(sheet).toContain('Precio publicado');
    expect(sheet).toContain('Precio detectado');
  });

  it('12. audit trail edited still present', () => {
    expect(src('app/api/admin/update-offer/route.ts')).toContain("action: 'edited'");
  });

  it('13. session continuity: FixSheet closes without claimNext', () => {
    const ws = src('app/components/moderation/ModerationFocusWorkspace.tsx');
    expect(ws).toContain('queue.applyOfferEditResult');
    expect(ws).toContain('bank_coupon: queue.offer.bank_coupon');
    const hook = src('lib/hooks/useModerationFocusQueue.ts');
    expect(hook).toContain('bank_coupon');
  });

  it('14. pending remains pending after correction (no approve in update-offer)', () => {
    const route = src('app/api/admin/update-offer/route.ts');
    expect(route).not.toMatch(/status:\s*['"]approved['"]/);
    expect(route).toMatch(/demoted|pending/);
    const { fields } = buildOfferEditDiff(
      { bank_coupon: null, price: 10, title: 'a', offer_url: 'https://x.test/a' },
      { bank_coupon: 'bbva' }
    );
    expect(fields).toEqual(['bank_coupon']);
    expect(isMaterialOfferEdit(fields)).toBe(false);
  });

  it('15–17. no money / Supply WRITE / DI mutation in update-offer', () => {
    const route = src('app/api/admin/update-offer/route.ts');
    expect(route).not.toMatch(/ledger|rewards|payout|settlement/i);
    expect(route).not.toMatch(/supply.*write|writeOffers|autoApprove|autoPublish/i);
    expect(route).not.toMatch(/dealIntelligence|deal_intelligence/i);
    expect(route).not.toMatch(/status:\s*['"]approved['"]/);
  });

  it('Focus shows MSI and bank_coupon separately (no stacking)', () => {
    const stage = src('app/components/moderation/FocusOfferStage.tsx');
    expect(stage).toContain('formatMsiCardLabel');
    expect(stage).toContain('formatCupónBancarioDisplay');
    expect(stage).not.toMatch(/effectivePrice|precio efectivo/i);
  });
});
