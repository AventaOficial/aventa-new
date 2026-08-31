import { describe, expect, it } from 'vitest';
import {
  pickFirstEligibleOffer,
  pickNextEligibleOffer,
} from '@/lib/moderation/pickNextEligibleOffer';

const now = Date.now();

function offer(
  id: string,
  lockedBy: string | null = null,
  lockedAt: string | null = null,
  createdAt = new Date(now - Number(id) * 1000).toISOString()
) {
  return {
    id,
    created_at: createdAt,
    locked_by: lockedBy,
    locked_at: lockedAt,
  };
}

describe('pickNextEligibleOffer', () => {
  it('elige la siguiente oferta disponible', () => {
    const list = [offer('1'), offer('2'), offer('3')];
    expect(pickNextEligibleOffer(list, '1', 'mod-a')).toBe('2');
  });

  it('ignora lock activo de otro moderador', () => {
    const list = [
      offer('1'),
      offer('2', 'mod-b', new Date().toISOString()),
      offer('3'),
    ];
    expect(pickNextEligibleOffer(list, '1', 'mod-a')).toBe('3');
  });

  it('puede recuperar oferta con lock stale', () => {
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const list = [offer('1'), offer('2', 'mod-b', stale), offer('3')];
    expect(pickNextEligibleOffer(list, '1', 'mod-a')).toBe('2');
  });

  it('pickFirstEligibleOffer salta locks ajenos', () => {
    const list = [
      offer('1', 'mod-b', new Date().toISOString()),
      offer('2'),
    ];
    expect(pickFirstEligibleOffer(list, 'mod-a')).toBe('2');
  });
});
