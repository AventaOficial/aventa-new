import { describe, expect, it } from 'vitest';
import { pickCircuitBottleneck } from '@/lib/owner/circuitBottleneck';

const base = {
  liveDeals: 5,
  pending: 0,
  pendingGt24h: 0,
  oldestPendingHours: null as number | null,
  outbound7d: 10,
  integrityOk: true as boolean | null,
  amazonTagConfigured: true,
  mercadolibreTagConfigured: true,
  supplyStaleSources: 0 as number | null,
};

describe('pickCircuitBottleneck', () => {
  it('prioriza live starvation sobre backlog genérico', () => {
    const bn = pickCircuitBottleneck({
      ...base,
      liveDeals: 1,
      pending: 123,
      pendingGt24h: 111,
      oldestPendingHours: 71,
      highValuePending: 12,
      slaBreachPending: 40,
    });
    expect(bn.id).toBe('live_starvation');
    expect(bn.severity).toBe('red');
    expect(bn.href).toBe('/admin/moderation');
    expect(bn.recommendedAction).toMatch(/HIGH VALUE.*SLA breach/i);
  });

  it('marca backlog cuando hay pending viejo con live sano', () => {
    const bn = pickCircuitBottleneck({
      ...base,
      liveDeals: 8,
      pending: 25,
      pendingGt24h: 20,
      oldestPendingHours: 50,
    });
    expect(bn.id).toBe('moderation_backlog');
    expect(bn.severity).toBe('red');
  });

  it('none cuando circuito sano', () => {
    const bn = pickCircuitBottleneck(base);
    expect(bn.id).toBe('none');
    expect(bn.severity).toBe('green');
  });

  it('tags incompletos son P0', () => {
    const bn = pickCircuitBottleneck({ ...base, mercadolibreTagConfigured: false });
    expect(bn.id).toBe('affiliate_tags');
    expect(bn.severity).toBe('red');
  });
});
