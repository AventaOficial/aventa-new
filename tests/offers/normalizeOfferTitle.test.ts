import { describe, expect, it } from 'vitest';
import { normalizeOfferTitle } from '@/lib/offers/normalizeOfferTitle';

describe('normalizeOfferTitle', () => {
  it('decodifica las entidades que deja el scraping de Amazon', () => {
    expect(normalizeOfferTitle('Samsung Smart TV 55&#34; OLED QN55S85HAEXZX')).toBe('Samsung Smart TV 55" OLED QN55S85HAEXZX');
    expect(normalizeOfferTitle('HUAWEI Watch FIT 4 Smartwatch con GPS, iOS &amp; Android, Negro')).toBe(
      'HUAWEI Watch FIT 4 Smartwatch con GPS, iOS & Android, Negro'
    );
    expect(normalizeOfferTitle('L&#39;Oréal Paris Elvive')).toBe("L'Oréal Paris Elvive");
    expect(normalizeOfferTitle('DEWALT SDS Plus 1-1/8&quot; 20V')).toBe('DEWALT SDS Plus 1-1/8" 20V');
  });

  it('respeta mayúsculas en letras acentuadas y símbolos comunes', () => {
    expect(normalizeOfferTitle('&Ntilde;and&uacute; Stanley IceFlow&trade; &reg;')).toBe('Ñandú Stanley IceFlow™ ®');
  });

  it('colapsa espacios, incluido &nbsp;, y recorta', () => {
    expect(normalizeOfferTitle('  Pantalla&nbsp;55\n Pulgadas  ')).toBe('Pantalla 55 Pulgadas');
  });

  it('un título limpio o con & suelto no cambia', () => {
    expect(normalizeOfferTitle('Dolce & Gabbana Light Blue 200 ml')).toBe('Dolce & Gabbana Light Blue 200 ml');
    expect(normalizeOfferTitle('Monitor KTC de 27" QHD')).toBe('Monitor KTC de 27" QHD');
    expect(normalizeOfferTitle('a&foo;b')).toBe('a&foo;b');
  });
});
