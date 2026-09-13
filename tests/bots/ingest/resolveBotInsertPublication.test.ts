import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveBotInsertPublication } from '@/lib/bots/ingest/resolveBotInsertPublication';

describe('resolveBotInsertPublication', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('pending pedido se queda pending (URL sin programa afiliado → no marca link_mod_ok)', () => {
    expect(
      resolveBotInsertPublication({
        requestedStatus: 'pending',
        offerUrl: 'https://www.amazon.com.mx/dp/B0TESTASI1',
      })
    ).toEqual({ status: 'pending', linkModOk: false, demoted: false });
  });

  it('pending + URL afiliada válida → link_mod_ok=true y sigue pending', () => {
    vi.stubEnv('AMAZON_ASSOCIATE_TAG', 'aventa-20');
    const r = resolveBotInsertPublication({
      requestedStatus: 'pending',
      offerUrl: 'https://www.amazon.com.mx/dp/B0TESTASI1?tag=aventa-20',
    });
    expect(r).toEqual({ status: 'pending', linkModOk: true, demoted: false });
  });

  it('pending + URL de tienda afiliada sin tag → no marca link_mod_ok', () => {
    vi.stubEnv('AMAZON_ASSOCIATE_TAG', 'aventa-20');
    const r = resolveBotInsertPublication({
      requestedStatus: 'pending',
      offerUrl: 'https://www.amazon.com.mx/dp/B0TESTASI1',
    });
    expect(r).toEqual({ status: 'pending', linkModOk: false, demoted: false });
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

  it('approved Amazon sin tag → pending, no link_mod_ok (publisher fail-closed)', () => {
    vi.stubEnv('AMAZON_ASSOCIATE_TAG', 'aventa-20');
    const r = resolveBotInsertPublication({
      requestedStatus: 'approved',
      offerUrl: 'https://www.amazon.com.mx/dp/B0TESTASI1',
    });
    expect(r.status).toBe('pending');
    expect(r.linkModOk).toBe(false);
    expect(r.demoted).toBe(true);
  });
});
