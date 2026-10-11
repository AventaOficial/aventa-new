import Link from 'next/link';
import type { OfferAuthorCardModel } from '@/lib/product/presentation/teamAuthor';

function AuthorAvatar({
  name,
  avatarUrl,
  accent,
}: {
  name: string;
  avatarUrl: string | null;
  accent: string;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        width={44}
        height={44}
        className="h-11 w-11 shrink-0 rounded-full object-cover"
      />
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || 'A';
  return (
    <span
      aria-hidden
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
      style={{ background: accent }}
    >
      {initial}
    </span>
  );
}

/** Ficha única del autor en el detalle. Omite bio y ubicación cuando no existen. */
export default function OfferAuthorCard({ author }: { author: OfferAuthorCardModel }) {
  const nameClass =
    author.kind === 'team'
      ? 'text-sm font-semibold tracking-tight text-gray-900 dark:text-white'
      : 'text-sm font-semibold text-gray-900 dark:text-white';
  const name = author.profileHref ? (
    <Link href={author.profileHref} className={`${nameClass} hover:text-violet-600 dark:hover:text-violet-300`}>
      {author.name}
    </Link>
  ) : (
    <p className={nameClass}>{author.name}</p>
  );

  return (
    <section
      className="rounded-2xl border border-black/[0.06] bg-[#fafafa] p-4 dark:border-white/10 dark:bg-white/[0.03]"
      aria-label="Autor de la oferta"
    >
      <div className="flex items-center gap-3">
        <AuthorAvatar name={author.name} avatarUrl={author.avatarUrl} accent={author.accent} />
        <div className="min-w-0">
          {name}
          {author.functionLabel ? (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-zinc-400">{author.functionLabel}</p>
          ) : null}
          {author.location ? (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-zinc-400">{author.location}</p>
          ) : null}
        </div>
      </div>
      {author.bio ? (
        <p className="mt-3 text-sm leading-relaxed text-gray-700 dark:text-zinc-300">{author.bio}</p>
      ) : null}
    </section>
  );
}
