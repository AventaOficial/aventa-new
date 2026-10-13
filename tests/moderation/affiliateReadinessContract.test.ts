import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  evaluateAffiliateReadiness,
  shouldPersistLinkModOk,
} from '@/lib/moderation/affiliateReadinessContract';
import { assertOfferReadyForAffiliateApproval } from '@/lib/moderation/approveReadiness';
import { computeMonetizationReadiness } from '@/lib/moderation/monetizationReadiness';

const NAV = 'https://articulo.mercadolibre.com.mx/MLM-1234567890-test-product';
const BARE = 'https://www.mercadolibre.com.mx/MLM1234567890';
const MELI_LA = 'https://meli.la/2vWwBNv';
const TAG = 'aventa_test_tag';
const AMZ = 'https://www.amazon.com.mx/dp/B0TESTASI1';
const AMZ_TAG = 'aventa-20';
const AMZ_TAGGED = `${AMZ}?tag=${AMZ_TAG}`;

describe('affiliate readiness contract (canonical)', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.ML_AFFILIATE_TAG = TAG;
    process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG = TAG;
    process.env.ML_MATT_TOOL = '97583635';
    process.env.ML_MATT_WORD = 'aventa';
    process.env.AMAZON_ASSOCIATE_TAG = AMZ_TAG;
    delete process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG;
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('A. tagged + canonical → READY (sin link_mod_ok)', () => {
    const r = evaluateAffiliateReadiness({
      offerUrl: AMZ_TAGGED,
      originalOfferUrl: AMZ,
      linkModOk: null,
    });
    expect(r.ready).toBe(true);
    expect(r.source).toBe('platform_tagged');
    expect(assertOfferReadyForAffiliateApproval({
      offerUrl: AMZ_TAGGED,
      linkModOk: null,
      originalProductUrl: AMZ,
    }).ok).toBe(true);
  });

  it('A2. ML con tag/matt_* de plataforma en la URL → NOT READY (los parámetros no certifican cuenta)', () => {
    const tagged = `${NAV}?tag=${TAG}&matt_word=aventa&matt_tool=97583635`;
    const r = evaluateAffiliateReadiness({ offerUrl: tagged, originalOfferUrl: NAV, linkModOk: null });
    expect(r.ready).toBe(false);
    expect(r.reason).toBe('missing_affiliate_tag');
    expect(
      assertOfferReadyForAffiliateApproval({ offerUrl: tagged, linkModOk: null, originalProductUrl: NAV }).ok
    ).toBe(false);
  });

  it('B. tagged + bare/non-canonical → NOT READY', () => {
    const r = evaluateAffiliateReadiness({
      offerUrl: `${BARE}?tag=${TAG}`,
      linkModOk: true,
    });
    expect(r.ready).toBe(false);
    expect(r.reason).toBe('non_navigable');
  });

  it('C. untagged → NOT READY', () => {
    const r = evaluateAffiliateReadiness({
      offerUrl: NAV,
      linkModOk: false,
    });
    expect(r.ready).toBe(false);
    expect(r.reason).toBe('missing_affiliate_tag');
  });

  it('D. missing operative URL with program on original → NOT READY missing_url', () => {
    const r = evaluateAffiliateReadiness({
      offerUrl: null,
      originalOfferUrl: NAV,
      linkModOk: null,
    });
    expect(r.ready).toBe(false);
    expect(r.reason).toBe('missing_url');
  });

  it('E. link_mod_ok=true + meli.la verificado → READY', () => {
    const r = evaluateAffiliateReadiness({
      offerUrl: MELI_LA,
      originalOfferUrl: NAV,
      linkModOk: true,
    });
    expect(r.ready).toBe(true);
    expect(r.source).toBe('moderator_confirmed');
  });

  it('E2. link_mod_ok=true heredado sobre URL larga de ML → NOT READY', () => {
    const r = evaluateAffiliateReadiness({
      offerUrl: NAV,
      originalOfferUrl: NAV,
      linkModOk: true,
    });
    expect(r.ready).toBe(false);
    expect(r.reason).toBe('needs_moderator_confirmation');
    expect(
      assertOfferReadyForAffiliateApproval({ offerUrl: NAV, linkModOk: true, originalProductUrl: NAV }).ok
    ).toBe(false);
  });

  it('E3. link_mod_ok=true en tienda no-ML con programa → READY', () => {
    const r = evaluateAffiliateReadiness({ offerUrl: AMZ, originalOfferUrl: AMZ, linkModOk: true });
    expect(r.ready).toBe(true);
    expect(r.source).toBe('moderator_confirmed');
  });

  it('F. link_mod_ok=true + invalid/bare → NOT READY', () => {
    const r = evaluateAffiliateReadiness({
      offerUrl: BARE,
      linkModOk: true,
    });
    expect(r.ready).toBe(false);
    expect(r.reason).toBe('non_navigable');
    expect(
      assertOfferReadyForAffiliateApproval({
        offerUrl: BARE,
        linkModOk: true,
        originalProductUrl: NAV,
      }).ok
    ).toBe(false);
  });

  it('G. no affiliate program → READY', () => {
    delete process.env.AMAZON_ASSOCIATE_TAG;
    delete process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG;
    const r = evaluateAffiliateReadiness({
      offerUrl: AMZ,
      linkModOk: false,
    });
    expect(r.ready).toBe(true);
    expect(r.source).toBe('no_program');
  });

  it('G2. ML sin parámetros de plataforma → exige meli.la confirmado por moderador', () => {
    delete process.env.ML_AFFILIATE_TAG;
    delete process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG;
    delete process.env.ML_MATT_TOOL;
    delete process.env.NEXT_PUBLIC_ML_MATT_TOOL;
    const unconfirmed = evaluateAffiliateReadiness({ offerUrl: NAV, linkModOk: false });
    expect(unconfirmed.ready).toBe(false);
    expect(unconfirmed.reason).toBe('missing_affiliate_tag');

    const creatorMeliLa = evaluateAffiliateReadiness({
      offerUrl: MELI_LA,
      originalOfferUrl: NAV,
      linkModOk: false,
    });
    expect(creatorMeliLa.ready).toBe(false);

    const confirmed = evaluateAffiliateReadiness({
      offerUrl: MELI_LA,
      originalOfferUrl: NAV,
      linkModOk: true,
    });
    expect(confirmed.ready).toBe(true);
    expect(confirmed.source).toBe('moderator_confirmed');
  });

  it('H. shouldPersistLinkModOk true solo si tagged canónica', () => {
    expect(shouldPersistLinkModOk({ offerUrl: AMZ_TAGGED, originalOfferUrl: AMZ })).toBe(true);
    expect(shouldPersistLinkModOk({ offerUrl: AMZ, originalOfferUrl: AMZ })).toBe(false);
    expect(shouldPersistLinkModOk({ offerUrl: `${BARE}?tag=${TAG}` })).toBe(false);
    expect(shouldPersistLinkModOk({ offerUrl: `${NAV}?tag=${TAG}`, originalOfferUrl: NAV })).toBe(false);
    expect(shouldPersistLinkModOk({ offerUrl: MELI_LA, originalOfferUrl: NAV })).toBe(false);
  });

  it('I. idempotent: tagged ready no cambia con retries de evaluación', () => {
    const input = {
      offerUrl: AMZ_TAGGED,
      originalOfferUrl: AMZ,
      linkModOk: null as boolean | null,
    };
    const a = evaluateAffiliateReadiness(input);
    const b = evaluateAffiliateReadiness(input);
    expect(a).toEqual(b);
    expect(shouldPersistLinkModOk(input)).toBe(true);
    expect(shouldPersistLinkModOk(input)).toBe(true);
  });

  it('J. approve usa el mismo contrato que evaluate', () => {
    for (const [offerUrl, original, linkModOk] of [
      [AMZ_TAGGED, AMZ, null],
      [`${NAV}?tag=${TAG}`, NAV, null],
      [MELI_LA, NAV, true],
      [NAV, NAV, true],
    ] as const) {
      const ev = evaluateAffiliateReadiness({ offerUrl, originalOfferUrl: original, linkModOk });
      const ap = assertOfferReadyForAffiliateApproval({
        offerUrl,
        linkModOk,
        originalProductUrl: original,
      });
      expect(ev.ready).toBe(ap.ok);
    }
  });

  it('K. Focus/monetization UI alinea con contrato', () => {
    const ui = computeMonetizationReadiness({
      offerUrl: AMZ_TAGGED,
      originalOfferUrl: AMZ,
      linkModOk: null,
    });
    expect(ui.status).toBe('ready');
    expect(ui.readiness?.source).toBe('platform_tagged');

    const ml = computeMonetizationReadiness({
      offerUrl: `${NAV}?tag=${TAG}`,
      originalOfferUrl: NAV,
      linkModOk: null,
    });
    expect(ml.status).toBe('needs_attention');
  });

  it('empty URLs → UI unknown / approve ok', () => {
    const ui = computeMonetizationReadiness({ offerUrl: null, originalOfferUrl: null });
    expect(ui.status).toBe('unknown');
    expect(
      assertOfferReadyForAffiliateApproval({
        offerUrl: null,
        linkModOk: null,
      }).ok
    ).toBe(true);
  });
});
