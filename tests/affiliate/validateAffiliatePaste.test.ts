import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { validateAffiliatePaste } from '@/lib/affiliate/validateAffiliatePaste';
import { applyPlatformAffiliateTags } from '@/lib/affiliate/applyPlatformAffiliateTags';

const ML_ORIGINAL = 'https://articulo.mercadolibre.com.mx/MLM-1234567890-test';
const AMZ_ORIGINAL = 'https://www.amazon.com.mx/dp/B0TESTASI1';

describe('validateAffiliatePaste', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.ML_AFFILIATE_TAG = 'aventa_test_tag';
    process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG = 'aventa_test_tag';
    process.env.AMAZON_ASSOCIATE_TAG = 'aventa-20';
    process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG = 'aventa-20';
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('acepta mismo producto ML con tag Aventa', () => {
    const pasted = applyPlatformAffiliateTags(ML_ORIGINAL);
    const result = validateAffiliatePaste(ML_ORIGINAL, pasted);
    expect(result.valid).toBe(true);
    expect(result.productMatched).toBe(true);
    expect(result.affiliateTagged).toBe(true);
    expect(result.store).toBe('Mercado Libre');
  });

  it('rechaza productos diferentes', () => {
    const other = 'https://articulo.mercadolibre.com.mx/MLM-9999999999-other';
    const pasted = applyPlatformAffiliateTags(other);
    const result = validateAffiliatePaste(ML_ORIGINAL, pasted);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('El enlace no corresponde al producto');
  });

  it('rechaza tienda diferente', () => {
    const pasted = applyPlatformAffiliateTags(AMZ_ORIGINAL);
    const result = validateAffiliatePaste(ML_ORIGINAL, pasted);
    expect(result.valid).toBe(false);
  });

  it('rechaza URL no HTTPS', () => {
    const pasted = `http://articulo.mercadolibre.com.mx/MLM-1234567890-test?tag=aventa_test_tag`;
    const result = validateAffiliatePaste(ML_ORIGINAL, pasted);
    expect(result.valid).toBe(false);
  });

  it('rechaza tag incorrecto en Amazon', () => {
    const pasted = `${AMZ_ORIGINAL}?tag=wrong-tag-20`;
    const result = validateAffiliatePaste(AMZ_ORIGINAL, pasted);
    expect(result.valid).toBe(false);
    expect(result.affiliateTagged).toBe(false);
  });

  it('acepta tag correcto en Amazon', () => {
    const pasted = applyPlatformAffiliateTags(AMZ_ORIGINAL);
    const result = validateAffiliatePaste(AMZ_ORIGINAL, pasted);
    expect(result.valid).toBe(true);
    expect(result.store).toBe('Amazon');
  });

  it('rechaza URL malformada', () => {
    const result = validateAffiliatePaste(ML_ORIGINAL, 'not-a-url');
    expect(result.valid).toBe(false);
  });

  it('rechaza ML sin tag cuando el programa está configurado', () => {
    const result = validateAffiliatePaste(ML_ORIGINAL, ML_ORIGINAL);
    expect(result.valid).toBe(false);
    expect(result.productMatched).toBe(true);
    expect(result.affiliateTagged).toBe(false);
  });
});
