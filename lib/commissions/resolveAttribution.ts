/**
 * Resuelve creator_id a partir de filas de ledger (creator_id directo o tracking_tag → profiles).
 */

export type LedgerAttributionInput = {
  amount_cents: number | null;
  status?: string | null;
  creator_id?: string | null;
  tracking_tag?: string | null;
  attributable?: boolean | null;
};

export type ResolvedAttributionTotals = {
  grossCents: number;
  attributableCents: number;
  unattributableCents: number;
  /** Suma de comisión bruta atribuida por userId (antes del % share). */
  byCreatorCents: Map<string, number>;
};

/**
 * tagToUserId: mapa ml_tracking_tag (lower) → user id.
 * Si attributable=false, cuenta como no atribuible aunque tenga creator_id.
 * Si attributable=true o null y hay creator/tag resuelto → atribuible.
 */
export function resolveLedgerAttribution(
  rows: LedgerAttributionInput[],
  tagToUserId: Map<string, string>,
): ResolvedAttributionTotals {
  const byCreatorCents = new Map<string, number>();
  let grossCents = 0;
  let attributableCents = 0;
  let unattributableCents = 0;

  for (const row of rows) {
    const amount = Math.floor(Number(row.amount_cents ?? 0));
    if (!Number.isFinite(amount) || amount === 0) continue;
    grossCents += amount;

    const explicitNo = row.attributable === false;
    const tag = (row.tracking_tag ?? '').trim().toLowerCase();
    const fromTag = tag ? tagToUserId.get(tag) : undefined;
    const creatorId = row.creator_id || fromTag || null;

    const treatAsAttributable =
      !explicitNo && Boolean(creatorId) && (row.attributable === true || row.attributable == null || Boolean(creatorId));

    // attributable explícito true sin creator → no atribuible hasta resolver
    if (treatAsAttributable && creatorId) {
      attributableCents += amount;
      byCreatorCents.set(creatorId, (byCreatorCents.get(creatorId) ?? 0) + amount);
    } else {
      unattributableCents += amount;
    }
  }

  return { grossCents, attributableCents, unattributableCents, byCreatorCents };
}
