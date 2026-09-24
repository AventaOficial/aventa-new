import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  batchAffiliatePlan,
  buildOfferBatchDrafts,
  extractOfferUrlsFromText,
  OFFER_BATCH_MAX,
  parsePastedOfferDump,
} from '@/lib/offers/batchPaste';
import { resolveModerationTabId } from '@/lib/moderation/hubConfig';

const GROK_DUMP = `20 ofertas DÍA A DÍA v2 de hoy.

### Oferta 1
- Tienda: Amazon.com.mx
- Título: Colgate Pasta Dental Total Original Mint Anticaries con Flúor 2x100ml
- Precio actual: $64.92
- Precio anterior (si hay): $138.50
- Precio con cupón (si hay): —
- Por qué es buena (1 línea): −53% one-time en pack 200 ml de pasta Total.
- URL: https://www.amazon.com.mx/dp/B010191CRY
- Riesgo (stock/variante/seller): Seller Amazon México.

### Oferta 2
- Tienda: Amazon.com.mx
- Título: Oral-B Indicator Cepillo Dental
- Precio actual: $32.24
- Precio anterior (si hay): $69.00
- URL: https://www.amazon.com.mx/dp/B01KLNZWYO

## URLs listas
https://www.amazon.com.mx/dp/B010191CRY
https://www.amazon.com.mx/dp/B01KLNZWYO
https://www.amazon.com.mx/dp/B0C4RMJCFM
`;

describe('offer batch paste', () => {
  it('extrae y deduplica ASINs del dump + lista final', () => {
    const urls = extractOfferUrlsFromText(GROK_DUMP);
    expect(urls).toEqual([
      'https://www.amazon.com.mx/dp/B010191CRY',
      'https://www.amazon.com.mx/dp/B01KLNZWYO',
      'https://www.amazon.com.mx/dp/B0C4RMJCFM',
    ]);
  });

  it('lee título y precios one-time del bloque cazador', () => {
    const hints = parsePastedOfferDump(GROK_DUMP);
    expect(hints[0]?.title).toMatch(/Colgate Pasta Dental Total/i);
    expect(hints[0]?.price).toBe(64.92);
    expect(hints[0]?.originalPrice).toBe(138.5);
    expect(hints[0]?.why).toMatch(/one-time/i);
  });

  it('une dump + URLs y respeta el tope', () => {
    const drafts = buildOfferBatchDrafts(GROK_DUMP);
    expect(drafts).toHaveLength(3);
    expect(drafts[0]?.title).toMatch(/Colgate/i);
    expect(drafts[0]?.price).toBe('64.92');
    expect(drafts[2]?.title).toBe('');

    const many = Array.from({ length: 40 }, (_, i) => `https://www.amazon.com.mx/dp/B0${String(i).padStart(8, '0')}`);
    expect(extractOfferUrlsFromText(many.join('\n'))).toHaveLength(OFFER_BATCH_MAX);
  });

  it('el formulario público no importa el lote', () => {
    const actionBar = readFileSync(join(process.cwd(), 'app/components/ActionBar.tsx'), 'utf8');
    expect(actionBar).not.toContain('offer-batch');
    expect(actionBar).not.toContain('buildOfferBatchDrafts');
  });

  it('la API de lote exige moderación y pending vía ingest', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/admin/offer-batch/item/route.ts'), 'utf8');
    expect(route).toContain('requireModeration');
    expect(route).toContain('ingestOfferObservation');
    expect(route).not.toMatch(/\.from\(['"]offers['"]\)\.insert/);
    const helper = readFileSync(join(process.cwd(), 'lib/offers/createCommunityOffer.ts'), 'utf8');
    expect(helper).toContain('ingestOfferObservation');
    expect(helper).not.toContain("status: 'approved'");
    expect(helper).not.toMatch(/\.from\(['"]offers['"]\)\.insert/);
  });

  it('la pestaña Lote vive en el hub de moderación', () => {
    expect(resolveModerationTabId('/admin/moderation/lote', 'admin')).toBe('lote');
    expect(resolveModerationTabId('/equipo/moderacion/lote', 'workspace')).toBe('lote');
  });

  it('Amazon/ML se etiquetan al crear; Walmart se pega en cola', () => {
    expect(batchAffiliatePlan('https://www.amazon.com.mx/dp/B010191CRY')).toBe('auto_tag');
    expect(batchAffiliatePlan('https://www.mercadolibre.com.mx/x/p/MLM123')).toBe('auto_tag');
    expect(batchAffiliatePlan('https://www.walmart.com.mx/ip/foo')).toBe('queue_paste');
    expect(batchAffiliatePlan('https://www.costco.com.mx/p/1')).toBe('product_only');
  });
});
