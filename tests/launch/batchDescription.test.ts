import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LEGACY_BATCH_PLACEHOLDER_DESCRIPTION,
  publicOfferDescription,
} from '@/lib/offers/publicDescription';
import { buildOfferBodyFromItem, type OfferBatchItemRow } from '@/lib/offers/batch/service';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

function batchItem(overrides: Partial<OfferBatchItemRow> = {}): OfferBatchItemRow {
  return {
    id: 'i1',
    batch_id: 'b1',
    position: 0,
    status: 'READY',
    identity_key: 'k',
    source_url: 'https://www.amazon.com.mx/dp/B000000001',
    normalized_url: null,
    canonical_url: null,
    retailer: 'amazon',
    store: 'Amazon',
    title: 'Producto',
    images: ['https://m.media-amazon.com/images/I/a.jpg'],
    price: 100,
    original_price: 150,
    discount_percent: 33,
    category: null,
    hint_title: null,
    hint_price: null,
    hint_original_price: null,
    hint_note: null,
    extraction_status: 'success',
    validation_status: 'ok',
    duplicate_status: 'none',
    duplicate_offer_id: null,
    quality_status: null,
    error_code: null,
    warnings: [],
    evidence: {},
    attempts: 0,
    lease_expires_at: null,
    offer_id: null,
    rejection_reason: null,
    processed_at: null,
    approved_at: null,
    published_at: null,
    rejected_at: null,
    created_at: '2026-10-04T00:00:00.000Z',
    updated_at: '2026-10-04T00:00:00.000Z',
    ...overrides,
  } as OfferBatchItemRow;
}

describe('public offer description', () => {
  it('hides the legacy batch moderation note', () => {
    expect(publicOfferDescription(LEGACY_BATCH_PLACEHOLDER_DESCRIPTION)).toBeNull();
    expect(publicOfferDescription(`  ${LEGACY_BATCH_PLACEHOLDER_DESCRIPTION}\n`)).toBeNull();
  });

  it('quita la nota interna del bot sobre el precio tachado y conserva el resto', () => {
    expect(
      publicOfferDescription('Detergente Ariel 5 kg. Precio tachado no verificado, se usa el de la ficha.')
    ).toBe('Detergente Ariel 5 kg.');
    expect(publicOfferDescription('Precio original no confirmado por la página.')).toBeNull();
    expect(publicOfferDescription('Nota interna: revisar stock\nIncluye envío gratis')).toBe('Incluye envío gratis');
    expect(publicOfferDescription('Evidencia: captura del 3 de octubre')).toBeNull();
  });

  it('no toca descripciones normales que mencionan precios', () => {
    for (const text of [
      'El precio original era de $899 y hoy está en $599.',
      'Precio de lista $1,299, con cupón queda en $999.',
      'Precio más bajo en 90 días',
      'Robot aspiradora con base de carga',
    ]) {
      expect(publicOfferDescription(text)).toBe(text);
    }
  });

  it('la página pública lee la descripción a través del filtro', () => {
    expect(read('app/oferta/[id]/OfferPageContent.tsx')).toContain(
      'publicOfferDescription(offer.description)'
    );
  });

  it('keeps real text and drops empty values', () => {
    expect(publicOfferDescription(' Precio más bajo en 90 días ')).toBe('Precio más bajo en 90 días');
    expect(publicOfferDescription('')).toBeNull();
    expect(publicOfferDescription(null)).toBeNull();
  });
});

describe('batch writers', () => {
  it('omits description when the hunter left no note', () => {
    expect(buildOfferBodyFromItem(batchItem())).not.toHaveProperty('description');
  });

  it('never publishes the hunter note as description', () => {
    const body = buildOfferBodyFromItem(batchItem({ hint_note: 'Precio tachado no verificado' }));
    expect(body).not.toHaveProperty('description');
  });

  it('publishes only what a person edited', () => {
    const body = buildOfferBodyFromItem(
      batchItem({
        hint_note: 'Precio tachado no verificado',
        evidence: { editorial: { description: 'Paquete de 3 piezas', why_good_deal: 'Mínimo en 90 días' } },
      } as Partial<OfferBatchItemRow>),
    );
    expect(body.description).toBe('Paquete de 3 piezas\n\nMínimo en 90 días');
  });

  it('no writer stores the moderation note anymore', () => {
    for (const rel of [
      'lib/offers/batch/service.ts',
      'app/api/admin/offer-batch/item/route.ts',
      'app/components/moderation/OfferBatchPastePanel.tsx',
    ]) {
      expect(read(rel)).not.toContain(LEGACY_BATCH_PLACEHOLDER_DESCRIPTION);
    }
  });

  it('public surfaces read the description through the filter', () => {
    const page = read('app/oferta/[id]/page.tsx');
    expect(page.match(/publicOfferDescription\(offer\.description\)/g)?.length).toBe(3);
    expect(page).not.toMatch(/offer\.description\?\.trim\(\)/);
    expect(page).toMatch(/permanentRedirect\(canonicalPath\)/);
    const transform = read('lib/offers/transform.ts');
    expect(transform).not.toMatch(/\.description\?\.trim\(\)/);
  });
});
