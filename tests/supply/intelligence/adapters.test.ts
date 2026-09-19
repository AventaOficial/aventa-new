import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAmazonPriceAdapter } from '@/lib/supply/intelligence/adapters/amazon';
import { createMercadoLibrePriceAdapter } from '@/lib/supply/intelligence/adapters/mercadolibre';
import { adapterSupports } from '@/lib/supply/intelligence/adapters/types';

describe('S8 price adapters', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
    vi.restoreAllMocks();
  });

  it('ML adapter capability gate — live disabled → dry-run', async () => {
    process.env.SUPPLY_INTELLIGENCE_ML_LIVE = 'false';
    const adapter = createMercadoLibrePriceAdapter();
    expect(adapter.isLiveEnabled()).toBe(false);
    expect(adapterSupports(adapter, 'historical_price')).toBe(false);

    const result = await adapter.fetchCurrentPrice({
      url: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-x',
      fallbackSalePrice: 500,
    });
    expect(result.dryRun).toBe(true);
    expect(result.errorCode).toBe('live_disabled');
    expect(result.listPrice).toBeNull();
  });

  it('Amazon adapter not connected', async () => {
    const adapter = createAmazonPriceAdapter();
    expect(adapter.capabilities.currentPrice).toBe(false);
    const result = await adapter.fetchCurrentPrice({
      url: 'https://www.amazon.com.mx/dp/B0TEST1234',
      fallbackSalePrice: 100,
    });
    expect(result.dryRun).toBe(true);
    expect(result.errorCode).toBe('not_connected');
    expect(result.listPrice).toBeNull();
  });

  it('ML adapter missing item id → dry-run without list price', async () => {
    process.env.SUPPLY_INTELLIGENCE_ML_LIVE = 'true';
    const adapter = createMercadoLibrePriceAdapter();
    const result = await adapter.fetchCurrentPrice({
      url: 'https://www.mercadolibre.com.mx/ofertas',
      fallbackSalePrice: 100,
      fallbackListPrice: 200,
    });
    expect(result.dryRun).toBe(true);
    expect(result.errorCode).toBe('missing_item_id');
    expect(result.listPrice).toBeNull();
  });
});
