'use client';

import Link from 'next/link';
import { ExternalLink, User } from 'lucide-react';
import { getReputationLabel } from '@/lib/reputation';

type HunterHeaderProps = {
  displayName: string;
  avatarUrl: string | null;
  level: number;
  publicHref: string | null;
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

  return (
    <header className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#121214] sm:p-6">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-violet-600 ring-2 ring-violet-500/30">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className="h-8 w-8 text-white" aria-hidden />
            )}
          </div>
          <button
            type="button"
            disabled={avatarUploading}
            onClick={onPickAvatar}
            className="text-xs font-medium text-violet-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50 dark:text-violet-400"
          >
            {avatarUploading ? 'Subiendo…' : 'Cambiar foto'}
          </button>
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-300">
            Mi centro de operaciones
          </p>
          <h1 className="truncate text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">{displayName}</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-zinc-300">
            Nivel {level} · {levelLabel}
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-zinc-500">Así trabajo yo dentro de Aventa.</p>
          {publicHref ? (
            <Link
              href={publicHref}
              className="mt-3 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
            >
              Así me ve la comunidad
              <ExternalLink className="h-3 w-3" aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
