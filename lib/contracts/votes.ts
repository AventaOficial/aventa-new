import { z } from 'zod';

/**
 * Acepta `{ offerId, direction }` o legacy `{ offerId, value }` (cualquier signo ≠ 0).
 * El servidor asigna el peso según reputation_level del votante.
 */
export const voteInputSchema = z.preprocess((raw) => {
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (o.direction === 'up' || o.direction === 'down') {
      return { offerId: o.offerId, direction: o.direction };
    }
    if (typeof o.value === 'number' && o.value !== 0 && Number.isFinite(o.value)) {
      return { offerId: o.offerId, direction: o.value > 0 ? 'up' : 'down' };
    }
  }
  return raw;
}, z.object({
  offerId: z.string().uuid(),
  direction: z.enum(['up', 'down']),
}));

export type VoteInput = z.infer<typeof voteInputSchema>;
