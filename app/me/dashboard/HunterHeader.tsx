'use client';

import { Camera, Pencil, User } from 'lucide-react';
import { getReputationLabel } from '@/lib/reputation';

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
  publicHref,
  avatarUploading,
  onPickAvatar,
}: HunterHeaderProps) {
  const levelLabel = getReputationLabel(level);
  const handle = publicHref?.startsWith('/u/') ? publicHref.slice(3) : null;

  return (
    <header className="flex h-full flex-col gap-4 rounded-2xl border border-black/[0.04] bg-white px-5 py-4 shadow-sm dark:border-white/10 dark:bg-[#141414] sm:flex-row sm:items-center">
      <div className="relative shrink-0">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[#1d1d1f] dark:bg-[#1c1c1c]">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <User className="h-8 w-8 text-[#fafafa]" aria-hidden />
          )}
        </div>
        <button
          type="button"
          disabled={avatarUploading}
          onClick={onPickAvatar}
          aria-label={avatarUploading ? 'Subiendo foto' : 'Cambiar foto'}
          className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-black/5 bg-white text-[#1d1d1f] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50 dark:border-white/10 dark:bg-[#1c1c1c] dark:text-[#fafafa]"
        >
          <Camera className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[22px] font-semibold leading-none text-[#1d1d1f] dark:text-[#fafafa]">{displayName}</h1>
        {handle ? <p className="mt-1.5 truncate text-[13px] leading-none text-[#6e6e73] dark:text-[#a3a3a3]">@{handle}</p> : null}
        <p className="mt-2 text-[13px] leading-none text-[#1d1d1f] dark:text-[#fafafa]">
          Cazador · Nivel {level} · {levelLabel}
        </p>
      </div>
      <button
        type="button"
        disabled={avatarUploading}
        onClick={onPickAvatar}
        className="inline-flex h-9 shrink-0 items-center gap-2 self-start rounded-full border border-black/10 px-3.5 text-[13px] font-medium text-[#1d1d1f] transition-colors duration-150 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50 dark:border-white/15 dark:text-[#fafafa] dark:hover:bg-white/5 sm:self-center"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        {avatarUploading ? 'Subiendo…' : 'Editar perfil'}
      </button>
    </header>
  );
}
