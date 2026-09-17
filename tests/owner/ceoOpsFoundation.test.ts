import { describe, expect, it } from 'vitest';
import { pickCircuitBottleneck } from '@/lib/owner/circuitBottleneck';
import { buildSystemHealthSnapshot } from '@/lib/owner/buildSystemHealth';
import type { AttributionTruthSnapshot } from '@/lib/attribution/buildAttributionTruth';

describe('CEO ops — circuit attribution gap', () => {
  it('detecta volumen sin attributed clicks', () => {
    const bn = pickCircuitBottleneck({
      liveDeals: 10,
      pending: 2,
      pendingGt24h: 0,
      oldestPendingHours: 1,
      outbound7d: 50,
      integrityOk: true,
      amazonTagConfigured: true,
      mercadolibreTagConfigured: true,
      outboundVolume24h: 20,
      attributedClicks24h: 0,
    });
    expect(bn.id).toBe('attribution_gap');
  });

  it('detecta completeness baja', () => {
    const bn = pickCircuitBottleneck({
      liveDeals: 10,
      pending: 2,
      pendingGt24h: 0,
      oldestPendingHours: 1,
      outbound7d: 50,
      integrityOk: true,
      amazonTagConfigured: true,
      mercadolibreTagConfigured: true,
      attributedClicks24h: 10,
      attributionCompletenessPct: 20,
    });
    expect(bn.id).toBe('attribution_gap');
  });
});

describe('CEO ops — system health', () => {
  it('marca money frozen como healthy fail-closed', async () => {
    const prev = process.env.MONEY_PATH_FROZEN;
    process.env.MONEY_PATH_FROZEN = '1';
    process.env.SUPPLY_ENGINE_WRITE = '0';
    const snap = await buildSystemHealthSnapshot({
      integrityOk: true,
      pendingModeration: 1,
      priceMemoryOk: true,
      writeQueueBacklog: 0,
      attribution: {
        status: 'healthy',
        note: 'ok',
      } as AttributionTruthSnapshot,
    });
    expect(snap.moneyPathFrozen).toBe(true);
    expect(snap.supplyWriteEnabled).toBe(false);
    expect(snap.components.find((c) => c.id === 'money')?.status).toBe('healthy');
    process.env.MONEY_PATH_FROZEN = prev;
  });

  it('incluye deal_intelligence como unknown/NOT_CONNECTED por defecto', async () => {
    process.env.SUPPLY_ENGINE_WRITE = '0';
    const snap = await buildSystemHealthSnapshot({
      integrityOk: true,
      pendingModeration: 1,
      priceMemoryOk: true,
      writeQueueBacklog: 0,
    });
    const di = snap.components.find((c) => c.id === 'deal_intelligence');
    expect(di?.status).toBe('unknown');
    expect(di?.detail).toMatch(/NOT_CONNECTED/);
  });
});
