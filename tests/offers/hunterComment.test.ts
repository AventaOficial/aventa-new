import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  OFFER_CARD_HUNTER_COMMENT_MAX_LENGTH,
  OFFER_CARD_DESCRIPTION_MAX_LENGTH,
} from '@/app/components/OfferCard';
import {
  createOfferInputSchema,
  OFFER_DESCRIPTION_MAX,
  OFFER_HUNTER_COMMENT_MAX,
  sanitizeHunterComment,
} from '@/lib/contracts/offers';
import { sanitizeOfferEditHunterComment } from '@/lib/moderation/offerEditContract';
import { mapOfferToCard, type RankedOfferSource } from '@/lib/offers/transform';

describe('hunter_comment contract', () => {
  it('description sigue requerida; hunter_comment es opcional', () => {
    expect(OFFER_DESCRIPTION_MAX).toBe(300);
    expect(OFFER_HUNTER_COMMENT_MAX).toBe(160);

    const missingDesc = createOfferInputSchema.safeParse({
      title: 'Producto',
      store: 'Amazon',
      image_url: 'https://example.com/a.jpg',
      description: '',
      price: 100,
    });
    expect(missingDesc.success).toBe(false);

    const withoutHunter = createOfferInputSchema.safeParse({
      title: 'Producto',
      store: 'Amazon',
      image_url: 'https://example.com/a.jpg',
      description: 'Descripción completa de la oferta',
      price: 100,
    });
    expect(withoutHunter.success).toBe(true);
    if (withoutHunter.success) {
      expect(withoutHunter.data.hunter_comment).toBeUndefined();
    }

    const withHunter = createOfferInputSchema.safeParse({
      title: 'Producto',
      store: 'Amazon',
      image_url: 'https://example.com/a.jpg',
      description: 'Descripción completa de la oferta',
      hunter_comment: 'Está por debajo del precio habitual y tiene envío gratis.',
      price: 100,
    });
    expect(withHunter.success).toBe(true);
    if (withHunter.success) {
      expect(withHunter.data.hunter_comment).toContain('envío gratis');
    }
  });

  it('rechaza hunter_comment demasiado largo', () => {
    const tooLong = createOfferInputSchema.safeParse({
      title: 'Producto',
      store: 'Amazon',
      image_url: 'https://example.com/a.jpg',
      description: 'Descripción ok',
      hunter_comment: 'x'.repeat(OFFER_HUNTER_COMMENT_MAX + 1),
      price: 100,
    });
    expect(tooLong.success).toBe(false);
  });

  it('sanitizeHunterComment elimina HTML y vacíos', () => {
    expect(sanitizeHunterComment('  hola  ')).toBe('hola');
    expect(sanitizeHunterComment('<b>promo</b>')).toBe('promo');
    expect(sanitizeHunterComment('   ')).toBeNull();
    expect(sanitizeHunterComment(null)).toBeNull();
    expect(sanitizeOfferEditHunterComment('<script>x</script> bueno')).toBe('x bueno');
  });
});

describe('OfferCard hunter comment UI', () => {
  const cardSrc = readFileSync(join(process.cwd(), 'app/components/OfferCard.tsx'), 'utf8');

  it('muestra Comentario del cazador y no description bajo el título', () => {
    expect(OFFER_CARD_HUNTER_COMMENT_MAX_LENGTH).toBe(120);
    expect(OFFER_CARD_DESCRIPTION_MAX_LENGTH).toBe(120);
    expect(cardSrc).toContain('Comentario del cazador');
    expect(cardSrc).toContain('shortHunterComment');
    expect(cardSrc).toContain('MessageCircle');
    expect(cardSrc).not.toContain('shortDescription');
    expect(cardSrc).toMatch(/line-clamp-3/);
  });

  it('migración additive existe', () => {
    const mig = readFileSync(
      join(process.cwd(), 'docs/supabase-migrations/20260920_offers_hunter_comment.sql'),
      'utf8',
    );
    expect(mig).toContain('ADD COLUMN IF NOT EXISTS hunter_comment');
    expect(mig).toContain('o.hunter_comment');
    expect(mig).toContain('ofertas_ranked_general');
  });
});

describe('mapOfferToCard hunterComment', () => {
  const base: RankedOfferSource = {
    id: 'o1',
    title: 'Audífonos',
    price: 499,
    original_price: 899,
    store: 'Amazon',
    description: 'Descripción larga para el detalle',
    up_votes: 2,
    down_votes: 0,
  };

  it('oferta antigua sin hunter_comment no inventa comentario', () => {
    const card = mapOfferToCard(base);
    expect(card.description).toBe('Descripción larga para el detalle');
    expect(card.hunterComment).toBeUndefined();
  });

  it('oferta con hunter_comment lo mapea sin reemplazar description', () => {
    const card = mapOfferToCard({
      ...base,
      hunter_comment: 'Precio muy abajo del histórico',
    });
    expect(card.hunterComment).toBe('Precio muy abajo del histórico');
    expect(card.description).toBe('Descripción larga para el detalle');
  });
});

describe('ActionBar hunter comment field', () => {
  const src = readFileSync(join(process.cwd(), 'app/components/ActionBar.tsx'), 'utf8');

  it('incluye campo Comentario del cazador opcional en el formulario', () => {
    expect(src).toContain('Comentario del cazador');
    expect(src).toContain('¿Por qué crees que vale la pena esta oferta?');
    expect(src).toContain('hunter_comment');
    expect(src).toContain('OFFER_HUNTER_COMMENT_MAX');
  });
});
