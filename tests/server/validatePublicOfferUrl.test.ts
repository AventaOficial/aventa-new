import { describe, it, expect } from 'vitest';
import { validatePublicOfferUrl } from '../../lib/server/validatePublicOfferUrl';

describe('validatePublicOfferUrl', () => {
  it('acepta https válido', () => {
    const result = validatePublicOfferUrl('https://www.amazon.com.mx/dp/B0EXAMPLE');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.href).toContain('amazon.com');
    }
  });

  it('rechaza http', () => {
    const result = validatePublicOfferUrl('http://www.mercadolibre.com.mx/producto');
    expect(result).toEqual({ ok: false, error: 'La URL de la oferta debe usar HTTPS' });
  });

  it('rechaza javascript:', () => {
    const result = validatePublicOfferUrl('javascript:alert(1)');
    expect(result).toEqual({ ok: false, error: 'URL de oferta no permitida' });
  });

  it('rechaza data:', () => {
    const result = validatePublicOfferUrl('data:text/html,<script>alert(1)</script>');
    expect(result).toEqual({ ok: false, error: 'URL de oferta no permitida' });
  });

  it('rechaza file:', () => {
    const result = validatePublicOfferUrl('file:///etc/passwd');
    expect(result).toEqual({ ok: false, error: 'URL de oferta no permitida' });
  });

  it('rechaza URLs malformadas', () => {
    const result = validatePublicOfferUrl('not-a-valid-url');
    expect(result).toEqual({ ok: false, error: 'URL de oferta inválida' });
  });

  it('rechaza URL vacía', () => {
    const result = validatePublicOfferUrl('   ');
    expect(result).toEqual({ ok: false, error: 'URL de oferta vacía' });
  });
});
