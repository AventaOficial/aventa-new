import { describe, it, expect } from 'vitest';
import { parseBotIngestUrlList } from '@/lib/bots/ingest/config';

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
