'use client';

import { User } from 'lucide-react';
import { REPUTATION_LEVELS, getReputationLabel } from '@/lib/reputation';

type HunterHeaderProps = {
  displayName: string;
  avatarUrl: string | null;
  level: number;
  publicHref: string | null;
  score: number;
  avatarUploading: boolean;
  onPickAvatar: () => void;
};

export default function HunterHeader({
  displayName,
  avatarUrl,
  level,
  score,
  publicHref,
  avatarUploading,
  onPickAvatar,
}: HunterHeaderProps) {
  const levelLabel = getReputationLabel(level);
  const handle = publicHref?.startsWith('/u/') ? publicHref.slice(3) : null;
  const band = REPUTATION_LEVELS.find((item) => item.level === level);
  const progressLine =
    band && band.maxScore !== Infinity ? `${score} / ${band.maxScore + 1} puntos` : `${score} puntos`;

  return (
    <header className="flex items-center gap-4">
      <div className="flex shrink-0 flex-col items-center gap-2">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[#1d1d1f] dark:bg-[#141414]">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <User className="h-7 w-7 text-[#fafafa]" aria-hidden />
          )}
        </div>
        <button
          type="button"
          disabled={avatarUploading}
          onClick={onPickAvatar}
          className="text-[13px] text-[#6e6e73] transition-colors duration-150 hover:text-[#1d1d1f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d1d1f] disabled:opacity-50 dark:text-[#a3a3a3] dark:hover:text-[#fafafa] dark:focus-visible:ring-[#fafafa]"
        >
          {avatarUploading ? 'Subiendo…' : 'Cambiar foto'}
        </button>
      </div>
      <div className="min-w-0">
        <h1 className="truncate text-[28px] font-semibold leading-tight text-[#1d1d1f] dark:text-[#fafafa] md:text-[34px]">
          {displayName}
        </h1>
        {handle ? (
          <p className="mt-1 truncate text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">@{handle}</p>
        ) : null}
        <p className="mt-1 text-[15px] text-[#1d1d1f] dark:text-[#fafafa]">
          Cazador · Nivel {level} · {levelLabel}
        </p>
        <p className="mt-1 text-[13px] tabular-nums text-[#6e6e73] dark:text-[#a3a3a3]">{progressLine}</p>
      </div>
    </header>
  );
}
