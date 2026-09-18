/**
 * Persistencia sessionStorage del estado Focus (sobrevive refresh de la pestaña).
 * Sin PII. Sin URLs. Solo IDs + contadores.
 */

import {
  createEmptySessionState,
  SESSION_ACTIONED_CAP,
  SESSION_SKIPPED_CAP,
  type ModerationSessionState,
} from './moderationSessionState';

const STORAGE_PREFIX = 'aventa.moderation.focusSession.v1:';

function storageKey(moderatorId: string, sourceTab: string): string {
  return `${STORAGE_PREFIX}${moderatorId}:${sourceTab}`;
}

function newSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeIdList(raw: unknown, cap: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  if (out.length <= cap) return out;
  return out.slice(out.length - cap);
}

export function loadModerationSessionState(
  moderatorId: string | null | undefined,
  sourceTab: string
): ModerationSessionState {
  const sid = newSessionId();
  if (!moderatorId || typeof window === 'undefined') {
    return createEmptySessionState(sid);
  }
  try {
    const raw = window.sessionStorage.getItem(storageKey(moderatorId, sourceTab));
    if (!raw) return createEmptySessionState(sid);
    const parsed = JSON.parse(raw) as Partial<ModerationSessionState>;
    if (typeof parsed.sessionId !== 'string' || !parsed.sessionId.trim()) {
      return createEmptySessionState(sid);
    }
    return {
      sessionId: parsed.sessionId.trim().slice(0, 64),
      reviewedCount: Math.max(0, Math.min(1_000_000, Number(parsed.reviewedCount) || 0)),
      skippedIds: sanitizeIdList(parsed.skippedIds, SESSION_SKIPPED_CAP),
      actionedIds: sanitizeIdList(parsed.actionedIds, SESSION_ACTIONED_CAP),
    };
  } catch {
    return createEmptySessionState(sid);
  }
}

export function saveModerationSessionState(
  moderatorId: string | null | undefined,
  sourceTab: string,
  state: ModerationSessionState
): void {
  if (!moderatorId || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(storageKey(moderatorId, sourceTab), JSON.stringify(state));
  } catch {
    // quota / private mode — fail soft
  }
}
