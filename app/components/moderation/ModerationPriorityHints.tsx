'use client';

import { evaluateModerationPriority } from '@/lib/moderation/moderationPriority';
import { parseBotMeta } from '@/lib/moderation/botFacts';
import { cn } from '@/app/components/panel/utils';

type Props = {
  price?: number | null;
  originalPrice?: number | null;
  imageUrl?: string | null;
  isBot?: boolean | null;
  createdAt?: string | null;
  botMeta?: unknown;
  /** compact = chip + 2 reasons; full = chip + hasta 4 reasons */
  density?: 'compact' | 'full';
  className?: string;
  mutedClassName?: string;
};

const TONE: Record<string, string> = {
  P1_HIGH_VALUE:
    'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 ring-emerald-500/30',
  P2_REVIEW: 'bg-sky-500/15 text-sky-800 dark:text-sky-300 ring-sky-500/30',
  P3_INSUFFICIENT_EVIDENCE:
    'bg-amber-500/15 text-amber-900 dark:text-amber-300 ring-amber-500/30',
  P4_LOW_VALUE: 'bg-rose-500/10 text-rose-800 dark:text-rose-300 ring-rose-500/25',
};

function pendingAgeLabel(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return null;
  const hours = Math.max(0, (Date.now() - t) / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m en cola`;
  if (hours < 24) return `${Math.round(hours)}h en cola`;
  return `${Math.round(hours / 24)}d en cola`;
}

/**
 * Chip + razones compactas para la cola de moderación.
 * No decide approve/reject — solo ordena atención humana.
 */
export default function ModerationPriorityHints({
  price,
  originalPrice,
  imageUrl,
  isBot,
  createdAt,
  botMeta,
  density = 'full',
  className,
  mutedClassName,
}: Props) {
  const result = evaluateModerationPriority({
    price,
    originalPrice,
    imageUrl,
    isBot,
    createdAt,
    botMeta,
  });
  const maxReasons = density === 'compact' ? 2 : 4;
  const reasons = result.reasons.slice(0, maxReasons);
  const source = parseBotMeta(botMeta)?.source?.trim() || (isBot ? 'bot' : 'comunidad');
  const age = pendingAgeLabel(createdAt);

  return (
    <div className={cn('space-y-1', className)} data-moderation-priority={result.priority}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            'inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset',
            TONE[result.priority],
          )}
        >
          {result.shortLabel}
        </span>
        <span className={cn('text-[10px] font-medium uppercase tracking-wide', mutedClassName)}>
          {source}
        </span>
        {age ? <span className={cn('text-[10px]', mutedClassName)}>{age}</span> : null}
      </div>
      {reasons.length > 0 ? (
        <ul className={cn('space-y-0.5 text-left text-[11px] leading-snug', mutedClassName)}>
          {reasons.map((r) => (
            <li key={r.code} className="flex gap-1">
              <span aria-hidden className="shrink-0">
                {r.kind === 'positive' ? '✓' : '⚠'}
              </span>
              <span>{r.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
