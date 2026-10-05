import Link from 'next/link';
import type { HunterPublicIdentity } from '@/lib/product/hunters/identity';

export function HunterMark({
  name,
  accent,
  avatarUrl,
  size = 20,
}: {
  name: string;
  accent: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
      style={{ width: size, height: size, background: accent }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function HunterFoundLine({ hunter }: { hunter: HunterPublicIdentity }) {
  return (
    <Link
      href={hunter.profilePath}
      onClick={(event) => event.stopPropagation()}
      className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-violet-600 hover:underline dark:text-violet-400 md:text-xs"
    >
      <HunterMark name={hunter.name} accent={hunter.accent} avatarUrl={hunter.avatarUrl} />
      <span className="truncate">{hunter.foundLabel}</span>
    </Link>
  );
}

export function HunterFoundSection({ hunter }: { hunter: HunterPublicIdentity }) {
  return (
    <section className="mt-5 rounded-2xl border border-black/[0.06] bg-[#fafafa] p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-500">Encontrada por {hunter.name}</p>
      <div className="mt-3 flex items-center gap-3">
        <HunterMark name={hunter.name} accent={hunter.accent} avatarUrl={hunter.avatarUrl} size={40} />
        <div className="min-w-0">
          <Link href={hunter.profilePath} className="text-sm font-semibold text-gray-900 hover:text-violet-600 dark:text-white dark:hover:text-violet-300">
            {hunter.name}
          </Link>
          <p className="text-xs text-gray-500 dark:text-zinc-400">{hunter.role}</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-gray-700 dark:text-zinc-300">{hunter.voice}</p>
    </section>
  );
}
