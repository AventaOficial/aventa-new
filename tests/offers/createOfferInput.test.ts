import { describe, expect, it } from 'vitest';
import { createOfferInputSchema, describeOfferIssue } from '@/lib/contracts/offers';

const base = {
  title: 'Colchón matrimonial Fred 14 cm',
  store: 'Mercado Libre',
  image_url: 'https://http2.mlstatic.com/foto.jpg',
};

describe('createOfferInputSchema', () => {
  it('acepta oferta sin descuento con original_price null', () => {
    const parsed = createOfferInputSchema.safeParse({
      ...base,
      hasDiscount: false,
      price: 1788.88,
      original_price: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.price).toBe(1788.88);
      expect(parsed.data.original_price).toBeUndefined();
    }
  });

  it('acepta oferta con descuento', () => {
    const parsed = createOfferInputSchema.safeParse({
      ...base,
      hasDiscount: true,
      price: 1788.88,
      original_price: 2999,
    });
    expect(parsed.success).toBe(true);
  });

  it('trata precio vacío como ausente', () => {
    const parsed = createOfferInputSchema.safeParse({
      ...base,
      hasDiscount: false,
      price: '',
      original_price: '',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.price).toBeUndefined();
  });

  it('convierte precio en texto a número', () => {
    const parsed = createOfferInputSchema.safeParse({ ...base, price: '1500.5' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.price).toBe(1500.5);
  });

  it('nunca devuelve mensajes sin traducir', () => {
    const parsed = createOfferInputSchema.safeParse({
      title: '',
      store: '',
      price: { raro: true },
      original_price: [],
      msi_months: '6',
      image_urls: 'no soy lista',
      tags: 'tampoco',
      hasDiscount: 'quizá',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        expect(issue.message).not.toMatch(/^Invalid input/i);
        expect(issue.message).not.toMatch(/^Too (small|big)/i);
      }
    }
  });

  it('exige precio cuando se declara descuento', () => {
    const parsed = createOfferInputSchema.safeParse({ ...base, hasDiscount: true });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.message === 'Escribe el precio con descuento')).toBe(
        true
      );
    }
  });

  it('rechaza precios negativos', () => {
    const parsed = createOfferInputSchema.safeParse({ ...base, price: -5 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.message === 'El precio no puede ser negativo')).toBe(
        true
      );
    }
  });
});

describe('describeOfferIssue', () => {
  it('nombra el campo en español', () => {
    expect(describeOfferIssue({ path: 'original_price', message: 'Escribe un precio válido' })).toBe(
      'Precio original: Escribe un precio válido'
    );
  });

  it('usa la raíz cuando el path es anidado', () => {
    expect(describeOfferIssue({ path: 'image_urls.2', message: 'Hay una foto sin dirección' })).toBe(
      'Fotos: Hay una foto sin dirección'
    );
  });

  it('devuelve el mensaje solo si el campo es desconocido', () => {
    expect(describeOfferIssue({ path: 'raro', message: 'Algo pasó' })).toBe('Algo pasó');
  });

  it('devuelve null sin mensaje', () => {
    expect(describeOfferIssue({ path: 'title', message: '   ' })).toBeNull();
  });
});
