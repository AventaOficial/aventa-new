import Image from 'next/image';
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

export default function HunterProfile({ hunter }: { hunter: EditorialHunter }) {
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
      <div className="mt-8 space-y-6">
        <Block label="Descripción" text={hunter.shortBio} />
        <Block label="Historia" text={hunter.longBio} />
        <Block label="Personalidad" text={hunter.personality} />
      </div>
    </article>
  );
}
