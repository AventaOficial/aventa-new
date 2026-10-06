import Image from 'next/image';
import Link from 'next/link';
import type { HunterActivity } from '@/lib/product/hunters/activity';
import type { HunterAssetSet } from '@/lib/product/hunters/identity';
import type { EditorialHunter } from '@/lib/product/hunters/types';
import HunterAvatar from './HunterAvatar';
import HunterBadge from './HunterBadge';

function Block({ label, text }: { label: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <section>
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-500">{label}</h2>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-700 dark:text-zinc-300">{text}</p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 px-3 py-2 dark:border-zinc-800">
      <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

export default function HunterProfile({
  hunter,
  assets,
  activity,
}: {
  hunter: EditorialHunter;
  assets?: HunterAssetSet | null;
  activity?: HunterActivity | null;
}) {
  const portrait = assets?.portraitUrl;
  const fullBody = assets?.fullBodyUrl;
  return (
    <article
      data-hunter-code={hunter.code}
      style={hunter.accent ? { borderTopColor: hunter.accent } : undefined}
      className="rounded-3xl border border-gray-200 border-t-4 bg-white p-6 dark:border-zinc-800 dark:bg-[#141416] sm:p-8"
    >
      {hunter.coverUrl ? (
        <div className="relative mb-6 aspect-[2/1] overflow-hidden rounded-2xl bg-gray-100 dark:bg-zinc-900">
          <Image src={hunter.coverUrl} alt="" fill className="object-cover" sizes="(max-width: 768px) 100vw, 720px" />
        </div>
      ) : null}
      <div className="flex items-center gap-4">
        <HunterAvatar hunter={hunter} size={88} />
        <div className="min-w-0">
          <HunterBadge hunter={hunter} />
          <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">{hunter.displayName}</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400">{hunter.title}</p>
        </div>
      </div>
      {portrait || fullBody ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {portrait ? (
            <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-gray-100 dark:bg-zinc-900">
              <Image src={portrait} alt="" fill className="object-cover" sizes="360px" />
            </div>
          ) : null}
          {fullBody ? (
            <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-gray-100 dark:bg-zinc-900">
              <Image src={fullBody} alt="" fill className="object-contain" sizes="360px" />
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="mt-8 space-y-6">
        <Block label="Frase" text={hunter.shortBio} />
        <Block label="Especialidad" text={hunter.specialty} />
        <Block label="Personalidad" text={hunter.personality} />
        <Block label="Historia" text={hunter.longBio} />
        {activity ? (
          <section className="space-y-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-500">Actividad</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Metric label="Ofertas encontradas" value={String(activity.foundCount)} />
            </div>
            {activity.categories.length > 0 ? (
              <p className="text-sm text-gray-700 dark:text-zinc-300">
                Categorías: {activity.categories.slice(0, 4).map((row) => row.name).join(' · ')}
              </p>
            ) : null}
            {activity.stores.length > 0 ? (
              <p className="text-sm text-gray-700 dark:text-zinc-300">
                Tiendas: {activity.stores.slice(0, 4).map((row) => row.name).join(' · ')}
              </p>
            ) : null}
            {activity.offers.length > 0 ? (
              <ul className="space-y-2">
                {activity.offers.map((offer) => (
                  <li key={offer.id}>
                    <Link href={`/oferta/${offer.id}`} className="text-sm font-medium text-violet-700 hover:underline dark:text-violet-300">
                      {offer.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </div>
    </article>
  );
}
