import { describe, it, expect } from 'vitest';
import {
  parseBotIngestUrlList,
  parseCommaNewlineTokens,
  parseAmazonAsinList,
} from '@/lib/bots/ingest/config';

describe('parseBotIngestUrlList', () => {
  it('parsea varias URLs por coma o salto de línea e ignora comentarios', () => {
    const raw = `
# comentario
https://www.mercadolibre.com.mx/item1
https://ejemplo.com/p,https://ejemplo.com/q
`;
    const list = parseBotIngestUrlList(raw);
    expect(list).toHaveLength(3);
    expect(list[0]).toMatch(/^https:\/\/www\.mercadolibre\.com\.mx\/item1$/);
  });

  it('devuelve vacío si no hay input', () => {
    expect(parseBotIngestUrlList(undefined)).toEqual([]);
    expect(parseBotIngestUrlList('')).toEqual([]);
  });
});

describe('parseCommaNewlineTokens', () => {
  it('separa por coma o salto e ignora comentarios', () => {
    expect(parseCommaNewlineTokens('a, b\n#x\nc')).toEqual(['a', 'b', 'c']);
  });
});

describe('parseAmazonAsinList', () => {
  it('extrae ASINs y deduplica', () => {
    expect(parseAmazonAsinList('B0ABCDEFGH,B0ABCDEFGH\nhttps://amazon.com.mx/dp/B012345678')).toEqual([
      'B0ABCDEFGH',
      'B012345678',
    ]);
  });
});
