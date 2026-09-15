import { describe, expect, it } from 'vitest';
import { applyPlatformAffiliateTags } from '@/lib/affiliate/applyPlatformAffiliateTags';
import { resolveAndNormalizeAffiliateOfferUrl } from '@/lib/affiliate/resolveAffiliateOfferUrl';
import { assertOfferReadyForAffiliateApproval } from '@/lib/moderation/approveReadiness';
import { evaluateMonetizationReadiness } from '@/lib/moderation/monetizationReadiness';
import {
  isMercadoLibreBareItemPathUrl,
  isMercadoLibreNavigableProductUrl,
  resolveMercadoLibreItem,
} from '@/lib/offers/resolveMercadoLibreItem';

describe('P0 ML canonical URL integrity', () => {
  it('1. /producto/p/MLM?wid=same conserva /p/, nunca bare', () => {
    const input =
      'https://www.mercadolibre.com.mx/producto/p/MLM62559998?wid=MLM62559998';
    const r = resolveMercadoLibreItem(input);
    expect(r?.canonicalUrl).toMatch(/\/p\/MLM62559998/i);
    expect(r?.canonicalUrl).not.toMatch(/mercadolibre\.com\.mx\/MLM62559998(\?|$)/i);
    expect(isMercadoLibreBareItemPathUrl(r?.canonicalUrl ?? '')).toBe(false);
  });

  it('2. /p/MLM43420119?wid=same conserva /p/', () => {
    const input = 'https://www.mercadolibre.com.mx/p/MLM43420119?wid=MLM43420119';
    const r = resolveMercadoLibreItem(input);
    expect(r?.canonicalUrl).toContain('/p/MLM43420119');
    expect(r?.canonicalUrl).not.toBe('https://www.mercadolibre.com.mx/MLM43420119');
  });

  it('3. articulo MLM-…-_JM conserva host y guion', () => {
    const input = 'https://articulo.mercadolibre.com.mx/MLM-12345678-producto-_JM';
    const r = resolveMercadoLibreItem(input);
    expect(r?.canonicalUrl).toContain('articulo.mercadolibre.com.mx');
    expect(r?.canonicalUrl).toMatch(/MLM-12345678/i);
    expect(r?.canonicalUrl).not.toMatch(/articulo\.mercadolibre\.com\.mx\/MLM12345678(\?|$)/i);
  });

  it('4. catalog ≠ item conserva /p/{catalog}?wid={item}', () => {
    const input = 'https://www.mercadolibre.com.mx/p/MLM18625838?wid=MLM1413356802';
    const r = resolveMercadoLibreItem(input);
    expect(r?.canonicalUrl).toContain('/p/MLM18625838');
    expect(r?.canonicalUrl).toContain('wid=MLM1413356802');
  });

  it('5. catalog === item NO degrada a /{item}', () => {
    const input = 'https://www.mercadolibre.com.mx/arrancador/p/MLM62559998?wid=MLM62559998';
    const r = resolveMercadoLibreItem(input);
    expect(r?.canonicalUrl).toMatch(/\/p\/MLM62559998/i);
    expect(isMercadoLibreBareItemPathUrl(r!.canonicalUrl!)).toBe(false);
  });

  it('6. solamente bare item_id → canonical null (fail-closed)', () => {
    const r = resolveMercadoLibreItem('https://www.mercadolibre.com.mx/MLM62559998');
    expect(r?.itemId).toBe('MLM62559998');
    expect(r?.canonicalUrl).toBeNull();
    expect(isMercadoLibreBareItemPathUrl('https://www.mercadolibre.com.mx/MLM62559998')).toBe(
      true,
    );
  });

  it('7. affiliate tags conservan pathname', async () => {
    const prevTag = process.env.ML_AFFILIATE_TAG;
    const prevTool = process.env.ML_MATT_TOOL;
    const prevWord = process.env.ML_MATT_WORD;
    process.env.ML_AFFILIATE_TAG = 'aventa';
    process.env.ML_MATT_TOOL = '97583635';
    process.env.ML_MATT_WORD = 'aventa';
    try {
      const source =
        'https://www.mercadolibre.com.mx/p/MLM62559998?wid=MLM62559998';
      const tagged = applyPlatformAffiliateTags(source);
      expect(tagged).toMatch(/\/p\/MLM62559998/i);
      expect(tagged).toContain('tag=aventa');
      expect(tagged).toContain('matt_word=aventa');
      expect(tagged).toContain('matt_tool=97583635');
      expect(isMercadoLibreBareItemPathUrl(tagged)).toBe(false);

      const normalized = await resolveAndNormalizeAffiliateOfferUrl(source);
      expect(normalized).toMatch(/\/p\/MLM62559998/i);
      expect(isMercadoLibreBareItemPathUrl(normalized)).toBe(false);
    } finally {
      if (prevTag === undefined) delete process.env.ML_AFFILIATE_TAG;
      else process.env.ML_AFFILIATE_TAG = prevTag;
      if (prevTool === undefined) delete process.env.ML_MATT_TOOL;
      else process.env.ML_MATT_TOOL = prevTool;
      if (prevWord === undefined) delete process.env.ML_MATT_WORD;
      else process.env.ML_MATT_WORD = prevWord;
    }
  });

  it('8. Amazon sin regresión de path', async () => {
    const prev = process.env.AMAZON_ASSOCIATE_TAG;
    process.env.AMAZON_ASSOCIATE_TAG = 'aventa-20';
    try {
      const url = 'https://www.amazon.com.mx/dp/B0TESTASI1';
      const out = await resolveAndNormalizeAffiliateOfferUrl(url);
      expect(out).toContain('/dp/B0TESTASI1');
      expect(out).toContain('tag=aventa-20');
    } finally {
      if (prev === undefined) delete process.env.AMAZON_ASSOCIATE_TAG;
      else process.env.AMAZON_ASSOCIATE_TAG = prev;
    }
  });

  it('9. Walmart sin regresión de path', async () => {
    const prev = process.env.WALMART_AFFILIATE_QUERY;
    process.env.WALMART_AFFILIATE_QUERY = 'wmlspartner=xx';
    try {
      const url = 'https://www.walmart.com.mx/ip/producto/123';
      const out = await resolveAndNormalizeAffiliateOfferUrl(url);
      expect(out).toContain('/ip/producto/123');
      // Tags Walmart solo si fingerprint de producto; path no debe romperse.
      expect(out.startsWith('https://www.walmart.com.mx/ip/producto/123')).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.WALMART_AFFILIATE_QUERY;
      else process.env.WALMART_AFFILIATE_QUERY = prev;
    }
  });

  it('10. permalink válido permanece navegable tras normalize', async () => {
    const source =
      'https://www.mercadolibre.com.mx/arrancador-de-bateria/p/MLM62559998?wid=MLM62559998&utm_source=x';
    const out = await resolveAndNormalizeAffiliateOfferUrl(source);
    expect(isMercadoLibreNavigableProductUrl(out)).toBe(true);
    expect(out).toMatch(/\/p\/MLM62559998/i);
  });

  it('contrato source → canonical → affiliate → outbound (pathname + tags, no bare)', async () => {
    process.env.ML_AFFILIATE_TAG = 'aventa';
    process.env.ML_MATT_TOOL = '97583635';
    process.env.ML_MATT_WORD = 'aventa';
    const source =
      'https://www.mercadolibre.com.mx/terminal-point/p/MLM43420119?wid=MLM43420119';
    const canonical = resolveMercadoLibreItem(source)?.canonicalUrl;
    expect(canonical).toBeTruthy();
    expect(canonical!).toMatch(/\/p\/MLM43420119/i);
    const affiliate = applyPlatformAffiliateTags(canonical!);
    const outbound = await resolveAndNormalizeAffiliateOfferUrl(source);
    for (const u of [canonical!, affiliate, outbound]) {
      expect(u).toMatch(/\/p\/MLM43420119/i);
      expect(isMercadoLibreBareItemPathUrl(u)).toBe(false);
    }
    expect(outbound).toContain('tag=aventa');
    expect(outbound).toContain('matt_tool=97583635');
  });

  it('link_mod_ok no basta si offer_url es bare-ID', () => {
    const bare = 'https://www.mercadolibre.com.mx/MLM62559998?tag=aventa';
    const ready = assertOfferReadyForAffiliateApproval({
      offerUrl: bare,
      linkModOk: true,
      originalProductUrl: 'https://www.mercadolibre.com.mx/p/MLM62559998?wid=MLM62559998',
    });
    expect(ready.ok).toBe(false);

    const monetization = evaluateMonetizationReadiness({
      offerUrl: bare,
      originalOfferUrl: 'https://www.mercadolibre.com.mx/p/MLM62559998?wid=MLM62559998',
      linkModOk: true,
    });
    // original navegable → still can be ready if we check original; our rule requires offer navigable OR original
    // With bare offer + good original: navigableOriginal=true → can proceed to affiliate check
    // Actually: navigableOffer=false, navigableOriginal=true → !(false || true) = false → not needs_attention from bare path alone
    // bare = (offerUrl && isBare) = true → needs_attention. Good.
    expect(monetization.status).toBe('needs_attention');
  });

  it('normalize no reescribe bare a otra bare inventada', async () => {
    const bare = 'https://www.mercadolibre.com.mx/MLM43420119?tag=aventa';
    const out = await resolveAndNormalizeAffiliateOfferUrl(bare);
    expect(out).not.toMatch(/\/p\//); // no inventamos /p/ desde bare sin catalog signal in path
    // No debe producir un "canonical" distinto inventado; fail-closed mantiene bare
    expect(isMercadoLibreBareItemPathUrl(out) || out === bare).toBe(true);
  });

  it('11. UPP válido conserva /up/ (nunca bare MLMU)', () => {
    const input =
      'https://www.mercadolibre.com.mx/tenis-adidas-hombre-terrex-anylander-mid/up/MLMU2916452044?wid=MLMU2916452044';
    const r = resolveMercadoLibreItem(input);
    expect(r?.canonicalUrl).toMatch(/\/up\/MLMU2916452044/i);
    expect(r?.canonicalUrl).not.toMatch(/mercadolibre\.com\.mx\/MLMU2916452044(\?|$)/i);
    expect(r?.itemId).toBeNull();
    expect(isMercadoLibreBareItemPathUrl(r!.canonicalUrl!)).toBe(false);
    expect(isMercadoLibreNavigableProductUrl(r!.canonicalUrl!)).toBe(true);
  });

  it('12. UPP + affiliate tags conserva pathname /up/', async () => {
    process.env.ML_AFFILIATE_TAG = 'aventa';
    process.env.ML_MATT_TOOL = '97583635';
    process.env.ML_MATT_WORD = 'aventa';
    const source =
      'https://www.mercadolibre.com.mx/perfume-dior-sauvage-edp-100ml-hombre/up/MLMU5134390460?wid=MLMU5134390460';
    const tagged = applyPlatformAffiliateTags(source);
    expect(tagged).toMatch(/\/up\/MLMU5134390460/i);
    expect(tagged).toContain('tag=aventa');
    expect(tagged).toContain('matt_tool=97583635');
    expect(isMercadoLibreBareItemPathUrl(tagged)).toBe(false);

    const normalized = await resolveAndNormalizeAffiliateOfferUrl(source);
    expect(normalized).toMatch(/\/up\/MLMU5134390460/i);
    expect(normalized).not.toMatch(/\/shopping\/up\//i);
    expect(isMercadoLibreBareItemPathUrl(normalized)).toBe(false);
  });

  it('13. bare MLMU → canonical null (fail-closed)', () => {
    const bare = 'https://www.mercadolibre.com.mx/MLMU2916452044';
    const r = resolveMercadoLibreItem(bare);
    expect(r?.canonicalUrl).toBeNull();
    expect(isMercadoLibreBareItemPathUrl(bare)).toBe(true);
  });

  it('14. original UPP recupera offer_url navegable (no bare)', async () => {
    process.env.ML_AFFILIATE_TAG = 'aventa';
    process.env.ML_MATT_TOOL = '97583635';
    process.env.ML_MATT_WORD = 'aventa';
    const original =
      'https://www.mercadolibre.com.mx/ck-one-one-edt-100ml-unisex/up/MLMU5093334519?wid=MLMU5093334519';
    const canonical = resolveMercadoLibreItem(original)?.canonicalUrl;
    expect(canonical).toMatch(/\/up\/MLMU5093334519/i);
    const affiliate = await resolveAndNormalizeAffiliateOfferUrl(original);
    expect(affiliate).toMatch(/\/up\/MLMU5093334519/i);
    expect(affiliate).toContain('tag=aventa');
    expect(isMercadoLibreBareItemPathUrl(affiliate)).toBe(false);
    // UI / outbound reciben URL ya canonicalizada (pathname UPP)
    expect(isMercadoLibreNavigableProductUrl(affiliate)).toBe(true);
  });

  it('15. MLMU no se convierte en bare path ni en /shopping/up/', () => {
    const input =
      'https://www.mercadolibre.com.mx/bolsa-tote/up/MLMU4885777572?wid=MLMU4885777572&utm_source=x';
    const canonical = resolveMercadoLibreItem(input)?.canonicalUrl ?? '';
    expect(canonical).toMatch(/\/up\/MLMU4885777572/i);
    expect(canonical).not.toMatch(/\/shopping\/up\//i);
    expect(canonical).not.toMatch(/mercadolibre\.com\.mx\/MLMU4885777572(\?|$)/i);
  });
});
