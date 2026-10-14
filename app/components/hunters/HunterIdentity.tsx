import Link from 'next/link';
import Image from 'next/image';
import type { HunterPublicIdentity } from '@/lib/product/hunters/identity';
import { AVENTA_EDITORIAL_LINE, AVENTA_EDITORIAL_NAME } from '@/lib/product/presentation/publicCardAttribution';
import { teamAuthorCard } from '@/lib/product/presentation/teamAuthor';
import OfferAuthorCard from '@/app/components/offers/OfferAuthorCard';
import { VerifiedBadge } from '@/app/components/hunters/VerifiedBadge';

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

/** Identidad editorial de la tarjeta. No enlaza al hunter; la insignia verifica autoría, no el precio. */
export function AventaFoundLine({
  label = AVENTA_EDITORIAL_NAME,
  line = AVENTA_EDITORIAL_LINE,
}: { label?: string; line?: string } = {}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Image
        src="/icon.svg"
        alt=""
        width={20}
        height={20}
        unoptimized
        className="h-5 w-5 shrink-0 rounded-md ring-1 ring-black/5 dark:ring-white/15"
        aria-hidden
      />
      <span className="min-w-0 leading-tight">
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate text-[10px] font-semibold tracking-[0.12em] text-violet-700 dark:text-violet-300 md:text-[11px]">
            {label}
          </span>
          <VerifiedBadge size={13} />
        </span>
        <span className="block truncate text-[10px] text-gray-500 dark:text-zinc-400">{line}</span>
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
      <VerifiedBadge size={13} />
    </Link>
  );
}

export function HunterFoundSection({ hunter }: { hunter: HunterPublicIdentity }) {
  return <OfferAuthorCard author={teamAuthorCard(hunter)} />;
}
