import { describe, expect, it } from 'vitest';
import {
  assertModeratorOwnsLock,
  moderatorOwnsActiveLock,
} from '@/lib/moderation/atomicModerationLock';
import { MODERATION_LOCK_STALE_MS } from '@/lib/moderation/moderationLock';

describe('assertModeratorOwnsLock (estación normal)', () => {
  it('rechaza decidir sin lock previo', () => {
    const result = assertModeratorOwnsLock({ locked_by: null, locked_at: null }, 'mod-a');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('reclamar');
  });

  it('permite al dueño del lock activo', () => {
    const now = new Date().toISOString();
    expect(
      assertModeratorOwnsLock({ locked_by: 'mod-a', locked_at: now }, 'mod-a').ok
    ).toBe(true);
    expect(moderatorOwnsActiveLock({ locked_by: 'mod-a', locked_at: now }, 'mod-a')).toBe(true);
  });

  it('rechaza lock ajeno activo', () => {
    const now = new Date().toISOString();
    const result = assertModeratorOwnsLock({ locked_by: 'mod-b', locked_at: now }, 'mod-a');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('otro usuario');
    }
  });

  it('rechaza lock stale del propio moderador', () => {
    const stale = new Date(Date.now() - MODERATION_LOCK_STALE_MS - 1000).toISOString();
    const result = assertModeratorOwnsLock({ locked_by: 'mod-a', locked_at: stale }, 'mod-a');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('expiró');
  });
});
