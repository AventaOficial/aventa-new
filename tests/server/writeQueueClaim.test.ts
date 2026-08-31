import { describe, it, expect } from 'vitest';
import { claimedJobRows } from '../../lib/server/writeQueue';

describe('claimedJobRows', () => {
  it('solo procesa jobs realmente reclamados', () => {
    const requested = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(claimedJobRows(requested, [{ id: 2 }])).toEqual([{ id: 2 }]);
    expect(claimedJobRows(requested, [])).toEqual([]);
    expect(claimedJobRows(requested, null)).toEqual([]);
  });

  it('ignora ids extra que no estaban en el lote pedido', () => {
    const requested = [{ id: 10 }];
    expect(claimedJobRows(requested, [{ id: 10 }, { id: 99 }])).toEqual([{ id: 10 }]);
  });
});
