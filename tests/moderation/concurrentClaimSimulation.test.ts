import { describe, expect, it } from 'vitest';
import { MODERATION_LOCK_STALE_MS } from '@/lib/moderation/moderationLock';
import { sortPendingOffersForModeration } from '@/lib/moderation/sortPendingOffers';

type MemOffer = {
  id: string;
  created_at: string;
  locked_by: string | null;
  locked_at: string | null;
  snoozed_until: string | null;
  status: 'pending' | 'approved';
};

class MemoryModerationStore {
  offers = new Map<string, MemOffer>();

  constructor(ids: string[]) {
    const base = Date.now();
    for (let i = 0; i < ids.length; i += 1) {
      this.offers.set(ids[i], {
        id: ids[i],
        created_at: new Date(base - i * 1000).toISOString(),
        locked_by: null,
        locked_at: null,
        snoozed_until: null,
        status: 'pending',
      });
    }
  }

  tryAcquire(offerId: string, moderatorId: string, nowMs = Date.now()): boolean {
    const row = this.offers.get(offerId);
    if (!row || row.status !== 'pending') return false;
    if (row.snoozed_until) {
      const snooze = new Date(row.snoozed_until).getTime();
      if (Number.isFinite(snooze) && snooze > nowMs) return false;
    }
    const stale =
      !row.locked_at || nowMs - new Date(row.locked_at).getTime() > MODERATION_LOCK_STALE_MS;
    if (row.locked_by && row.locked_by !== moderatorId && !stale) return false;
    row.locked_by = moderatorId;
    row.locked_at = new Date(nowMs).toISOString();
    return true;
  }

  claimNext(moderatorId: string, exclude = new Set<string>()): string | null {
    const candidates = sortPendingOffersForModeration(
      [...this.offers.values()].filter((o) => o.status === 'pending' && !exclude.has(o.id))
    );
    for (const candidate of candidates) {
      if (this.tryAcquire(candidate.id, moderatorId)) return candidate.id;
    }
    return null;
  }
}

describe('concurrent claim simulation', () => {
  it('10 claims simultáneos producen 10 ofertas distintas', async () => {
    const store = new MemoryModerationStore(
      Array.from({ length: 12 }, (_, i) => String(i + 1))
    );
    const moderators = Array.from({ length: 10 }, (_, i) => `mod-${i + 1}`);

    const claimed = await Promise.all(
      moderators.map(async (mod) => store.claimNext(mod))
    );

    const valid = claimed.filter((id): id is string => Boolean(id));
    expect(valid).toHaveLength(10);
    expect(new Set(valid).size).toBe(10);
  });

  it('2 claims simultáneos sobre la misma oferta: solo uno gana', async () => {
    const store = new MemoryModerationStore(['1', '2']);
    const [a, b] = await Promise.all([
      Promise.resolve(store.tryAcquire('1', 'mod-a')),
      Promise.resolve(store.tryAcquire('1', 'mod-b')),
    ]);
    expect(a !== b).toBe(true);
    expect(a || b).toBe(true);
  });

  it('lock ajeno activo no puede reclamarse', () => {
    const store = new MemoryModerationStore(['1']);
    expect(store.tryAcquire('1', 'mod-a')).toBe(true);
    expect(store.tryAcquire('1', 'mod-b')).toBe(false);
  });

  it('lock stale puede recuperarse', () => {
    const store = new MemoryModerationStore(['1']);
    const staleAt = Date.now() - MODERATION_LOCK_STALE_MS - 1000;
    store.offers.get('1')!.locked_by = 'mod-a';
    store.offers.get('1')!.locked_at = new Date(staleAt).toISOString();
    expect(store.tryAcquire('1', 'mod-b', Date.now())).toBe(true);
  });
});
