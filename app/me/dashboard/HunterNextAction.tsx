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

const primaryCta =
  'mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-violet-600 px-5 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400';

export default function HunterNextAction(props: HunterNextActionProps) {
  const action = deriveHunterNextAction(props);

  return (
    <section aria-label="Tu siguiente acción" className="rounded-2xl bg-white px-5 py-6 dark:bg-[#141414] sm:px-6">
      <p className="text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Tu siguiente acción</p>
      <h2 className="mt-3 text-[22px] font-semibold leading-snug text-[#1d1d1f] dark:text-[#fafafa] md:text-[26px]">{action.title}</h2>
      <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">{action.detail}</p>
      {action.id === 'publish' ? (
        <button type="button" onClick={props.onPublish} className={primaryCta}>
          {action.cta}
        </button>
      ) : null}
      {action.href && action.cta ? (
        <Link href={action.href} className={primaryCta}>
          {action.cta}
        </Link>
      ) : null}
    </section>
  );
}
