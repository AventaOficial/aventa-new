import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  MELI_LA_REQUIRED_REASON,
  validateAffiliatePaste,
} from '@/lib/affiliate/validateAffiliatePaste';
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

  it('ML con tag de plataforma en la URL larga no basta: pide el meli.la', () => {
    const pasted = applyPlatformAffiliateTags(ML_ORIGINAL);
    expect(pasted).toContain('tag=aventa_test_tag');
    const result = validateAffiliatePaste(ML_ORIGINAL, pasted);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe(MELI_LA_REQUIRED_REASON);
    expect(result.store).toBe('Mercado Libre');
  });

  it('acepta meli.la de ML aunque haya tags de plataforma en env, sin modificarlo', () => {
    const result = validateAffiliatePaste(ML_ORIGINAL, 'https://meli.la/2vWwBNv');
    expect(result.valid).toBe(true);
    expect(result.needsServerVerification).toBe(true);
    expect(result.normalizedUrl).toBe('https://meli.la/2vWwBNv');
  });

  it('rechaza productos diferentes', () => {
    const other = 'https://www.amazon.com.mx/dp/B0OTHERASI1';
    const pasted = applyPlatformAffiliateTags(other);
    const result = validateAffiliatePaste(AMZ_ORIGINAL, pasted);
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

  it('rechaza ML sin afiliado cuando el programa está configurado', () => {
    const result = validateAffiliatePaste(ML_ORIGINAL, ML_ORIGINAL);
    expect(result.valid).toBe(false);
    expect(result.affiliateTagged).toBe(false);
    expect(result.reason).toBe(MELI_LA_REQUIRED_REASON);
  });

  it('rechaza Amazon sin tag cuando el programa está configurado', () => {
    const result = validateAffiliatePaste(AMZ_ORIGINAL, AMZ_ORIGINAL);
    expect(result.valid).toBe(false);
    expect(result.productMatched).toBe(true);
    expect(result.affiliateTagged).toBe(false);
  });
});

describe('validateAffiliatePaste sin parámetros ML en env (meli.la manual)', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    delete process.env.ML_AFFILIATE_TAG;
    delete process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG;
    delete process.env.ML_MATT_TOOL;
    delete process.env.NEXT_PUBLIC_ML_MATT_TOOL;
    delete process.env.ML_MATT_WORD;
    delete process.env.NEXT_PUBLIC_ML_MATT_WORD;
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('acepta meli.la y lo deja tal cual para verificación en servidor', () => {
    const result = validateAffiliatePaste(ML_ORIGINAL, 'https://meli.la/2vWwBNv');
    expect(result.valid).toBe(true);
    expect(result.needsServerVerification).toBe(true);
    expect(result.normalizedUrl).toBe('https://meli.la/2vWwBNv');
  });

  it('rechaza la URL larga de ML sin afiliado y pide el meli.la', () => {
    const result = validateAffiliatePaste(ML_ORIGINAL, ML_ORIGINAL);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe(MELI_LA_REQUIRED_REASON);
  });

  it('rechaza meli.la para un producto de otra tienda', () => {
    const result = validateAffiliatePaste(AMZ_ORIGINAL, 'https://meli.la/2vWwBNv');
    expect(result.valid).toBe(false);
  });
});
