import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { assertOfferReadyForAffiliateApproval } from '@/lib/moderation/approveReadiness';

describe('assertOfferReadyForAffiliateApproval', () => {
  const mlUrl = 'https://articulo.mercadolibre.com.mx/MLM-1234567890-test';
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.ML_AFFILIATE_TAG = 'aventa_test_tag';
    process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG = 'aventa_test_tag';
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('rechaza approve sin link_mod_ok cuando requiere afiliado', () => {
    const result = assertOfferReadyForAffiliateApproval({
      offerUrl: mlUrl,
      linkModOk: false,
      batchApprove: false,
      originalProductUrl: mlUrl,
    });
    expect(result.ok).toBe(false);
  });

  it('permite approve después de validación', () => {
    const result = assertOfferReadyForAffiliateApproval({
      offerUrl: `${mlUrl}?tag=aventa_test_tag`,
      linkModOk: true,
      batchApprove: false,
      originalProductUrl: mlUrl,
    });
    expect(result.ok).toBe(true);
  });

  it('batch approve mantiene bypass documentado', () => {
    const result = assertOfferReadyForAffiliateApproval({
      offerUrl: mlUrl,
      linkModOk: false,
      batchApprove: true,
      originalProductUrl: mlUrl,
    });
    expect(result.ok).toBe(true);
  });
});
