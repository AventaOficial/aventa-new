import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canApproveFrom,
  canRejectFrom,
  canReprocessFrom,
  canTransition,
  computeDiscountPercent,
  countBatchItems,
  deriveBatchStatus,
  describeBatchCode,
  presentBatchItem,
  evaluateBatchExtraction,
  extractBatchUrls,
  OFFER_BATCH_MAX_ITEMS,
  summarizeBulk,
} from '@/lib/offers/batch';
import { offerBatchIdentityKey } from '@/lib/offers/batchPaste';
import { resolveMercadoLibreItem } from '@/lib/offers/resolveMercadoLibreItem';
import { extractAmazonAsin } from '@/lib/offers/offerUrlFingerprint';
import { extractLiverpoolProduct } from '@/lib/offers/productExtraction/liverpoolExtract';
import {
  isOfferAmazonHost,
  isOfferLiverpoolHost,
  isOfferMercadoLibreHost,
} from '@/lib/offers/commerceHostAllowlist';

const baseEval = {
  extractionStatus: 'success' as const,
  title: 'Producto',
  images: ['https://cdn.example.com/a.jpg'],
  price: 100,
  originalPrice: 150,
  provider: 'amazon',
  identityConfidence: 'high',
  hasIdentity: true,
  blockedByHostPolicy: false,
  invalidUrl: false,
  hintPrice: null,
  hintOriginalPrice: null,
  duplicate: null,
  storeHasAffiliate: true,
};

describe('batch item transitions', () => {
  it('permite INGESTED → PROCESSING → READY → APPROVED → PUBLISHED', () => {
    expect(canTransition('INGESTED', 'PROCESSING')).toBe(true);
    expect(canTransition('PROCESSING', 'READY')).toBe(true);
    expect(canTransition('READY', 'APPROVED')).toBe(true);
    expect(canTransition('APPROVED', 'PUBLISHED')).toBe(true);
    expect(canTransition('PUBLISHED', 'READY')).toBe(false);
  });

  it('no deja aprobar desde ERROR ni publicar desde READY', () => {
    expect(canApproveFrom('READY')).toBe(true);
    expect(canApproveFrom('NEEDS_REVIEW')).toBe(true);
    expect(canApproveFrom('ERROR')).toBe(false);
    expect(canTransition('READY', 'PUBLISHED')).toBe(false);
    expect(canRejectFrom('APPROVED')).toBe(false);
    expect(canReprocessFrom('APPROVED', true)).toBe(false);
    expect(canReprocessFrom('ERROR', false)).toBe(true);
  });
});

describe('evaluateBatchExtraction', () => {
  it('READY cuando título, precio y foto están respaldados', () => {
    const r = evaluateBatchExtraction(baseEval);
    expect(r.status).toBe('READY');
    expect(r.originalPrice).toBe(150);
    expect(r.discountPercent).toBe(33);
  });

  it('nunca usa el precio anterior del texto si la tienda no lo respalda', () => {
    const r = evaluateBatchExtraction({
      ...baseEval,
      originalPrice: null,
      hintOriginalPrice: 999,
    });
    expect(r.originalPrice).toBeNull();
    expect(r.warnings).toContain('HINT_ORIGINAL_IGNORED');
  });

  it('duplicado → NEEDS_REVIEW + DUPLICATE_OFFER', () => {
    const r = evaluateBatchExtraction({
      ...baseEval,
      duplicate: { offerId: 'o1', status: 'pending' },
    });
    expect(r.status).toBe('NEEDS_REVIEW');
    expect(r.errorCode).toBe('DUPLICATE_OFFER');
  });

  it('URL bloqueada / inválida → ERROR', () => {
    expect(evaluateBatchExtraction({ ...baseEval, invalidUrl: true }).errorCode).toBe('INVALID_URL');
    expect(evaluateBatchExtraction({ ...baseEval, blockedByHostPolicy: true }).errorCode).toBe('BLOCKED_HOST');
  });

  it('sin título o foto pide revisión, no READY', () => {
    expect(evaluateBatchExtraction({ ...baseEval, title: null }).status).toBe('NEEDS_REVIEW');
    expect(evaluateBatchExtraction({ ...baseEval, images: [] }).status).toBe('NEEDS_REVIEW');
  });
});

describe('batch counters and bulk summary', () => {
  it('cuenta estados y deriva processing/ready/completed', () => {
    const c = countBatchItems([
      { status: 'INGESTED' },
      { status: 'READY' },
      { status: 'NEEDS_REVIEW', duplicate_status: 'duplicate' },
      { status: 'ERROR' },
      { status: 'PUBLISHED' },
    ]);
    expect(c.total_items).toBe(5);
    expect(c.pending_items).toBe(1);
    expect(c.ready_items).toBe(1);
    expect(c.review_items).toBe(1);
    expect(c.error_items).toBe(1);
    expect(c.published_items).toBe(1);
    expect(c.duplicate_items).toBe(1);
    expect(deriveBatchStatus(c, 'draft')).toBe('processing');
    expect(deriveBatchStatus({ ...c, pending_items: 0 }, 'ready')).toBe('ready');
    expect(
      deriveBatchStatus(
        { ...c, pending_items: 0, ready_items: 0, review_items: 0, error_items: 0, approved_items: 0 },
        'ready',
      ),
    ).toBe('completed');
  });

  it('summarizeBulk no asume que todos tuvieron éxito', () => {
    const s = summarizeBulk([
      { itemId: 'a', ok: true, status: 'APPROVED', code: null, message: null },
      { itemId: 'b', ok: false, status: 'READY', code: 'DUPLICATE_OFFER', message: 'dup' },
    ]);
    expect(s.processed).toBe(2);
    expect(s.succeeded).toBe(1);
    expect(s.failed).toBe(1);
  });

  it('describeBatchCode habla al operador y no expone códigos desconocidos', () => {
    expect(describeBatchCode('NO_ORIGINAL_PRICE').label).toMatch(/precio anterior/i);
    expect(describeBatchCode('PROVENANCE_INVALID').label).toBe('Requiere revisión');
    expect(describeBatchCode('code_missing').label).not.toBe('code_missing');
  });

  it('un lote sin cupones no pone code_missing como problema principal', () => {
    const presented = presentBatchItem({
      status: 'READY',
      errorCode: null,
      warnings: ['NO_ORIGINAL_PRICE', 'FEW_IMAGES', 'code_missing'],
    });
    expect(presented.primaryIssue).toBeNull();
    expect(presented.details.map((d) => d.label).join(' ')).not.toMatch(/code_missing/);
    expect(presented.details.some((d) => d.code === 'code_missing' && d.label === 'Aviso interno')).toBe(true);
  });

  it('computeDiscountPercent no inventa descuento', () => {
    expect(computeDiscountPercent(80, 100)).toBe(20);
    expect(computeDiscountPercent(100, 80)).toBeNull();
    expect(computeDiscountPercent(null, 100)).toBeNull();
  });
});

describe('extractBatchUrls + identity', () => {
  it('deduplica ASIN/ML y reporta recorte', () => {
    const text = [
      'https://www.amazon.com.mx/dp/B010191CRY?tag=x',
      'https://www.amazon.com.mx/dp/B010191CRY',
      'https://www.mercadolibre.com.mx/algo/p/MLM29724896?matt_word=1',
    ].join('\n');
    const r = extractBatchUrls(text);
    expect(r.urls).toHaveLength(2);
    expect(r.duplicatesInText).toBe(1);
    expect(offerBatchIdentityKey(r.urls[0]!.url)).toBe('amz:B010191CRY');
  });

  it('respeta el tope del lote', () => {
    const many = Array.from({ length: OFFER_BATCH_MAX_ITEMS + 5 }, (_, i) => `https://www.amazon.com.mx/dp/B0${String(i).padStart(8, '0')}`);
    const r = extractBatchUrls(many.join('\n'));
    expect(r.urls).toHaveLength(OFFER_BATCH_MAX_ITEMS);
    expect(r.truncated).toBe(5);
  });
});

describe('retailer adapters (Amazon / ML / Liverpool)', () => {
  it('detecta hosts sin inventar retailer', () => {
    expect(isOfferAmazonHost('www.amazon.com.mx')).toBe(true);
    expect(isOfferMercadoLibreHost('www.mercadolibre.com.mx')).toBe(true);
    expect(isOfferLiverpoolHost('www.liverpool.com.mx')).toBe(true);
    expect(isOfferAmazonHost('evil.example')).toBe(false);
  });

  it('Amazon: identidad por ASIN, no por query de tracking', () => {
    const asin = extractAmazonAsin('https://www.amazon.com.mx/foo/dp/B0C4RMJCFM?tag=aventa-20');
    expect(asin).toBe('B0C4RMJCFM');
  });

  it('Mercado Libre: canonicalize semántico, no recorte de string', () => {
    const long =
      'https://www.mercadolibre.com.mx/50-rollos-papel/p/MLM29724896?matt_word=foo&utm_source=share#wid=MLM29724896';
    const resolved = resolveMercadoLibreItem(long);
    expect(resolved?.itemId).toBe('MLM29724896');
    expect(resolved?.canonicalUrl).toBeTruthy();
    expect(resolved?.canonicalUrl).not.toMatch(/matt_word|utm_source/);
    expect(resolved?.canonicalUrl).toMatch(/mercadolibre\.com\.mx/);
    expect(resolved?.canonicalUrl).not.toBe(`https://www.mercadolibre.com.mx/MLM29724896`);
  });

  it('Liverpool: extrae título, galería y precios desde JSON-LD', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'Licuadora Oster',
      image: ['https://sscdn.liverpool.com.mx/xl/a.jpg', 'https://sscdn.liverpool.com.mx/xl/b.jpg'],
      offers: {
        '@type': 'Offer',
        priceSpecification: [
          { '@type': 'UnitPriceSpecification', priceType: 'https://schema.org/ListPrice', price: 1999 },
          { '@type': 'UnitPriceSpecification', priceType: 'https://schema.org/SalePrice', price: 1299 },
        ],
      },
    })}</script>`;
    const r = extractLiverpoolProduct(html, 'https://www.liverpool.com.mx/tienda/pdp/licuadora/110111');
    expect(r.title).toBe('Licuadora Oster');
    expect(r.images.length).toBeGreaterThanOrEqual(2);
    expect(r.suggestedDiscount).toBe(1299);
    expect(r.suggestedOriginal).toBe(1999);
  });
});

describe('batch API / writer integrity', () => {
  it('las rutas nuevas exigen moderación y no escriben approved', () => {
    const files = [
      'app/api/admin/offer-batch/route.ts',
      'app/api/admin/offer-batch/[batchId]/route.ts',
      'app/api/admin/offer-batch/[batchId]/process/route.ts',
      'app/api/admin/offer-batch/[batchId]/bulk/route.ts',
      'app/api/admin/offer-batch/[batchId]/items/[itemId]/route.ts',
      'lib/offers/batch/service.ts',
    ];
    for (const rel of files) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      expect(src).not.toMatch(/status:\s*['"]approved['"]/);
      expect(src).not.toMatch(/BOT_INGEST_MACHINE_PENDING_WRITES/);
    }
    const create = readFileSync(join(process.cwd(), 'app/api/admin/offer-batch/route.ts'), 'utf8');
    expect(create).toContain('requireBatchAuth');
    const approve = readFileSync(join(process.cwd(), 'lib/offers/batch/service.ts'), 'utf8');
    expect(approve).toContain('createCommunityOfferPending');
    expect(approve).toContain('findDuplicateOfferByUrl');
    expect(approve).toContain('appendBatchEvent');
  });

  it('el formulario público no importa el lote', () => {
    const actionBar = readFileSync(join(process.cwd(), 'app/components/ActionBar.tsx'), 'utf8');
    expect(actionBar).not.toContain('OfferBatchOps');
    expect(actionBar).not.toContain('createOfferBatch');
    const parseRoute = readFileSync(join(process.cwd(), 'app/api/parse-offer-url/route.ts'), 'utf8');
    expect(parseRoute).toContain('extractOfferFromUrl');
  });

  it('la card de lote muestra imagen y acciones sin modal encadenado', () => {
    const ui = readFileSync(join(process.cwd(), 'app/components/moderation/OfferBatchOps.tsx'), 'utf8');
    expect(ui).toContain('<img');
    expect(ui).toContain('Aprobar');
    expect(ui).toContain('Cambiar URL');
    expect(ui).toContain('Ver auditoría');
    expect(ui).toContain('sm:flex-row');
  });
});
