import { describe, it, expect } from 'vitest';
import { stringifyJsonLd } from '../../lib/seo/jsonLd';

describe('stringifyJsonLd', () => {
  it('escapa </script> para que no cierre el tag HTML', () => {
    const html = stringifyJsonLd({
      name: '</script><script>alert(1)</script>',
    });
    expect(html.includes('</script>')).toBe(false);
    expect(html).toContain('\\u003c');
    expect(JSON.parse(html).name).toContain('</script>');
  });

  it('mantiene JSON-LD válido', () => {
    const data = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Oferta <promo> & 50%',
    };
    const raw = stringifyJsonLd(data);
    expect(JSON.parse(raw)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Oferta <promo> & 50%',
    });
  });
});
