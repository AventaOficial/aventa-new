import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { assertOfferReadyForAffiliateApproval } from '@/lib/moderation/approveReadiness';

describe('assertOfferReadyForAffiliateApproval (P1-1)', () => {
  const mlUrl = 'https://articulo.mercadolibre.com.mx/MLM-1234567890-test';
  const meliLa = 'https://meli.la/2vWwBNv';
  const amzUrl = 'https://www.amazon.com.mx/dp/B0TESTASI1';
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.ML_AFFILIATE_TAG = 'aventa_test_tag';
    process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG = 'aventa_test_tag';
    process.env.AMAZON_ASSOCIATE_TAG = 'aventa-20';
    delete process.env.ML_MATT_TOOL;
    delete process.env.NEXT_PUBLIC_ML_MATT_TOOL;
    delete process.env.ML_MATT_WORD;
    delete process.env.NEXT_PUBLIC_ML_MATT_WORD;
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('rechaza approve sin tag ni link_mod_ok cuando requiere afiliado', () => {
    const result = assertOfferReadyForAffiliateApproval({
      offerUrl: mlUrl,
      linkModOk: false,
      batchApprove: false,
      originalProductUrl: mlUrl,
    });
    expect(result.ok).toBe(false);
  });

  it('permite approve con URL tagged aunque link_mod_ok sea null (tienda con tag de entorno)', () => {
    const result = assertOfferReadyForAffiliateApproval({
      offerUrl: `${amzUrl}?tag=aventa-20`,
      linkModOk: null,
      batchApprove: false,
      originalProductUrl: amzUrl,
    });
    expect(result.ok).toBe(true);
  });

  it('ML con tag de entorno en la URL no basta para aprobar', () => {
    const result = assertOfferReadyForAffiliateApproval({
      offerUrl: `${mlUrl}?tag=aventa_test_tag`,
      linkModOk: null,
      batchApprove: false,
      originalProductUrl: mlUrl,
    });
    expect(result.ok).toBe(false);
  });

  it('permite approve después de validación (meli.la + link_mod_ok)', () => {
    const result = assertOfferReadyForAffiliateApproval({
      offerUrl: meliLa,
      linkModOk: true,
      batchApprove: false,
      originalProductUrl: mlUrl,
    });
    expect(result.ok).toBe(true);
  });

  it('P1-1 — batch approve NO bypassa readiness (untagged)', () => {
    const result = assertOfferReadyForAffiliateApproval({
      offerUrl: mlUrl,
      linkModOk: false,
      batchApprove: true,
      originalProductUrl: mlUrl,
    });
    expect(result.ok).toBe(false);
  });

  it('P1-1 — batch con meli.la confirmado pasa', () => {
    const result = assertOfferReadyForAffiliateApproval({
      offerUrl: meliLa,
      linkModOk: true,
      batchApprove: true,
      originalProductUrl: mlUrl,
    });
    expect(result.ok).toBe(true);
  });

  it('P1-1 — batch con link_mod_ok heredado sobre URL larga de ML no pasa', () => {
    const result = assertOfferReadyForAffiliateApproval({
      offerUrl: mlUrl,
      linkModOk: true,
      batchApprove: true,
      originalProductUrl: mlUrl,
    });
    expect(result.ok).toBe(false);
  });
});
