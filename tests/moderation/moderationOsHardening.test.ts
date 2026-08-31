import { describe, expect, it } from 'vitest';
import {
  assertModeratorOwnsLock,
  moderatorOwnsActiveLock,
} from '@/lib/moderation/atomicModerationLock';
import { canUseBulkModeration } from '@/lib/moderation/moderationBulkAccess';
import { MODERATION_LOCK_STALE_MS } from '@/lib/moderation/moderationLock';

describe('Moderation OS — ownership (escenarios 3, 7, 8)', () => {
  const now = new Date().toISOString();

  it('escenario 3: Mod B no puede decidir oferta bloqueada por Mod A', () => {
    const result = assertModeratorOwnsLock({ locked_by: 'mod-a', locked_at: now }, 'mod-b');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('otro usuario');
  });

  it('escenario 7: affiliate paste requiere lock propio (misma regla que approve)', () => {
    const foreign = assertModeratorOwnsLock({ locked_by: 'mod-b', locked_at: now }, 'mod-a');
    expect(foreign.ok).toBe(false);

    const own = assertModeratorOwnsLock({ locked_by: 'mod-a', locked_at: now }, 'mod-a');
    expect(own.ok).toBe(true);
  });

  it('escenario 8: approve sin claim (locked_by null) → rechazado', () => {
    const result = assertModeratorOwnsLock({ locked_by: null, locked_at: null }, 'mod-a');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('reclamar');
    expect(moderatorOwnsActiveLock({ locked_by: null, locked_at: null }, 'mod-a')).toBe(false);
  });

  it('Mod A con lock vigente puede decidir', () => {
    expect(assertModeratorOwnsLock({ locked_by: 'mod-a', locked_at: now }, 'mod-a').ok).toBe(true);
  });
});

describe('Moderation OS — bulk perimeter (escenario 6)', () => {
  it('moderator normal no puede batch approve/reject/expire', () => {
    expect(canUseBulkModeration('moderator')).toBe(false);
  });

  it('owner/admin sí pueden batch', () => {
    expect(canUseBulkModeration('owner')).toBe(true);
    expect(canUseBulkModeration('admin')).toBe(true);
  });
});

describe('Moderation OS — idempotencia de decisión (escenario 5)', () => {
  function simulateDecisionIdempotency(
    currentStatus: string,
    requestedStatus: string
  ): 'apply' | 'idempotent' | 'conflict' {
    if (currentStatus === requestedStatus) return 'idempotent';
    if (currentStatus !== 'pending') return 'conflict';
    return 'apply';
  }

  it('doble approve sobre oferta ya aprobada → idempotente', () => {
    expect(simulateDecisionIdempotency('approved', 'approved')).toBe('idempotent');
  });

  it('approve sobre pending → aplica una vez', () => {
    expect(simulateDecisionIdempotency('pending', 'approved')).toBe('apply');
    expect(simulateDecisionIdempotency('approved', 'approved')).toBe('idempotent');
  });
});

describe('Moderation OS — stale lock recovery (escenario 4)', () => {
  it('lock expirado no cuenta como ownership activo', () => {
    const stale = new Date(Date.now() - MODERATION_LOCK_STALE_MS - 5000).toISOString();
    expect(moderatorOwnsActiveLock({ locked_by: 'mod-a', locked_at: stale }, 'mod-a')).toBe(false);
    const reclaim = assertModeratorOwnsLock({ locked_by: 'mod-a', locked_at: stale }, 'mod-a');
    expect(reclaim.ok).toBe(false);
  });
});
