const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ruta `/u/...` coherente con `profiles.slug` (sync-profile / settings). */
export function publicProfilePath(
  displayName: string | null | undefined,
  userId: string | null | undefined
): string | null {
  if (typeof userId !== 'string') return null;
  const id = userId.trim();
  if (!UUID_RE.test(id)) return null;
  return `/u/${profileSlugFromDisplayName(displayName, id)}`;
}

/**
 * Slug público para /u/[slug], alineado con app/api/sync-profile (toSlug).
 */
export function profileSlugFromDisplayName(name: string | null | undefined, userId: string): string {
  if (typeof name !== 'string' || !name.trim()) {
    return `user-${userId.slice(0, 8)}`;
  }
  const s = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  return s || `user-${userId.slice(0, 8)}`;
}
