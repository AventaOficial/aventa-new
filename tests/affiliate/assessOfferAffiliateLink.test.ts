import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  assessOfferAffiliateLink,
  isPlatformAffiliateTagged,
  isResolvedProductOfferUrl,
} from '@/lib/affiliate/assessOfferAffiliateLink';
import { buildOfferUrl } from '@/lib/offerUrl';

const ML_PRODUCT = 'https://articulo.mercadolibre.com.mx/MLM-1234567890-1';
const ML_TAGGED = `${ML_PRODUCT}?tag=aventa_test_tag`;

describe('assessOfferAffiliateLink', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.ML_AFFILIATE_TAG = 'aventa_test_tag';
    process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG = 'aventa_test_tag';
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('detecta producto ML resuelto', () => {
    expect(isResolvedProductOfferUrl(ML_PRODUCT)).toBe(true);
  });

  it('marca enlace con tag como listo', () => {
    const status = assessOfferAffiliateLink(ML_TAGGED);
    expect(status.isProduct).toBe(true);
    expect(status.needsAffiliate).toBe(true);
    expect(status.isTagged).toBe(true);
  });

  it('marca enlace sin tag como pendiente', () => {
    const status = assessOfferAffiliateLink(ML_PRODUCT);
    expect(status.isProduct).toBe(true);
    expect(status.needsAffiliate).toBe(true);
    expect(status.isTagged).toBe(false);
  });
});

describe('buildOfferUrl plataforma Aventa', () => {
  beforeEach(() => {
    process.env.ML_AFFILIATE_TAG = 'aventa_site';
  });

  it('aplica tag de plataforma sin tag del creador', () => {
    const url = buildOfferUrl(ML_PRODUCT);
    expect(url).toContain('tag=aventa_site');
    expect(isPlatformAffiliateTagged(url)).toBe(true);
  });
});
