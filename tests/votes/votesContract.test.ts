import { describe, it, expect } from 'vitest';
import { voteInputSchema } from '../../lib/contracts/votes';

/**
 * Contrato mínimo del flujo de votos (Production Ready).
 * El bloqueo de auto-voto vive en app/api/votes/route.ts (owner === voter → 403).
 */
describe('votes production-ready contract', () => {
  const offerId = '11111111-1111-4111-8111-111111111111';

  it('acepta offerId + direction up/down', () => {
    expect(voteInputSchema.safeParse({ offerId, direction: 'up' }).success).toBe(true);
    expect(voteInputSchema.safeParse({ offerId, direction: 'down' }).success).toBe(true);
  });

  it('rechaza payloads inválidos', () => {
    expect(voteInputSchema.safeParse({ offerId: '', direction: 'up' }).success).toBe(false);
    expect(voteInputSchema.safeParse({ offerId: 'x', direction: 'sideways' }).success).toBe(false);
  });
});
