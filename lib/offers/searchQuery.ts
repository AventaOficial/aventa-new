const MAX_QUERY_LENGTH = 80;

/** Bound and strip control characters. Ranking happens in Postgres, not here. */
export function sanitizeSearchQuery(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}
