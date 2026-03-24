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
