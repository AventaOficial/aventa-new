/** Utilidades UI CEO — client-safe (sin imports server/hunter). */

export function diffLabel(current: number | null, previous: number | null): string | null {
  if (current == null || previous == null) return null;
  const d = current - previous;
  if (d === 0) return 'igual que ayer';
  const sign = d > 0 ? '+' : '';
  return `${sign}${d} vs ayer`;
}

export function formatDiff(
  current: number | null,
  previous: number | null,
): {
  delta: number | null;
  label: string | null;
} {
  if (current == null || previous == null) return { delta: null, label: null };
  const delta = current - previous;
  return { delta, label: diffLabel(current, previous) };
}
