'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ImageOff, Bot } from 'lucide-react';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { moderationUi } from '../moderation/moderationUi';
import {
  buildBotFacts,
  buildBotScoreChips,
  parseBotMeta,
  type BotSignalLevel,
} from '@/lib/moderation/botFacts';

type Props = {
  mode?: ModerationHubMode;
  store?: string | null;
  botMeta?: unknown;
  moderatorComment?: string | null;
  /** `hero` ocupa el lugar de la foto ausente; `inline` va dentro del cuerpo. */
  variant?: 'hero' | 'inline';
  destination?: string | null;
};

const TONE_TEXT: Record<'neutral' | 'good' | 'warn', string> = {
  neutral: '',
  good: 'text-emerald-700 dark:text-emerald-300',
  warn: 'text-amber-700 dark:text-amber-200',
};

const LEVEL_DOT: Record<BotSignalLevel, string> = {
  good: 'bg-emerald-500',
  mid: 'bg-amber-500',
  weak: 'bg-red-500',
};

/**
 * Ficha del bot: sustituye a la foto ausente con los datos que el bot leyó de la
 * tienda, para que se entienda la oferta sin abrir el enlace.
 */
export default function ModerationBotFactsCard({
  mode = 'admin',
  store,
  botMeta,
  moderatorComment,
  variant = 'inline',
  destination,
}: Props) {
  const ui = moderationUi(mode);
  const [showRaw, setShowRaw] = useState(false);

  const parsed = useMemo(() => parseBotMeta(botMeta), [botMeta]);
  const facts = useMemo(() => buildBotFacts(parsed), [parsed]);
  const chips = useMemo(
    () => buildBotScoreChips({ botMeta: parsed, moderatorComment }),
    [parsed, moderatorComment]
  );

  const hasContent = facts.length > 0 || chips.length > 0;
  const isHero = variant === 'hero';

  return (
    <div
      className={
        isHero
          ? `flex flex-col gap-3 border-b px-4 py-4 ${ui.hairline} ${ui.heroBg}`
          : `space-y-3 rounded-xl border px-3 py-3 ${ui.border} ${ui.thumbBg}`
      }
    >
      <div className="flex items-center gap-2">
        {isHero ? (
          <ImageOff className={`h-4 w-4 shrink-0 ${ui.iconMuted}`} aria-hidden />
        ) : (
          <Bot className={`h-4 w-4 shrink-0 ${ui.iconMuted}`} aria-hidden />
        )}
        <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${ui.label}`}>
          {isHero ? 'Sin foto · lo que vio el bot' : 'Lo que vio el bot'}
        </p>
        {store?.trim() ? (
          <span className={`ml-auto truncate text-[11px] ${ui.muted}`}>{store.trim()}</span>
        ) : null}
      </div>

      {destination?.trim() ? (
        <p className={`text-sm ${ui.body}`}>
          Va a <span className="font-semibold">{destination.trim()}</span>
        </p>
      ) : null}

      {facts.length > 0 ? (
        <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.key} className="flex items-baseline justify-between gap-2">
              <dt className={`text-xs ${ui.muted}`}>{fact.label}</dt>
              <dd
                className={`text-right text-sm font-medium tabular-nums ${
                  TONE_TEXT[fact.tone ?? 'neutral'] || ui.body
                }`}
              >
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.key}
              title={`${chip.label}: ${chip.score}/100`}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] ${ui.borderStrong} ${ui.soft}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${LEVEL_DOT[chip.level]}`} aria-hidden />
              {chip.label} <span className={ui.muted}>{chip.verdict}</span>
            </span>
          ))}
        </div>
      ) : null}

      {!hasContent ? (
        <p className={`text-sm ${ui.muted}`}>
          El bot no guardó datos extra de esta oferta. Abre la tienda para revisarla.
        </p>
      ) : null}

      {moderatorComment?.trim() ? (
        <div>
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className={`inline-flex items-center gap-1 text-[11px] ${ui.muted} hover:underline`}
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${showRaw ? 'rotate-180' : ''}`}
              aria-hidden
            />
            Nota técnica
          </button>
          {showRaw ? (
            <p className={`mt-1 break-words font-mono text-[10px] leading-relaxed ${ui.faint}`}>
              {moderatorComment.trim()}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
