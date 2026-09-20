/**
 * Stable idempotency key for payout intents.
 * Mirrors distribution-style `…:v{n}` versioning.
 */

export function buildPayoutIntentIdempotencyKey(
  rewardId: string,
  version: number = 1,
): string {
  const v = Number.isFinite(version) ? Math.max(1, Math.floor(version)) : 1;
  const id = rewardId.trim();
  return `payout_intent:${id}:v${v}`;
}
