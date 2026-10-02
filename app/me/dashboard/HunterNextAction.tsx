'use client';

import Link from 'next/link';
import { deriveHunterNextAction, type HunterRewardSignals } from '@/lib/me/hunterNextAction';

type HunterNextActionProps = {
  published: number;
  approved: number;
  pending: number;
  rejected: number;
  expired: number;
  publicHref: string | null;
  rewards: HunterRewardSignals | null;
  onPublish: () => void;
};

export default function HunterNextAction(props: HunterNextActionProps) {
  const action = deriveHunterNextAction(props);

  return (
    <section
      aria-label="Tu siguiente acción"
      className="rounded-3xl border border-violet-200 bg-white p-5 dark:border-violet-500/25 dark:bg-[#121214]"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-300">
        Tu siguiente acción
      </p>
      <h2 className="mt-2 text-xl font-bold text-gray-900 dark:text-white">{action.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-zinc-400">{action.detail}</p>
      {action.id === 'publish' ? (
        <button
          type="button"
          onClick={props.onPublish}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          {action.cta}
        </button>
      ) : null}
      {action.href && action.cta ? (
        <Link
          href={action.href}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl border border-violet-300 px-5 py-3 text-sm font-semibold text-violet-700 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:border-violet-500/40 dark:text-violet-200 dark:hover:bg-violet-950/40"
        >
          {action.cta}
        </Link>
      ) : null}
    </section>
  );
}
