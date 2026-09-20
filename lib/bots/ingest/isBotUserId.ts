/**
 * Identifica autores machine del ingest (created_by ∈ BOT_INGEST_USER_ID*).
 * Misma autoridad que claimNextModerationOffer / botUserIdsForQuota.
 */
export function isBotUserId(userId: string | null | undefined): boolean {
  if (!userId?.trim()) return false;
  const ids = [
    process.env.BOT_INGEST_USER_ID,
    process.env.BOT_INGEST_USER_ID_TECH,
    process.env.BOT_INGEST_USER_ID_STAPLES,
  ]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v));
  return ids.includes(userId.trim());
}

export const BOT_AUTHOR_DISPLAY_NAME = 'Aventa Bot';
