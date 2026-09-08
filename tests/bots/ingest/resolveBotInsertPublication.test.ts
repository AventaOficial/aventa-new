import { afterEach, describe, expect, it } from 'vitest';
import { resolveBotInsertPublication } from '@/lib/bots/ingest/resolveBotInsertPublication';

describe('resolveBotInsertPublication', () => {
  const prevAmazon = process.env.AMAZON_ASSOCIATE_TAG;

  afterEach(() => {
    if (prevAmazon === undefined) delete process.env.AMAZON_ASSOCIATE_TAG;
    else process.env.AMAZON_ASSOCIATE_TAG = prevAmazon;
  });

  it('pending pedido se queda pending', () => {
    expect(
      resolveBotInsertPublication({
        requestedStatus: 'pending',
        offerUrl: 'https://www.amazon.com.mx/dp/B0TESTASI1',
      })
    ).toEqual({ status: 'pending', linkModOk: false, demoted: false });
  });

  it('approved sin URL → pending fail-closed', () => {
    const r = resolveBotInsertPublication({ requestedStatus: 'approved', offerUrl: '' });
    expect(r.status).toBe('pending');
    expect(r.linkModOk).toBe(false);
    expect(r.demoted).toBe(true);
  });

  it('approved en tienda sin programa → approved (no inventa afiliado)', () => {
    const r = resolveBotInsertPublication({
      requestedStatus: 'approved',
      offerUrl: 'https://www.example.com/product/1',
    });
    expect(r).toEqual({ status: 'approved', linkModOk: true, demoted: false });
  });

  it('approved Amazon sin tag → pending, no link_mod_ok', () => {
    process.env.AMAZON_ASSOCIATE_TAG = 'aventa-20';
    const r = resolveBotInsertPublication({
      requestedStatus: 'approved',
      offerUrl: 'https://www.amazon.com.mx/dp/B0TESTASI1',
    });
    expect(r.status).toBe('pending');
    expect(r.linkModOk).toBe(false);
    expect(r.demoted).toBe(true);
  });
});
