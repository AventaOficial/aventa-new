import Link from 'next/link';
import type { HunterPublicIdentity } from '@/lib/product/hunters/identity';
import { AVENTA_EDITORIAL_LINE, AVENTA_EDITORIAL_NAME } from '@/lib/product/presentation/publicCardAttribution';
import { teamAuthorCard } from '@/lib/product/presentation/teamAuthor';
import OfferAuthorCard from '@/app/components/offers/OfferAuthorCard';

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

/** Identidad editorial de la tarjeta. No enlaza al hunter ni marca el precio como verificado. */
export function AventaFoundLine() {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[9px] font-bold tracking-tight text-white"
      >
        A
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[10px] font-semibold tracking-[0.12em] text-violet-700 dark:text-violet-300 md:text-[11px]">
          {AVENTA_EDITORIAL_NAME}
        </span>
        <span className="block truncate text-[10px] text-gray-500 dark:text-zinc-400">{AVENTA_EDITORIAL_LINE}</span>
      </span>
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
  return <OfferAuthorCard author={teamAuthorCard(hunter)} />;
}
