'use client';

import Link from 'next/link';
import { Camera, MapPin, User } from 'lucide-react';
import { getReputationLabel } from '@/lib/reputation';

type HunterHeaderProps = {
  displayName: string;
  avatarUrl: string | null;
  level: number;
  publicHref: string | null;
  score: number;
  avatarUploading: boolean;
  onPickAvatar: () => void;
  bio?: string | null;
  city?: string | null;
  state?: string | null;
  joinedAt?: string | null;
  trusted?: boolean;
};

export default function HunterHeader({
  displayName,
  avatarUrl,
  level,
  publicHref,
  avatarUploading,
  onPickAvatar,
  bio,
  city,
  state,
  joinedAt,
  trusted = false,
}: HunterHeaderProps) {
  const levelLabel = getReputationLabel(level);
  const handle = publicHref?.startsWith('/u/') ? publicHref.slice(3) : null;
  const place = [city, state].filter(Boolean).join(', ');
  const joined = joinedAt ? new Date(joinedAt) : null;
  const joinedYear = joined && !Number.isNaN(joined.getTime()) ? joined.getFullYear() : null;

  return (
    <header className="flex h-full flex-col gap-4 rounded-2xl border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none px-4 py-4 text-[var(--me-ink)] sm:flex-row sm:items-center sm:px-5">
      <div className="relative shrink-0">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-violet-950 ring-2 ring-violet-400/40 sm:h-20 sm:w-20">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <User className="h-8 w-8 text-[var(--me-ink)]" aria-hidden />
          )}
        </div>
        <button
          type="button"
          disabled={avatarUploading}
          onClick={onPickAvatar}
          aria-label={avatarUploading ? 'Subiendo foto de perfil' : 'Cambiar foto de perfil'}
          className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#1d1d1f] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50"
        >
          <Camera className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h2 className="truncate text-[22px] font-semibold leading-none">{displayName}</h2>
          {trusted ? <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 text-[10px]" aria-label="Cuenta de confianza">✓</span> : null}
        </div>
        {handle ? <p className="mt-1 truncate text-[13px] text-[var(--me-muted)]">@{handle}</p> : null}
        <p className="mt-2 text-[13px]">
          Cazador · Nivel {level} · {levelLabel}
        </p>
        {bio ? <p className="mt-2 text-[13px] text-[var(--me-muted)]">{bio}</p> : null}
        {place || joinedYear || publicHref ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--me-muted)]">
            {place ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                {place}
              </span>
            ) : null}
            {joinedYear ? <span>Se unió en {joinedYear}</span> : null}
            {publicHref ? (
              <a href={publicHref} className="text-violet-600 dark:text-violet-300 hover:text-violet-800 dark:hover:text-violet-200">
                {publicHref}
              </a>
            ) : null}
          </p>
        ) : null}
      </div>
      <Link
        href="/settings"
        className="inline-flex h-9 shrink-0 items-center gap-2 self-start rounded-full border border-[var(--me-line)] px-3 text-[13px] font-medium text-[var(--me-ink)] hover:bg-[var(--me-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 sm:self-center"
      >
        <Camera className="h-3.5 w-3.5" aria-hidden />
        Editar perfil
      </Link>
    </header>
  );
}
