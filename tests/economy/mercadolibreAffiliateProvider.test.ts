import { afterEach, describe, expect, it } from 'vitest';
import {
  createMercadoLibreAffiliateAdapter,
  getMercadoLibreAffiliateConfig,
  buildMercadoLibreAffiliateHealth,
  summarizeMercadoLibreAffiliateCapabilities,
  MERCADOLIBRE_AFFILIATE_CAPABILITY_MATRIX,
  MERCADOLIBRE_AFFILIATE_ECONOMIC_INGEST_SUPPORTED,
  ML_AFFILIATE_ERROR_CODES,
  resetMercadoLibreAffiliateMetricsForTests,
  assertSellerOauthIsNotAffiliateAuthority,
  ingestNetworkHttpEvent,
  ECONOMIC_LEDGER_BOUNDARY,
  registerAffiliateNetworkAdapter,
  clearAffiliateNetworkAdapters,
} from '@/lib/economy';
import { buildConversionCommissionTruth } from '@/lib/economy/buildConversionCommissionTruth';
import { vi } from 'vitest';

afterEach(() => {
  clearAffiliateNetworkAdapters();
  resetMercadoLibreAffiliateMetricsForTests();
  delete process.env.AFFILIATE_MERCADOLIBRE_ENABLED;
  delete process.env.AFFILIATE_MERCADOLIBRE_MODE;
});

describe('Mercado Libre capability matrix (official)', () => {
  it('economic ingest is NOT supported by official API', () => {
    expect(MERCADOLIBRE_AFFILIATE_ECONOMIC_INGEST_SUPPORTED).toBe(false);
    const summary = summarizeMercadoLibreAffiliateCapabilities();
    expect(summary.economicIngestSupported).toBe(false);
    expect(summary.notSupported).toContain('conversion reporting');
    expect(summary.notSupported).toContain('commission reporting');
    expect(summary.notSupported).toContain('webhook');
    expect(summary.notSupported).toContain('polling API');
    expect(summary.supported).toContain('attribution window');
  });

  it('matrix rows cover required capabilities', () => {
    const caps = new Set(MERCADOLIBRE_AFFILIATE_CAPABILITY_MATRIX.map((r) => r.capability));
    for (const required of [
      'generate affiliate link',
      'conversion reporting',
      'commission reporting',
      'conversion ID',
      'commission ID',
      'attribution window',
      'webhook',
      'signature verification',
      'historical backfill',
      'amount',
    ]) {
      expect(caps.has(required)).toBe(true);
    }
    const amount = MERCADOLIBRE_AFFILIATE_CAPABILITY_MATRIX.find((r) => r.capability === 'amount');
    expect(amount?.support).toBe('NOT_SUPPORTED');
    expect(amount?.exactEndpointOrMechanism).toMatch(/NOT_SUPPORTED_BY_OFFICIAL_API/);
  });
});

describe('MercadoLibreAffiliateAdapter fail-closed', () => {
  it('defaults: enabled=false, mode=disabled, connected=false', () => {
    const cfg = getMercadoLibreAffiliateConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.mode).toBe('disabled');
    expect(cfg.economicIngestAllowed).toBe(false);
    expect(cfg.settlementEnabled).toBe(false);
    const adapter = createMercadoLibreAffiliateAdapter();
    expect(adapter.connected).toBe(false);
    expect(adapter.network).toBe('mercadolibre');
  });

  it('even if ENABLED=true, economic ingest remains forbidden and adapter stays disconnected', () => {
    process.env.AFFILIATE_MERCADOLIBRE_ENABLED = 'true';
    process.env.AFFILIATE_MERCADOLIBRE_MODE = 'ingest';
    const cfg = getMercadoLibreAffiliateConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.mode).toBe('ingest');
    expect(cfg.economicIngestAllowed).toBe(false);
    const adapter = createMercadoLibreAffiliateAdapter();
    expect(adapter.connected).toBe(false);
  });

  it('refuses signature and parse with NOT_SUPPORTED_BY_OFFICIAL_API', async () => {
    const adapter = createMercadoLibreAffiliateAdapter();
    const sig = await adapter.verifySignature({
      network: 'mercadolibre',
      headers: { 'x-signature': 'anything' },
      rawBody: '{"fake":true}',
    });
    expect(sig.ok).toBe(false);
    if (!sig.ok) expect(sig.code).toBe(ML_AFFILIATE_ERROR_CODES.NOT_SUPPORTED_BY_OFFICIAL_API);

    const parsed = adapter.parsePayload({
      conversions: [{ externalConversionId: 'FAKE', grossCommissionCents: 999 }],
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.code).toBe(ML_AFFILIATE_ERROR_CODES.NOT_SUPPORTED_BY_OFFICIAL_API);
  });

  it('cannot register ML adapter as live (connected=false)', () => {
    expect(() =>
      registerAffiliateNetworkAdapter(createMercadoLibreAffiliateAdapter()),
    ).toThrow(/disconnected/);
  });

  it('HTTP ingest path fails closed for mercadolibre', async () => {
    const sb = { from: vi.fn() };
    const r = await ingestNetworkHttpEvent(sb as never, {
      network: 'mercadolibre',
      headers: {},
      rawBody: '{}',
      payload: { conversions: [{ externalConversionId: 'X' }] },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.code === 'network_not_connected' ||
          r.code === ML_AFFILIATE_ERROR_CODES.NOT_SUPPORTED_BY_OFFICIAL_API,
      ).toBe(true);
    }
  });

  it('seller oauth is explicitly not affiliate authority', () => {
    const a = assertSellerOauthIsNotAffiliateAuthority();
    expect(a.code).toBe(ML_AFFILIATE_ERROR_CODES.SELLER_OAUTH_NOT_AFFILIATE);
  });

  it('health: connected=false, settlement=false, revenue path untouched', () => {
    const h = buildMercadoLibreAffiliateHealth();
    expect(h.connected).toBe(false);
    expect(h.settlementEnabled).toBe(false);
    expect(h.economicIngestSupported).toBe(false);
    expect(ECONOMIC_LEDGER_BOUNDARY.settlementEnabled).toBe(false);
  });
});

describe('CEO Truth includes ML provider status', () => {
  it('providers.mercadolibre present; revenue not connected', async () => {
    const emptyChain = {
      select: vi.fn(() => ({
        gte: vi.fn(() => ({
          limit: vi.fn(async () => ({ data: [], error: null })),
          order: vi.fn(() => ({
            limit: vi.fn(async () => ({ data: [], error: null })),
          })),
          neq: vi.fn(() => ({
            limit: vi.fn(async () => ({ data: [], error: null })),
          })),
        })),
      })),
    };
    const sb = { from: vi.fn(() => emptyChain) };
    const snap = await buildConversionCommissionTruth(sb as never);
    expect(snap.providers.mercadolibre.connected).toBe(false);
    expect(snap.providers.mercadolibre.economicIngestSupported).toBe(false);
    expect(snap.providers.mercadolibre.settlementEnabled).toBe(false);
    expect(snap.revenue.label).toBe('not connected');
    expect(snap.networkConnectionStatus).toBe('not_connected');
  });
});

describe('money + supply safety (ML provider)', () => {
  it('adapter source never references ledger/rewards/payouts writes', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = join(process.cwd(), 'lib/economy/providers/mercadolibre');
    for (const f of [
      'MercadoLibreAffiliateAdapter.ts',
      'config.ts',
      'health.ts',
      'capabilityMatrix.ts',
    ]) {
      const src = readFileSync(join(root, f), 'utf8');
      expect(src).not.toMatch(/creator_rewards/);
      expect(src).not.toMatch(/reward_payouts/);
      expect(src).not.toMatch(/SUPPLY_ENGINE_WRITE\s*=\s*['"]?1/);
    }
  });

  it('no public ML affiliate webhook route', async () => {
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    expect(
      existsSync(join(process.cwd(), 'app/api/webhooks/mercadolibre-affiliate/route.ts')),
    ).toBe(false);
  });
});
