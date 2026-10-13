import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  assessOfferAffiliateLink,
  isPlatformAffiliateTagged,
  isResolvedProductOfferUrl,
} from '@/lib/affiliate/assessOfferAffiliateLink';
import { applyPlatformAffiliateTags } from '@/lib/affiliate/applyPlatformAffiliateTags';
import { buildOfferUrl } from '@/lib/offerUrl';

const ML_PRODUCT = 'https://articulo.mercadolibre.com.mx/MLM-1234567890-1';
const ML_TAGGED = `${ML_PRODUCT}?tag=aventa_test_tag`;
const AMZ_PRODUCT = 'https://www.amazon.com.mx/dp/B0TESTASI1';
const MELI_LA = 'https://meli.la/2vWwBNv';

describe('assessOfferAffiliateLink', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.ML_AFFILIATE_TAG = 'aventa_test_tag';
    process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG = 'aventa_test_tag';
    process.env.AMAZON_ASSOCIATE_TAG = 'aventa-20';
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('detecta producto ML resuelto', () => {
    expect(isResolvedProductOfferUrl(ML_PRODUCT)).toBe(true);
  });

  it('ML con tag de plataforma en la URL no cuenta como afiliado verificado', () => {
    const status = assessOfferAffiliateLink(ML_TAGGED);
    expect(status.isProduct).toBe(true);
    expect(status.needsAffiliate).toBe(true);
    expect(status.isTagged).toBe(false);
    expect(isPlatformAffiliateTagged(MELI_LA)).toBe(false);
  });

  it('marca enlace con tag como listo en tiendas con tag de entorno', () => {
    const status = assessOfferAffiliateLink(`${AMZ_PRODUCT}?tag=aventa-20`);
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
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.ML_AFFILIATE_TAG = 'aventa_site';
    process.env.ML_MATT_TOOL = '97583635';
    process.env.ML_MATT_WORD = 'aventa';
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('aplica tag de plataforma sin tag del creador en URL larga', () => {
    const url = buildOfferUrl(ML_PRODUCT);
    expect(url).toContain('tag=aventa_site');
  });

  it('publica el meli.la verificado tal cual, sin agregar parámetros', () => {
    expect(applyPlatformAffiliateTags(MELI_LA)).toBe(MELI_LA);
    expect(buildOfferUrl(MELI_LA)).toBe(MELI_LA);
  });
});
