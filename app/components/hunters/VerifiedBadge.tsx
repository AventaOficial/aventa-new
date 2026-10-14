import { BadgeCheck } from 'lucide-react';

export const AVENTA_VERIFIED_LABEL = 'Verificado por AVENTA';

/** Insignia de autoría del equipo AVENTA. Solo para hunters del canon; no certifica precio ni stock. */
export function VerifiedBadge({ size = 14 }: { size?: number }) {
  return (
    <span
      role="img"
      aria-label={AVENTA_VERIFIED_LABEL}
      title={AVENTA_VERIFIED_LABEL}
      className="inline-flex shrink-0 items-center"
    >
      <BadgeCheck
        aria-hidden
        width={size}
        height={size}
        strokeWidth={2.25}
        className="fill-violet-600 text-violet-600 dark:fill-violet-500 dark:text-violet-500 [&>path:last-child]:stroke-white"
      />
    </span>
  );
}
