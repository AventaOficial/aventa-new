import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  evaluateAffiliateReadiness,
  shouldPersistLinkModOk,
} from '@/lib/moderation/affiliateReadinessContract';
import { assertOfferReadyForAffiliateApproval } from '@/lib/moderation/approveReadiness';
import { computeMonetizationReadiness } from '@/lib/moderation/monetizationReadiness';

const NAV = 'https://articulo.mercadolibre.com.mx/MLM-1234567890-test-product';
const BARE = 'https://www.mercadolibre.com.mx/MLM1234567890';
const TAG = 'aventa_test_tag';

describe('affiliate readiness contract (canonical)', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.ML_AFFILIATE_TAG = TAG;
    process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG = TAG;
    delete process.env.ML_MATT_TOOL;
    delete process.env.NEXT_PUBLIC_ML_MATT_TOOL;
    delete process.env.ML_MATT_WORD;
    delete process.env.NEXT_PUBLIC_ML_MATT_WORD;
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('A. tagged + canonical → READY (sin link_mod_ok)', () => {
    const r = evaluateAffiliateReadiness({
      offerUrl: `${NAV}?tag=${TAG}`,
      originalOfferUrl: NAV,
      linkModOk: null,
    });
    expect(r.ready).toBe(true);
    expect(r.source).toBe('platform_tagged');
    expect(assertOfferReadyForAffiliateApproval({
      offerUrl: `${NAV}?tag=${TAG}`,
      linkModOk: null,
      originalProductUrl: NAV,
    }).ok).toBe(true);
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

  it('E. link_mod_ok=true + valid canonical → READY', () => {
    const r = evaluateAffiliateReadiness({
      offerUrl: NAV,
      linkModOk: true,
    });
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
    delete process.env.ML_AFFILIATE_TAG;
    delete process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG;
    delete process.env.ML_MATT_TOOL;
    delete process.env.NEXT_PUBLIC_ML_MATT_TOOL;
    const r = evaluateAffiliateReadiness({
      offerUrl: NAV,
      linkModOk: false,
    });
    expect(r.ready).toBe(true);
    expect(r.source).toBe('no_program');
  });

  it('H. shouldPersistLinkModOk true solo si tagged canónica', () => {
    expect(
      shouldPersistLinkModOk({
        offerUrl: `${NAV}?tag=${TAG}`,
        originalOfferUrl: NAV,
      })
    ).toBe(true);
    expect(
      shouldPersistLinkModOk({
        offerUrl: NAV,
        originalOfferUrl: NAV,
      })
    ).toBe(false);
    expect(
      shouldPersistLinkModOk({
        offerUrl: `${BARE}?tag=${TAG}`,
      })
    ).toBe(false);
  });

  it('I. idempotent: tagged ready no cambia con retries de evaluación', () => {
    const input = {
      offerUrl: `${NAV}?tag=${TAG}`,
      originalOfferUrl: NAV,
      linkModOk: null as boolean | null,
    };
    const a = evaluateAffiliateReadiness(input);
    const b = evaluateAffiliateReadiness(input);
    expect(a).toEqual(b);
    expect(shouldPersistLinkModOk(input)).toBe(true);
    expect(shouldPersistLinkModOk(input)).toBe(true);
  });

  it('J. approve usa el mismo contrato que evaluate', () => {
    const tagged = `${NAV}?tag=${TAG}`;
    const ev = evaluateAffiliateReadiness({ offerUrl: tagged, linkModOk: null });
    const ap = assertOfferReadyForAffiliateApproval({
      offerUrl: tagged,
      linkModOk: null,
      originalProductUrl: NAV,
    });
    expect(ev.ready).toBe(ap.ok);
  });

  it('K. Focus/monetization UI alinea con contrato', () => {
    const tagged = `${NAV}?tag=${TAG}`;
    const ui = computeMonetizationReadiness({
      offerUrl: tagged,
      originalOfferUrl: NAV,
      linkModOk: null,
    });
    expect(ui.status).toBe('ready');
    expect(ui.readiness?.source).toBe('platform_tagged');
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
