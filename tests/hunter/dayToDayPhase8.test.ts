import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DAY_TO_DAY_CAPABILITY_MATRIX,
  DAY_TO_DAY_SOURCES,
  classifyOfferMonetization,
  configurationStateFor,
  detectBotChallenge,
  isDayToDayFlagOn,
  parseJsonLdProducts,
  parseRobotsTxt,
  isPathAllowedByRobots,
} from '@/lib/hunter/dayToDay';
import { loadRetailerFixtureProducts } from '@/lib/hunter/dayToDay/createRetailerSource';
import {
  draftToIngestItem,
  publicProductToDraft,
  isValidRetailDraft,
} from '@/lib/hunter/dayToDay/normalizeRetailCandidate';
import { ingestItemToCandidate } from '@/lib/hunter/normalize';
import { applyBreakerTransition, cooldownMsForErrorCode } from '@/lib/hunter/circuitBreaker';
import { defaultHealthRow } from '@/lib/hunter/healthStore';
import { evaluateMonetizationReadiness } from '@/lib/moderation/monetizationReadiness';
import {
  assertOfferReadyForAffiliateApproval,
  offerRequiresAffiliateValidation,
} from '@/lib/moderation/approveReadiness';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('FASE 8 capability matrix', () => {
  it('declara Chedraui READY y Walmart/Bodega DEGRADED; Soriana blocked', () => {
    expect(DAY_TO_DAY_CAPABILITY_MATRIX.find((r) => r.source === 'chedraui_mx')?.complianceStatus).toBe(
      'READY',
    );
    expect(DAY_TO_DAY_CAPABILITY_MATRIX.find((r) => r.source === 'walmart_mx')?.complianceStatus).toBe(
      'DEGRADED',
    );
    expect(
      DAY_TO_DAY_CAPABILITY_MATRIX.find((r) => r.source === 'bodega_aurrera_mx')?.complianceStatus,
    ).toBe('DEGRADED');
    expect(
      DAY_TO_DAY_CAPABILITY_MATRIX.find((r) => r.source === 'soriana_mx')?.complianceStatus,
    ).toBe('BLOCKED_PENDING_POLICY_REVIEW');
  });
});

describe('FASE 8 source registry defaults', () => {
  it('source disabled / not configured / zero network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (const src of DAY_TO_DAY_SOURCES) {
      expect(src.isEnabled({ config: {} as never, rotationWave: 0 })).toBe(false);
      expect(src.isConfigured?.({ config: {} as never, rotationWave: 0 })).toBe(false);
      expect(configurationStateFor(src)).toBe('not_configured');
      const out = await src.collect({ config: {} as never, rotationWave: 0 });
      expect(out.candidates).toEqual([]);
      expect(out.errorCode).toBe('not_configured');
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('enabled without discovery stays not_configured', () => {
    vi.stubEnv('DAY_TO_DAY_CHEDRAUI_ENABLED', '1');
    const src = DAY_TO_DAY_SOURCES.find((s) => s.id === 'chedraui_mx')!;
    expect(src.isEnabled({ config: {} as never, rotationWave: 0 })).toBe(true);
    expect(configurationStateFor(src)).toBe('not_configured');
  });

  it('discovery without enabled → disabled (configured path)', () => {
    vi.stubEnv('DAY_TO_DAY_CHEDRAUI_DISCOVERY', '1');
    const src = DAY_TO_DAY_SOURCES.find((s) => s.id === 'chedraui_mx')!;
    expect(src.isConfigured?.({ config: {} as never, rotationWave: 0 })).toBe(true);
    expect(configurationStateFor(src)).toBe('disabled');
  });
});

describe('FASE 8 fixtures discovery', () => {
  it('valid fixture candidates with provenance', async () => {
    vi.stubEnv('DAY_TO_DAY_CHEDRAUI_DISCOVERY', '1');
    vi.stubEnv('DAY_TO_DAY_FIXTURES', '1');
    vi.stubEnv('DAY_TO_DAY_PILOT', '1');
    const src = DAY_TO_DAY_SOURCES.find((s) => s.id === 'chedraui_mx')!;
    const out = await src.collect({ config: {} as never, rotationWave: 0 });
    expect(out.ok).toBe(true);
    expect(out.candidates.length).toBeGreaterThan(0);
    expect(out.candidates[0]!.title).toBeTruthy();
    expect(out.candidates[0]!.price).toBeGreaterThan(0);
    expect(out.candidates[0]!.ingestItem.source).toBe('chedraui_mx');
    expect(out.candidates[0]!.rawMetadata.monetizationStatus).toBe('non_affiliate');
  });

  it('walmart/bodega fixtures also normalize', () => {
    for (const file of ['walmart-promotions.json', 'bodega-promotions.json'] as const) {
      const products = loadRetailerFixtureProducts(file);
      expect(products.length).toBeGreaterThan(0);
      const draft = publicProductToDraft(products[0]!, {
        store: 'Test',
        source: file.startsWith('walmart') ? 'walmart_mx' : 'bodega_aurrera_mx',
        sourceDetail: 'fixture',
      });
      expect(draft && isValidRetailDraft(draft)).toBe(true);
      expect(draftToIngestItem(draft!)?.precomputedMeta?.title).toBeTruthy();
    }
  });

  it('malformed / missing title rejected', () => {
    const draft = publicProductToDraft(
      {
        url: 'https://www.chedraui.com.mx/x/p',
        title: null,
        price: 10,
        originalPrice: null,
        currency: 'MXN',
        image: null,
        productId: null,
        brand: null,
        availability: null,
        category: null,
      },
      { store: 'Chedraui', source: 'chedraui_mx', sourceDetail: 't' },
    );
    expect(draft).toBeNull();
  });

  it('missing price still can draft if title+url (enrichment later)', () => {
    const draft = publicProductToDraft(
      {
        url: 'https://www.chedraui.com.mx/x/p',
        title: 'Producto sin precio',
        price: null,
        originalPrice: null,
        currency: null,
        image: null,
        productId: '1',
        brand: null,
        availability: null,
        category: null,
      },
      { store: 'Chedraui', source: 'chedraui_mx', sourceDetail: 't' },
    );
    expect(draft).not.toBeNull();
    expect(draftToIngestItem(draft!)?.precomputedMeta?.discountPrice).toBe(0);
  });
});

describe('FASE 8 robots + jsonld + challenge', () => {
  it('robots disallow categories but allow product /p', () => {
    const rules = parseRobotsTxt(`User-agent: *
Disallow: /Despensa/
Disallow: /search?*
Sitemap: https://www.chedraui.com.mx/sitemap.xml
`);
    expect(isPathAllowedByRobots('/Despensa/aceite', rules)).toBe(false);
    expect(isPathAllowedByRobots('/croissant-novia-3106012/p', rules)).toBe(true);
  });

  it('parses Product JSON-LD', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'Aceite',
      '@id': 'https://www.chedraui.com.mx/aceite/p',
      sku: '123',
      image: 'https://example.com/a.jpg',
      offers: { '@type': 'Offer', price: 40, priceCurrency: 'MXN', highPrice: 50 },
    })}</script>`;
    const products = parseJsonLdProducts(html, 'https://www.chedraui.com.mx/aceite/p');
    expect(products[0]?.title).toBe('Aceite');
    expect(products[0]?.price).toBe(40);
    expect(products[0]?.productId).toBe('123');
    expect(products[0]?.originalPrice).toBeNull();
  });

  it('detects bot challenge', () => {
    expect(detectBotChallenge('<html>px-captcha challenge</html>', 200)).toBe(true);
    expect(detectBotChallenge('<html>ok</html>', 403)).toBe(true);
    expect(detectBotChallenge('<html>product</html>', 200)).toBe(false);
  });
});

describe('FASE 8 health + monetization + safety', () => {
  it('403/429/timeout are failures; zero results soft', () => {
    expect(cooldownMsForErrorCode('403')).toBeGreaterThan(0);
    expect(cooldownMsForErrorCode('429')).toBeGreaterThan(0);
    expect(cooldownMsForErrorCode('timeout')).toBeGreaterThan(0);
    const soft = applyBreakerTransition({
      previous: defaultHealthRow('chedraui_mx', { enabled: true, status: 'healthy' }),
      now: new Date(),
      collectOk: true,
      itemsFound: 0,
      softZeroResult: true,
      probedAsHalfOpen: false,
    });
    expect(soft.breakerState).toBe('closed');
  });

  it('non-affiliate accepted; affiliate missing does not reject readiness for non-required stores', () => {
    expect(classifyOfferMonetization('https://www.chedraui.com.mx/x/p')).toBe('non_affiliate');
    expect(offerRequiresAffiliateValidation('https://www.chedraui.com.mx/x/p')).toBe(false);
    const readiness = evaluateMonetizationReadiness({
      offerUrl: 'https://www.chedraui.com.mx/aceite/p',
      originalOfferUrl: 'https://www.chedraui.com.mx/aceite/p',
      linkModOk: null,
    });
    expect(readiness.status).toBe('no_program');
    expect(
      assertOfferReadyForAffiliateApproval({
        offerUrl: 'https://www.chedraui.com.mx/aceite/p',
        originalProductUrl: 'https://www.chedraui.com.mx/aceite/p',
        linkModOk: null,
      }).ok
    ).toBe(true);
  });

  it('pipeline candidate → ingestItem keeps shadow/auto-publish untouched', () => {
    const products = loadRetailerFixtureProducts('chedraui-promotions.json');
    const draft = publicProductToDraft(products[0]!, {
      store: 'Chedraui',
      source: 'chedraui_mx',
      sourceDetail: 'fixture',
    })!;
    const item = draftToIngestItem(draft)!;
    const candidate = ingestItemToCandidate(item, 'chedraui_mx');
    expect(candidate.ingestItem.source).toBe('chedraui_mx');
    const cfg = loadBotIngestConfig();
    expect(cfg.legacyAutoApproveWriteEnabled).toBe(false);
    expect(isDayToDayFlagOn('DAY_TO_DAY_CHEDRAUI_ENABLED')).toBe(false);
  });
});
