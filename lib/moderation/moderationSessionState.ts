/**
 * Estado de sesión Focus (cliente) — SEEN / SKIPPED / ACTIONED.
 *
 * No es autoridad de claim/lease (eso es el servidor).
 * Solo evita reaparición accidental de ofertas aún pending dentro de la misma sesión.
 *
 * Bounded: no Set infinito. A escala extrema (más skips que el cap) los skips
 * más antiguos pueden volver a ser elegibles — documentado y determinista.
 */

export const SESSION_SKIPPED_CAP = 2000;
export const SESSION_ACTIONED_CAP = 2000;
/** Máximo de IDs enviados al claim-next (actioned primero, luego skipped recientes). */
export const SESSION_EXCLUDE_PAYLOAD_MAX = 2000;
export const SESSION_HISTORY_CAP = 30;

export type SessionOfferMark = 'skipped' | 'actioned';

export type ModerationSessionState = {
  /** UUID de sesión de pestaña (sessionStorage). */
  sessionId: string;
  /** Claims exitosos en esta sesión (revisadas). */
  reviewedCount: number;
  /**
   * SKIPPED_THIS_SESSION — goNext sin approve/reject/snooze.
   * FIFO acotado; no muta la oferta en DB.
   */
  skippedIds: string[];
  /**
   * ACTIONED esta sesión (approve / reject / snooze).
   * Approve/reject ya salen de pending en servidor; snooze necesita exclude
   * de sesión para no reaparecer si el snooze expira durante la misma sesión.
   */
  actionedIds: string[];
};

export function createEmptySessionState(sessionId: string): ModerationSessionState {
  return {
    sessionId,
    reviewedCount: 0,
    skippedIds: [],
    actionedIds: [],
  };
}

function pushBounded(list: string[], id: string, cap: number): string[] {
  const without = list.filter((x) => x !== id);
  without.push(id);
  if (without.length <= cap) return without;
  return without.slice(without.length - cap);
}

export function markSessionOffer(
  state: ModerationSessionState,
  offerId: string,
  mark: SessionOfferMark
): ModerationSessionState {
  const id = offerId.trim();
  if (!id) return state;

  if (mark === 'actioned') {
    return {
      ...state,
      skippedIds: state.skippedIds.filter((x) => x !== id),
      actionedIds: pushBounded(state.actionedIds, id, SESSION_ACTIONED_CAP),
    };
  }

  // skipped: si ya fue actioned, no degradar
  if (state.actionedIds.includes(id)) return state;
  return {
    ...state,
    skippedIds: pushBounded(state.skippedIds, id, SESSION_SKIPPED_CAP),
  };
}

export function bumpReviewedCount(state: ModerationSessionState): ModerationSessionState {
  return { ...state, reviewedCount: state.reviewedCount + 1 };
}

/**
 * Exclude para claim-next: actioned ∪ skipped, actioned primero,
 * skipped más recientes al final del payload (slice mantiene el final).
 */
export function buildSessionExcludeIds(state: ModerationSessionState): string[] {
  const actioned = state.actionedIds;
  const skipped = state.skippedIds.filter((id) => !actioned.includes(id));
  const merged = [...actioned, ...skipped];
  if (merged.length <= SESSION_EXCLUDE_PAYLOAD_MAX) return merged;
  // Conservar todos los actioned posibles; rellenar con skipped recientes.
  const actionedKeep = actioned.slice(-SESSION_ACTIONED_CAP);
  const room = Math.max(0, SESSION_EXCLUDE_PAYLOAD_MAX - actionedKeep.length);
  const skippedKeep = skipped.slice(-room);
  return [...actionedKeep, ...skippedKeep];
}

export function formatFocusSessionCounter(params: {
  reviewedCount: number;
  globalPending: number;
  viewingHistory: boolean;
}): string {
  const reviewed = Math.max(0, params.reviewedCount);
  const pending = Math.max(0, params.globalPending);
  const base = `${reviewed} revisadas · ${pending} pendientes`;
  return params.viewingHistory ? `Historial · ${base}` : base;
}

/** Pure: ¿el exclude de sesión impediría re-elegir este id? */
export function isExcludedBySession(state: ModerationSessionState, offerId: string): boolean {
  return state.actionedIds.includes(offerId) || state.skippedIds.includes(offerId);
}
