const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normaliza slug almacenado en BD para URL (misma idea que sync-profile). */
function normalizeStoredSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Ruta `/u/...` alineada con `get_profile_by_slug` → `profiles.slug`.
 * Si `storedSlug` viene del join (public_profiles_view.slug), tiene prioridad sobre el slug derivado del nombre.
 */
export function publicProfilePath(
  displayName: string | null | undefined,
  userId: string | null | undefined,
  storedSlug?: string | null
): string | null {
  if (typeof userId !== 'string') return null;
  const id = userId.trim();
  if (!UUID_RE.test(id)) return null;
  const fromDb =
    typeof storedSlug === 'string' && storedSlug.trim().length > 0
      ? normalizeStoredSlug(storedSlug)
      : '';
  const slug = fromDb || profileSlugFromDisplayName(displayName, id);
  return `/u/${slug}`;
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
