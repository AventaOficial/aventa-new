import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  affiliatePasteValidationBaseline,
  focusClaimOriginalRefValue,
  focusOriginalProductUrlForRequest,
  originalOfferUrlToPersistOnAffiliatePaste,
} from '@/lib/moderation/originalOfferUrlPolicy';
import { assertOfferReadyForAffiliateApproval } from '@/lib/moderation/approveReadiness';

const MONETIZED =
  'https://articulo.mercadolibre.com.mx/MLM-1234567890-x_JM?matt_tool=1&tag=aventa_test';
const TRUSTED_ORIGINAL = 'https://articulo.mercadolibre.com.mx/MLM-1234567890-x_JM';
const EXISTING_ORIGINAL = 'https://www.amazon.com.mx/dp/B0TESTORIGINAL';

describe('originalOfferUrlPolicy — affiliate paste (CASOS A–C)', () => {
  it('CASO A: NULL + offer monetizada → no persistir original', () => {
    const toPersist = originalOfferUrlToPersistOnAffiliatePaste({
      existingOriginal: null,
      bodyOriginalProductUrl: undefined,
    });
    expect(toPersist).toBeNull();

    const baseline = affiliatePasteValidationBaseline({
      existingOriginal: null,
      bodyOriginalProductUrl: undefined,
      currentOfferUrl: MONETIZED,
    });
    expect(baseline).toBe(MONETIZED);
  });

  it('CASO B: original existente → no sobrescribir (payload omite campo)', () => {
    const toPersist = originalOfferUrlToPersistOnAffiliatePaste({
      existingOriginal: EXISTING_ORIGINAL,
      bodyOriginalProductUrl: TRUSTED_ORIGINAL,
    });
    expect(toPersist).toBeNull();
  });

  it('CASO C: original_product_url confiable + existing NULL → puede persistirse', () => {
    const toPersist = originalOfferUrlToPersistOnAffiliatePaste({
      existingOriginal: null,
      bodyOriginalProductUrl: TRUSTED_ORIGINAL,
    });
    expect(toPersist).toBe(TRUSTED_ORIGINAL);
  });

  it('currentOfferUrl nunca se usa como fuente de persistencia', () => {
    // Sin body: aunque haya currentOfferUrl en baseline, persist queda null.
    expect(
      originalOfferUrlToPersistOnAffiliatePaste({
        existingOriginal: '',
        bodyOriginalProductUrl: '   ',
      })
    ).toBeNull();
  });
});

describe('originalOfferUrlPolicy — Focus claim (CASOS D–E)', () => {
  it('CASO D: original NULL → ref no usa offer_url', () => {
    expect(focusClaimOriginalRefValue(null)).toBeNull();
    expect(focusClaimOriginalRefValue(undefined)).toBeNull();
    expect(focusClaimOriginalRefValue('')).toBeNull();
    // El claim no recibe offer_url en esta función a propósito.
    expect(
      focusOriginalProductUrlForRequest({
        originalOfferUrl: null,
        refOriginal: null,
      })
    ).toBeUndefined();
  });

  it('CASO E: original existente → se conserva en ref y request', () => {
    expect(focusClaimOriginalRefValue(EXISTING_ORIGINAL)).toBe(EXISTING_ORIGINAL);
    expect(
      focusOriginalProductUrlForRequest({
        originalOfferUrl: EXISTING_ORIGINAL,
        refOriginal: null,
      })
    ).toBe(EXISTING_ORIGINAL);
    expect(
      focusOriginalProductUrlForRequest({
        originalOfferUrl: null,
        refOriginal: EXISTING_ORIGINAL,
      })
    ).toBe(EXISTING_ORIGINAL);
  });
});

describe('affiliate gate sin regresión (CASO F)', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.ML_AFFILIATE_TAG = 'aventa_test_tag';
    process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG = 'aventa_test_tag';
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('bloquea approve sin link_mod_ok cuando hay programa', () => {
    const result = assertOfferReadyForAffiliateApproval({
      offerUrl: MONETIZED,
      linkModOk: false,
      originalProductUrl: undefined,
    });
    expect(result.ok).toBe(false);
  });

  it('permite approve con link_mod_ok cuando hay programa', () => {
    const result = assertOfferReadyForAffiliateApproval({
      offerUrl: MONETIZED,
      linkModOk: true,
      originalProductUrl: TRUSTED_ORIGINAL,
    });
    expect(result.ok).toBe(true);
  });

  it('permite publicación sin programa (política actual)', () => {
    delete process.env.ML_AFFILIATE_TAG;
    delete process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG;
    delete process.env.ML_MATT_TOOL;
    delete process.env.NEXT_PUBLIC_ML_MATT_TOOL;
    const result = assertOfferReadyForAffiliateApproval({
      offerUrl: 'https://articulo.mercadolibre.com.mx/MLM-1',
      linkModOk: false,
      originalProductUrl: undefined,
    });
    expect(result.ok).toBe(true);
  });
});
