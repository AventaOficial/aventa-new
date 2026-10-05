import Image from 'next/image';
import type { EditorialHunter } from '@/lib/product/hunters/types';

export default function HunterAvatar({ hunter, size = 72 }: { hunter: Pick<EditorialHunter, 'name' | 'avatarUrl'>; size?: number }) {
  if (hunter.avatarUrl) {
    return (
      <Image
        src={hunter.avatarUrl}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover ring-1 ring-black/10 dark:ring-white/10"
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="inline-flex items-center justify-center rounded-full bg-violet-500/15 text-lg font-bold text-violet-700 dark:text-violet-300"
    >
      {hunter.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
