import Image from 'next/image';
import type { EditorialHunter } from '@/lib/product/hunters/types';

export default function HunterBadge({ hunter }: { hunter: Pick<EditorialHunter, 'specialty' | 'icon'> }) {
  return (
    <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
      {hunter.icon ? (
        <Image src={hunter.icon} alt="" width={16} height={16} className="rounded-sm object-cover" />
      ) : null}
      {hunter.specialty}
    </p>
  );
}
