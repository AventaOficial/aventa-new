import { describe, it, expect } from 'vitest';
import { resolveLedgerAttribution } from '../../lib/commissions/resolveAttribution';

describe('resolveLedgerAttribution', () => {
  it('separa atribuible vs plataforma y resuelve tag', () => {
    const tagMap = new Map([['ana_tag', 'user-ana']]);
    const result = resolveLedgerAttribution(
      [
        { amount_cents: 10000, creator_id: 'user-ana', attributable: true },
        { amount_cents: 5000, tracking_tag: 'ANA_TAG' },
        { amount_cents: 3000, attributable: false },
        { amount_cents: 2000 },
      ],
      tagMap,
    );
    expect(result.grossCents).toBe(20000);
    expect(result.attributableCents).toBe(15000);
    expect(result.unattributableCents).toBe(5000);
    expect(result.byCreatorCents.get('user-ana')).toBe(15000);
  });
});
