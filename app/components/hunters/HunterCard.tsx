import Link from 'next/link';
import type { EditorialHunter } from '@/lib/product/hunters/types';
import HunterAvatar from './HunterAvatar';
import HunterBadge from './HunterBadge';

export default function HunterCard({ hunter }: { hunter: EditorialHunter }) {
  return (
    <Link
      href={`/cazadores/${hunter.slug}`}
      data-hunter-code={hunter.code}
      style={hunter.accent ? { borderColor: hunter.accent } : undefined}
      className="flex gap-4 rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-violet-300 dark:border-zinc-800 dark:bg-[#141416] dark:hover:border-violet-700"
    >
      <HunterAvatar hunter={hunter} />
      <span className="min-w-0">
        <HunterBadge hunter={hunter} />
        <span className="mt-1 block text-base font-semibold text-gray-900 dark:text-white">{hunter.displayName}</span>
        <span className="mt-0.5 block text-xs text-gray-500 dark:text-zinc-400">{hunter.title}</span>
        {hunter.shortBio ? (
          <span className="mt-2 block line-clamp-3 text-sm leading-relaxed text-gray-600 dark:text-zinc-300">{hunter.shortBio}</span>
        ) : null}
        <span className="mt-3 inline-block text-xs font-semibold text-violet-700 dark:text-violet-300">Conocer a {hunter.name}</span>
      </span>
    </Link>
  );
}
