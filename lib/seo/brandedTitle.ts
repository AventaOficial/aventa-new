import type { Metadata } from 'next';

/**
 * Document title that already includes the brand.
 * The root layout template is `%s | AVENTA`. A plain string that also
 * ends in `| AVENTA` is rendered twice. `title.absolute` skips that template.
 */
export function brandedTitle(segment: string): { title: NonNullable<Metadata['title']> } {
  const clean = segment.replace(/\s*\|\s*AVENTA\s*$/i, '').trim();
  if (!clean || clean.toUpperCase() === 'AVENTA') {
    return { title: { absolute: 'AVENTA' } };
  }
  return { title: { absolute: `${clean} | AVENTA` } };
}
