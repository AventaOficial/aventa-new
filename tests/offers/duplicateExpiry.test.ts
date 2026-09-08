import { describe, expect, it } from 'vitest';
import { offerRowBlocksHunterDuplicate } from '@/lib/offers/findDuplicateOffer';

describe('offerRowBlocksHunterDuplicate', () => {
  const now = new Date('2026-09-08T18:00:00.000Z');

  it('pending vivo bloquea (caso 21/28 del worker)', () => {
    expect(
      offerRowBlocksHunterDuplicate({ status: 'pending', deleted_at: null, expires_at: null }, now)
    ).toBe(true);
  });

  it('approved caducada no bloquea reinsert', () => {
    expect(
      offerRowBlocksHunterDuplicate(
        { status: 'approved', deleted_at: null, expires_at: '2026-09-01T00:00:00.000Z' },
        now
      )
    ).toBe(false);
  });

  it('approved vigente sí bloquea', () => {
    expect(
      offerRowBlocksHunterDuplicate(
        { status: 'approved', deleted_at: null, expires_at: '2026-09-15T00:00:00.000Z' },
        now
      )
    ).toBe(true);
  });

  it('rejected / deleted no bloquean', () => {
    expect(offerRowBlocksHunterDuplicate({ status: 'rejected', expires_at: null }, now)).toBe(false);
    expect(
      offerRowBlocksHunterDuplicate(
        { status: 'pending', deleted_at: '2026-09-08T00:00:00.000Z', expires_at: null },
        now
      )
    ).toBe(false);
  });
});
