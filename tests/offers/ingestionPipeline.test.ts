import { describe, expect, it } from 'vitest';
import {
  buildLotRowFromDiscoveryAndParse,
  evaluateOfferQuality,
  mergeDiscoveryWithEnrichment,
  offerIngestionIdentityKey,
  preferStrongerEvidence,
  processOfferUrl,
} from '@/lib/offers/ingestion';
import type { FieldEvidence } from '@/lib/offers/ingestion/types';
import {
  hunterCandidateToS8Input,
  normalizeHunterResult,
} from '@/lib/supply/hunterBenchmark/normalizeHunterResult';
import { opportunityCandidateFromHunterHandoff } from '@/lib/supply/intelligence/fromHunterHandoff';
import { automationCandidatesFromHunterResult } from '@/lib/supply/automation/fromHunterResult';
import { enrichRetailOfferFromHtml } from '@/lib/offers/enrichRetailOfferFromHtml';
import { applyPlatformAffiliateTags } from '@/lib/affiliate/applyPlatformAffiliateTags';

describe('offer ingestion — URL pipeline', () => {
  it('1. Amazon URL with tracking: strips noise, keeps click_id', () => {
    const result = processOfferUrl(
      'https://www.amazon.com.mx/dp/B00TESTASIN?utm_source=bot&fbclid=1&click_id=abc',
    );
    expect(result.affiliateUrl).not.toContain('utm_source');
    expect(result.affiliateUrl).not.toContain('fbclid');
    expect(result.affiliateUrl).toContain('click_id=abc');
    expect(result.urlUncertain).toBe(false);
    expect(result.rawUrl).toContain('utm_source');
  });

  it('2. Mercado Libre URL with tracking: identity stable', () => {
    const noisy =
      'https://www.mercadolibre.com.mx/x/p/MLMX123?utm_campaign=x&fbclid=y&sid=share';
    const result = processOfferUrl(noisy);
    expect(result.affiliateUrl).not.toContain('utm_campaign');
    expect(result.affiliateUrl).not.toContain('fbclid');
    expect(result.store).toMatch(/mercado/i);
  });

  it('3. Already-canonical URL stays stable', () => {
    const clean = 'https://www.amazon.com.mx/dp/B00TESTASIN';
    const a = processOfferUrl(clean);
    const b = processOfferUrl(a.canonicalUrl);
    expect(a.canonicalUrl).toBe(b.canonicalUrl);
  });

  it('4. Duplicate detection ignores tracking variants', () => {
    const a = offerIngestionIdentityKey(
      'https://www.mercadolibre.com.mx/x/p/MLMX123?utm_campaign=x',
    );
    const b = offerIngestionIdentityKey(
      'https://www.mercadolibre.com.mx/x/p/MLMX123?fbclid=y',
    );
    expect(a).toBe(b);
  });

  it('13. Canonical URL stable across re-process', () => {
    const raw = 'https://www.amazon.com.mx/dp/B00TESTASIN?utm_source=x';
    expect(processOfferUrl(raw).canonicalUrl).toBe(processOfferUrl(raw).canonicalUrl);
  });

  it('14. Affiliate tagging does not duplicate params', () => {
    process.env.AMAZON_ASSOCIATE_TAG = 'aventa-20';
    const once = applyPlatformAffiliateTags('https://www.amazon.com.mx/dp/B00TESTASIN?tag=old-20');
    const twice = applyPlatformAffiliateTags(once);
    expect(twice.match(/[?&]tag=/g)?.length).toBe(1);
    expect(twice).toContain('tag=aventa-20');
    delete process.env.AMAZON_ASSOCIATE_TAG;
  });

  it('15. Outbound injects click_id with set()', () => {
    const result = processOfferUrl('https://www.amazon.com.mx/dp/B00TESTASIN', 'amazon', {
      clickId: 'clk_test_1',
    });
    expect(result.affiliateUrl).toContain('click_id=clk_test_1');
    const again = processOfferUrl(result.affiliateUrl, 'amazon', { clickId: 'clk_test_1' });
    expect(again.affiliateUrl.match(/click_id=/g)?.length).toBe(1);
  });

  it('11. Unknown / malformed retailer URL flagged uncertain', () => {
    expect(processOfferUrl('http://[').urlUncertain).toBe(true);
  });
});

describe('offer ingestion — PDP enrichment mapping', () => {
  it('5. PDP with JSON-LD fills title/price/image', () => {
    const html = `<html><head>
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'Product',
        name: 'Camisa azul',
        image: 'https://cdn.example/camisa.jpg',
        offers: { '@type': 'Offer', price: '499', priceCurrency: 'MXN' },
      })}</script>
    </head><body></body></html>`;
    const e = enrichRetailOfferFromHtml(html, 'https://www.homedepot.com.mx/p/camisa');
    expect(e.usedJsonLd).toBe(true);
    expect(e.title).toBe('Camisa azul');
    expect(e.image).toContain('camisa.jpg');
    expect(e.suggestedDiscount).toBe(499);
  });

  it('6. PDP with OpenGraph only (no JSON-LD)', () => {
    const html = `<html><head>
      <meta property="og:title" content="Silla OG" />
      <meta property="og:image" content="https://cdn.example/silla.jpg" />
      <meta property="og:site_name" content="Coppel" />
    </head><body></body></html>`;
    const e = enrichRetailOfferFromHtml(html, 'https://www.coppel.com/silla');
    expect(e.usedJsonLd).toBe(false);
    expect(e.title).toBe('Silla OG');
    expect(e.image).toContain('silla.jpg');
  });

  it('7. PDP without image → null image', () => {
    const html = `<html><head>
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'Product',
        name: 'Sin imagen',
        offers: { '@type': 'Offer', price: '100' },
      })}</script>
    </head><body></body></html>`;
    const e = enrichRetailOfferFromHtml(html, 'https://www.coppel.com/x');
    expect(e.title).toBe('Sin imagen');
    expect(e.image).toBeNull();
  });

  it('8. PDP without seller → store may come from host only', () => {
    const html = `<html><head>
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'Product',
        name: 'Item',
        offers: { '@type': 'Offer', price: '50' },
      })}</script>
    </head><body></body></html>`;
    const e = enrichRetailOfferFromHtml(html, 'https://www.liverpool.com.mx/tienda/pdp/x');
    expect(e.store).toBeTruthy();
  });
});

describe('offer ingestion — merge, conflicts, gates', () => {
  it('9. Hunter vs PDP price conflict keeps both evidences', () => {
    const merged = mergeDiscoveryWithEnrichment(
      { rawUrl: 'https://www.amazon.com.mx/dp/B00', price: 21699, source: 'hunter' },
      { price: 22999, source: 'json_ld' },
    );
    expect(merged.price.conflict).toBe(true);
    expect(merged.price.value).toBe(21699);
    expect(merged.price.discoveryValue).toBe(21699);
    expect(merged.price.enrichmentValue).toBe(22999);
    expect(merged.price.evidence).toHaveLength(2);
    expect(merged.conflicts).toContain('price');
  });

  it('matching prices confirm without conflict', () => {
    const merged = mergeDiscoveryWithEnrichment(
      { rawUrl: 'https://www.amazon.com.mx/dp/B00', price: 21699, title: 'A', source: 'hunter' },
      { price: 21699, title: 'A', source: 'json_ld' },
    );
    expect(merged.price.conflict).toBe(false);
    expect(merged.price.value).toBe(21699);
  });

  it('10. Missing price blocks ready_for_review', () => {
    const built = buildLotRowFromDiscoveryAndParse({
      discovery: {
        rawUrl: 'https://www.amazon.com.mx/dp/B00TESTASIN',
        title: 'Item',
        store: 'Amazon',
        price: null,
        source: 'paste',
      },
      parseData: {
        title: 'Item',
        image: 'https://img/a.jpg',
        store: 'Amazon',
        extraction_status: 'partial',
      },
      pdpAttempted: true,
    });
    expect(built.quality.requiredMissing).toContain('price');
    expect(built.quality.readyForReview).toBe(false);
    expect(built.quality.readiness).not.toBe('ready_for_review');
  });

  it('12. Repeated enrichment is idempotent on identity + merge', () => {
    const discovery = {
      rawUrl: 'https://www.amazon.com.mx/dp/B00TESTASIN?utm_source=a',
      title: null as string | null,
      price: null as number | null,
      source: 'paste' as const,
    };
    const parseData = {
      title: 'Item',
      image: 'https://img/a.jpg',
      store: 'Amazon',
      suggested_discount_price: 100,
      extraction_status: 'success',
    };
    const first = buildLotRowFromDiscoveryAndParse({ discovery, parseData, pdpAttempted: true });
    const second = buildLotRowFromDiscoveryAndParse({
      discovery: { ...discovery, rawUrl: first.url.canonicalUrl },
      parseData,
      pdpAttempted: true,
    });
    expect(offerIngestionIdentityKey(discovery.rawUrl)).toBe(
      offerIngestionIdentityKey(first.url.canonicalUrl),
    );
    expect(first.merged.title.value).toBe(second.merged.title.value);
    expect(first.merged.price.value).toBe(second.merged.price.value);
    expect(first.quality.readiness).toBe(second.quality.readiness);
  });

  it('16. Stronger evidence is not overwritten by weaker', () => {
    const strong: FieldEvidence<string> = {
      field: 'title',
      value: 'From JSON-LD',
      source: 'json_ld',
      observedAt: '2026-09-23T00:00:00.000Z',
      confidence: 0.9,
    };
    const weak: FieldEvidence<string> = {
      field: 'title',
      value: 'From OG',
      source: 'open_graph',
      observedAt: '2026-09-23T00:01:00.000Z',
      confidence: 0.7,
    };
    expect(preferStrongerEvidence(strong, weak).value).toBe('From JSON-LD');
    expect(preferStrongerEvidence(weak, strong).value).toBe('From JSON-LD');
  });

  it('does not mark incomplete offers ready without PDP', () => {
    const url = processOfferUrl('https://www.amazon.com.mx/dp/B00TESTASIN');
    expect(
      evaluateOfferQuality({
        url,
        title: null,
        image: null,
        price: 100,
        store: 'amazon',
        pdpAttempted: false,
      }).readiness,
    ).toBe('discovered');
  });

  it('ready_for_review when required fields and PDP exist', () => {
    const built = buildLotRowFromDiscoveryAndParse({
      discovery: {
        rawUrl: 'https://www.amazon.com.mx/dp/B00TESTASIN',
        title: 'Item',
        store: 'Amazon',
        price: 100,
        source: 'paste',
      },
      parseData: {
        title: 'Item',
        image: 'https://img/a.jpg',
        store: 'Amazon',
        suggested_discount_price: 100,
        extraction_status: 'success',
      },
      pdpAttempted: true,
    });
    expect(built.quality.readiness).toBe('ready_for_review');
    expect(built.quality.readyForReview).toBe(true);
  });

  it('blocks failed PDP extraction', () => {
    const url = processOfferUrl('https://www.amazon.com.mx/dp/B00TESTASIN');
    expect(
      evaluateOfferQuality({
        url,
        title: 'X',
        image: 'https://img/a.jpg',
        price: 10,
        store: 'Amazon',
        extractionStatus: 'failed',
        pdpAttempted: true,
      }).readiness,
    ).toBe('blocked');
  });
});

describe('hunter image preservation', () => {
  it('keeps imageUrl through normalize → handoff → automation candidate', () => {
    const normalized = normalizeHunterResult({
      hunterId: 'chatgpt_scheduled',
      runId: 'run-1',
      sourceId: 'src-1',
      collectedAt: '2026-09-23T18:00:00.000Z',
      completedAt: '2026-09-23T18:00:01.000Z',
      payload: {
        ok: true,
        candidates: [
          {
            url: 'https://www.amazon.com.mx/dp/B00TESTASIN',
            title: 'Test',
            price: 100,
            imageUrl: 'https://img.example/product.jpg',
          },
        ],
      },
    });
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    const candidate = normalized.result.candidates[0]!;
    expect(candidate.metadata.imageUrl).toBe('https://img.example/product.jpg');
    const s8 = hunterCandidateToS8Input(candidate);
    const opportunity = opportunityCandidateFromHunterHandoff(s8);
    expect(opportunity?.imageUrl).toBe('https://img.example/product.jpg');
    const automation = automationCandidatesFromHunterResult(normalized.result);
    expect(automation[0]?.opportunity.imageUrl).toBe('https://img.example/product.jpg');
  });
});
