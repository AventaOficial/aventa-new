import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OFFER_CARD_DESCRIPTION_MAX_LENGTH } from '@/app/components/OfferCard';
import { createOfferInputSchema, OFFER_DESCRIPTION_MAX } from '@/lib/contracts/offers';
import { formatOfferMoneyInput, formatPriceMXN } from '@/lib/formatPrice';
import { normalizeCategoryForStorage } from '@/lib/categories';
import { scoreCategoryPolicy } from '@/lib/discovery/categoryPolicies';
import { isOfferExpiredByExpiresAt } from '@/lib/votes/offerVoteEligibility';

describe('OfferCard product quality', () => {
  const cardSrc = readFileSync(join(process.cwd(), 'app/components/OfferCard.tsx'), 'utf8');

  it('renders short description with line-clamp (desktop)', () => {
    expect(OFFER_CARD_DESCRIPTION_MAX_LENGTH).toBe(80);
    expect(cardSrc).toContain('shortDescription');
    expect(cardSrc).toContain('line-clamp-2');
    expect(cardSrc).toContain('OFFER_CARD_DESCRIPTION_MAX_LENGTH');
  });

  it('removes feed commission disclosure from OfferCard', () => {
    expect(cardSrc).not.toContain('AffiliateDisclosure');
    expect(cardSrc).not.toMatch(/AVENTA puede recibir una comisión/);
  });

  it('expired offers remain navigable (archive ≠ inaccessible)', () => {
    expect(cardSrc).toContain("behavior: 'archive'");
    expect(cardSrc).toContain("ctaLabel: 'Ver oferta'");
    expect(cardSrc).toMatch(/statusConfig\.behavior === 'archive'/);
  });
});

describe('expired offer page accessibility', () => {
  const pageSrc = readFileSync(join(process.cwd(), 'app/oferta/[id]/page.tsx'), 'utf8');
  const contentSrc = readFileSync(
    join(process.cwd(), 'app/oferta/[id]/OfferPageContent.tsx'),
    'utf8',
  );

  it('loads approved offers without requiring expires_at >= now', () => {
    expect(pageSrc).toContain(".eq('status', 'approved')");
    expect(pageSrc).not.toMatch(/expires_at\.is\.null,expires_at\.gte/);
    expect(pageSrc).toContain('isOfferExpiredByExpiresAt');
    expect(pageSrc).toContain('isExpired');
  });

  it('marks expired clearly without treating as active', () => {
    expect(contentSrc).toContain('Oferta expirada');
    expect(contentSrc).toContain('offer.isExpired');
    expect(contentSrc).toContain("'Ver oferta'");
  });

  it('lifecycle helper: expired ≠ active feed eligibility', () => {
    const now = Date.parse('2026-09-20T12:00:00.000Z');
    expect(isOfferExpiredByExpiresAt('2026-09-19T12:00:00.000Z', now)).toBe(true);
    expect(isOfferExpiredByExpiresAt('2026-09-21T12:00:00.000Z', now)).toBe(false);
    expect(isOfferExpiredByExpiresAt(null, now)).toBe(false);
  });
});

describe('description required (schema authority)', () => {
  it('exige descripción no vacía y respeta OFFER_DESCRIPTION_MAX', () => {
    expect(OFFER_DESCRIPTION_MAX).toBe(300);
    const missing = createOfferInputSchema.safeParse({
      title: 'Producto',
      store: 'Amazon',
      image_url: 'https://example.com/a.jpg',
      description: '',
      price: 100,
    });
    expect(missing.success).toBe(false);

    const ok = createOfferInputSchema.safeParse({
      title: 'Producto',
      store: 'Amazon',
      image_url: 'https://example.com/a.jpg',
      description: 'Buena oferta con evidencia',
      price: 100,
    });
    expect(ok.success).toBe(true);
  });

  it('ActionBar marks description required', () => {
    const src = readFileSync(join(process.cwd(), 'app/components/ActionBar.tsx'), 'utf8');
    expect(src).toContain('Descripción *');
    expect(src).toContain('Descripción requerida');
    expect(src).toContain('OFFER_DESCRIPTION_MAX');
  });
});

describe('price formatting thousands', () => {
  it('formatOfferMoneyInput / formatPriceMXN use thousands separators', () => {
    expect(formatOfferMoneyInput(19999)).toMatch(/19[,.]999/);
    expect(formatPriceMXN(19999)).toMatch(/19[,.]999/);
  });
});

describe('category normalization + perfume soft ranking', () => {
  it('normalizes belleza', () => {
    expect(normalizeCategoryForStorage('Belleza')).toBe('belleza');
  });

  it('perfume brand alone does not hard-reject; weak discount → no boost', () => {
    const weak = scoreCategoryPolicy({
      category: 'belleza',
      title: 'Lattafa Asad EDP 100ml',
      discountPercent: 5,
      price: 800,
    });
    expect(weak.matchedBrand).toBe('lattafa');
    expect(weak.multiplier).toBeLessThanOrEqual(1);
    expect(weak.reasons).toContain('weak_discount_no_boost');
  });

  it('perfume + strong discount soft-boosts', () => {
    const strong = scoreCategoryPolicy({
      category: 'belleza',
      title: 'Lattafa Asad Eau de Parfum',
      discountPercent: 35,
      price: 899,
    });
    expect(strong.matchedBrand).toBe('lattafa');
    expect(strong.multiplier).toBeGreaterThan(1);
  });
});

describe('moderation author avatar', () => {
  it('ModerationOfferCard / Detail render circular avatar with bot fallback', () => {
    const card = readFileSync(
      join(process.cwd(), 'app/admin/components/ModerationOfferCard.tsx'),
      'utf8',
    );
    const detail = readFileSync(
      join(process.cwd(), 'app/admin/components/ModerationOfferDetail.tsx'),
      'utf8',
    );
    expect(card).toContain('authorAvatarUrl');
    expect(card).toContain('rounded-full');
    expect(card).toContain('BOT_AUTHOR_DISPLAY_NAME');
    expect(detail).toContain('authorAvatarUrl');
    expect(detail).toContain('BOT_AUTHOR_DISPLAY_NAME');
    expect(detail).toContain('isBotUserId');
  });
});
