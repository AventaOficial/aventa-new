/**
 * P0.3C — Integridad de sesión Focus (skip / exclude / contador / claimKind).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildSessionExcludeIds,
  bumpReviewedCount,
  createEmptySessionState,
  formatFocusSessionCounter,
  isExcludedBySession,
  markSessionOffer,
  SESSION_EXCLUDE_PAYLOAD_MAX,
  SESSION_SKIPPED_CAP,
} from '@/lib/moderation/moderationSessionState';
import { classifyClaimKind } from '@/lib/moderation/claimNextModerationOffer';
import { isOfferClaimEligible } from '@/lib/moderation/offerClaimEligibility';
import { CLAIM_EXCLUDE_IDS_MAX, CLAIM_QUEUE_HARD_CAP } from '@/lib/moderation/slaContract';
import { MODERATION_LOCK_STALE_MS } from '@/lib/moderation/moderationLock';

describe('P0.3C moderation session integrity', () => {
  it('1. classifyClaimKind: fresh vs stale_reclaim vs reclaim_own', () => {
    expect(
      classifyClaimKind({
        previousLockedBy: null,
        previousLockedAt: null,
        moderatorId: 'mod-a',
      })
    ).toBe('fresh');

    expect(
      classifyClaimKind({
        previousLockedBy: 'mod-a',
        previousLockedAt: new Date().toISOString(),
        moderatorId: 'mod-a',
      })
    ).toBe('reclaim_own');

    const staleAt = new Date(Date.now() - MODERATION_LOCK_STALE_MS - 1000).toISOString();
    expect(
      classifyClaimKind({
        previousLockedBy: 'mod-b',
        previousLockedAt: staleAt,
        moderatorId: 'mod-a',
      })
    ).toBe('stale_reclaim');
  });

  it('2. skip > 40: first skipped IDs remain excluded (P0.3B reproduction fixed)', () => {
    let state = createEmptySessionState('sess-1');
    const ids = Array.from({ length: 45 }, (_, i) => `offer-${i}`);
    for (const id of ids) {
      state = markSessionOffer(state, id, 'skipped');
    }
    // Bug antiguo: slice(-40) perdía offer-0…offer-4
    expect(isExcludedBySession(state, 'offer-0')).toBe(true);
    expect(isExcludedBySession(state, 'offer-4')).toBe(true);
    expect(isExcludedBySession(state, 'offer-44')).toBe(true);

    const exclude = new Set(buildSessionExcludeIds(state));
    expect(exclude.has('offer-0')).toBe(true);
    expect(exclude.has('offer-44')).toBe(true);

    // Eligibility filter respects exclude (server-side contract)
    const sample = {
      id: 'offer-0',
      created_at: new Date().toISOString(),
      locked_by: null,
      locked_at: null,
    };
    expect(isOfferClaimEligible(sample, 'mod-a', exclude)).toBe(false);
  });

  it('3. repeated mark skipped is idempotent and bounded', () => {
    let state = createEmptySessionState('s');
    for (let i = 0; i < SESSION_SKIPPED_CAP + 50; i++) {
      state = markSessionOffer(state, `o-${i}`, 'skipped');
    }
    expect(state.skippedIds.length).toBe(SESSION_SKIPPED_CAP);
    expect(state.skippedIds[0]).toBe('o-50');
    expect(isExcludedBySession(state, 'o-0')).toBe(false); // dropped by FIFO beyond cap
    expect(isExcludedBySession(state, `o-${SESSION_SKIPPED_CAP + 49}`)).toBe(true);
  });

  it('4. actioned removes from skipped and stays excluded', () => {
    let state = createEmptySessionState('s');
    state = markSessionOffer(state, 'a1', 'skipped');
    state = markSessionOffer(state, 'a1', 'actioned');
    expect(state.skippedIds.includes('a1')).toBe(false);
    expect(state.actionedIds.includes('a1')).toBe(true);
    expect(isExcludedBySession(state, 'a1')).toBe(true);
    // skip after actioned no-op
    const again = markSessionOffer(state, 'a1', 'skipped');
    expect(again.actionedIds.includes('a1')).toBe(true);
  });

  it('5. exclude payload prioritizes actioned; stays within max', () => {
    let state = createEmptySessionState('s');
    for (let i = 0; i < 100; i++) state = markSessionOffer(state, `act-${i}`, 'actioned');
    for (let i = 0; i < 100; i++) state = markSessionOffer(state, `sk-${i}`, 'skipped');
    const payload = buildSessionExcludeIds(state);
    expect(payload.length).toBeLessThanOrEqual(SESSION_EXCLUDE_PAYLOAD_MAX);
    expect(payload.length).toBeLessThanOrEqual(CLAIM_EXCLUDE_IDS_MAX);
    expect(payload.slice(0, 100).every((id) => id.startsWith('act-'))).toBe(true);
  });

  it('6. counter semantics: no fake "de N" total', () => {
    expect(
      formatFocusSessionCounter({
        reviewedCount: 2,
        globalPending: 33,
        viewingHistory: false,
      })
    ).toBe('2 revisadas · 33 pendientes');
    expect(
      formatFocusSessionCounter({
        reviewedCount: 2,
        globalPending: 33,
        viewingHistory: true,
      })
    ).toBe('Historial · 2 revisadas · 33 pendientes');
  });

  it('7. reviewedCount bumps without touching exclude', () => {
    const s0 = createEmptySessionState('s');
    const s1 = bumpReviewedCount(s0);
    expect(s1.reviewedCount).toBe(1);
    expect(s1.skippedIds).toEqual([]);
  });

  it('8. hook no longer uses exclude ring slice(-40)', () => {
    const hook = readFileSync(
      join(process.cwd(), 'lib/hooks/useModerationFocusQueue.ts'),
      'utf8'
    );
    expect(hook).not.toMatch(/slice\(-40\)/);
    expect(hook).toContain('buildSessionExcludeIds');
    expect(hook).toContain('markSessionOffer');
    expect(hook).toContain('viewingHistory');
    expect(hook).toContain('sessionCounterLabel');
    expect(hook).toContain('Estás en historial. Vuelve a la oferta activa');
  });

  it('9. workspace shows session counter + Historial badge (not Oferta X de Y)', () => {
    const ws = readFileSync(
      join(process.cwd(), 'app/components/moderation/ModerationFocusWorkspace.tsx'),
      'utf8'
    );
    expect(ws).toContain('sessionCounterLabel');
    expect(ws).toContain('Historial');
    expect(ws).not.toMatch(/Oferta \{queue\.position\} de \{queue\.total\}/);
    expect(ws).toContain('disabled={queue.viewingHistory}');
  });

  it('9b. viewingHistory disables FixSheet/edit; live offer keeps canEdit path', () => {
    const ws = readFileSync(
      join(process.cwd(), 'app/components/moderation/ModerationFocusWorkspace.tsx'),
      'utf8'
    );
    expect(ws).toContain('const canEdit = !queue.viewingHistory');
    expect(ws).toContain('canEdit={canEdit}');
    expect(ws).toContain('editOpen && canEdit');
    // Must not hardcode drawer edit as always-on
    expect(ws).not.toMatch(/canEdit\s*\n\s*onClose=\{\(\) => setWhyOpen/);
    const desktop = readFileSync(
      join(process.cwd(), 'app/components/moderation/FocusDesktopContext.tsx'),
      'utf8'
    );
    expect(desktop).toContain('canEdit?: boolean');
    expect(desktop).toMatch(/\{canEdit \? \(/);
  });

  it('10. claim-next returns claimKind; hard caps unchanged', () => {
    expect(CLAIM_QUEUE_HARD_CAP).toBe(1000);
    expect(CLAIM_EXCLUDE_IDS_MAX).toBe(2000);
    const route = readFileSync(
      join(process.cwd(), 'app/api/admin/moderation/claim-next/route.ts'),
      'utf8'
    );
    expect(route).toContain('claimKind');
    expect(route).toContain('stale_reclaim');
    const claim = readFileSync(
      join(process.cwd(), 'lib/moderation/claimNextModerationOffer.ts'),
      'utf8'
    );
    expect(claim).toContain('classifyClaimKind');
    expect(claim).toContain('claimKind');
  });

  it('11. goPrev does not call claim-next (source contract)', () => {
    const hook = readFileSync(
      join(process.cwd(), 'lib/hooks/useModerationFocusQueue.ts'),
      'utf8'
    );
    const goPrevBlock = hook.slice(hook.indexOf('const goPrev'), hook.indexOf('const dismissAffiliateGate'));
    expect(goPrevBlock).not.toContain('claimNext');
    expect(goPrevBlock).toContain('setHistoryIndex');
  });

  it('12. skip telemetry + session storage modules exist', () => {
    const tel = readFileSync(
      join(process.cwd(), 'lib/moderation/focusSessionTelemetry.ts'),
      'utf8'
    );
    expect(tel).toContain("'skip'");
    expect(tel).toContain("'stale_reclaim'");
    const storage = readFileSync(
      join(process.cwd(), 'lib/moderation/moderationSessionStorage.ts'),
      'utf8'
    );
    expect(storage).toContain('sessionStorage');
    expect(storage).toContain('sanitizeIdList');
  });

  it('13. heartbeat depends on activeLeaseOfferId — not history navigation', () => {
    const hook = readFileSync(
      join(process.cwd(), 'lib/hooks/useModerationFocusQueue.ts'),
      'utf8'
    );
    expect(hook).toContain('activeLeaseOfferId');
    expect(hook).toContain('[activeLeaseOfferId, postLock, session?.access_token]');
    expect(hook).not.toMatch(/}, \[offer\?\.id, historyIndex, postLock/);
    const goPrevBlock = hook.slice(
      hook.indexOf('const goPrev'),
      hook.indexOf('const dismissAffiliateGate')
    );
    expect(goPrevBlock).not.toContain('setHeldLease');
    expect(goPrevBlock).not.toContain('postLock');
  });

  it('14. claim-next slices excludeOfferIds server-side', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/admin/moderation/claim-next/route.ts'),
      'utf8'
    );
    expect(route).toContain('CLAIM_EXCLUDE_IDS_MAX');
    expect(route).toContain('.slice(-CLAIM_EXCLUDE_IDS_MAX)');
  });

  it('15. oversized exclude input is bounded by session payload max', () => {
    let state = createEmptySessionState('s');
    for (let i = 0; i < SESSION_EXCLUDE_PAYLOAD_MAX + 100; i++) {
      state = markSessionOffer(state, `x-${i}`, 'skipped');
    }
    const payload = buildSessionExcludeIds(state);
    expect(payload.length).toBe(SESSION_EXCLUDE_PAYLOAD_MAX);
    expect(payload.length).toBeLessThanOrEqual(CLAIM_EXCLUDE_IDS_MAX);
  });
});
