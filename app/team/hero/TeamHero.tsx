import Link from 'next/link';
import type { TeamHeroPayload } from '@/lib/team/hero/types';

export function TeamHero({ payload }: { payload: TeamHeroPayload }) {
  return (
    <div className="max-w-xl">
      <p className="text-sm text-[#737373]">
        {payload.greeting}, {payload.personName}.
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#fafafa] md:text-4xl">
        {payload.teamName}
      </h1>
      <p className="mt-2 max-w-md text-base leading-6 text-[#424245] dark:text-[#d4d4d4]">{payload.teamLine}</p>
      <p className="mt-4 text-sm text-[#424245] dark:text-[#a1a1a6]">
        {payload.roleLabel}
        <span className="text-[#737373]"> · {payload.membershipLabel}</span>
      </p>
      {payload.teamXp ? (
        <p className="mt-4 text-sm text-[#424245] dark:text-[#a1a1a6]">
          <span className="text-[#737373]">{payload.teamXp.label}</span>
          <span className="ml-2 font-semibold tabular-nums">{payload.teamXp.value}</span>
        </p>
      ) : null}

      <section className="mt-10 border-t border-[#d2d2d7] pt-8 dark:border-[#2a2a2a]">
        <h2 className="text-xl font-semibold tracking-tight">{payload.primary.title}</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-[#424245] dark:text-[#a1a1a6]">{payload.primary.body}</p>
        {payload.primary.href && payload.primary.label ? (
          <Link
            href={payload.primary.href}
            className="mt-5 inline-flex rounded-full bg-violet-600 px-4 py-2.5 text-sm font-medium text-white"
          >
            {payload.primary.label}
          </Link>
        ) : null}
      </section>

      {payload.metrics.length > 0 ? (
        <dl className="mt-10 space-y-6">
          {payload.metrics.map((item) => (
            <div key={item.id}>
              <dt className="text-sm text-[#737373]">{item.label}</dt>
              <dd className="mt-1 text-4xl font-semibold tracking-tight">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {payload.activity.length > 0 ? (
        <ul className="mt-8 space-y-2">
          {payload.activity.map((item) => (
            <li key={item.id} className="text-sm leading-6 text-[#424245] dark:text-[#a1a1a6]">
              {item.text}
            </li>
          ))}
        </ul>
      ) : null}

      {payload.communityXp ? (
        <p className="mt-10 text-sm text-[#737373]">
          {payload.communityXp.label} · {payload.communityXp.value}
        </p>
      ) : null}
    </div>
  );
}
