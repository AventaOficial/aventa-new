'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { INTERESTS_SECTION } from '@/lib/interests/copy';
import { buildOfferPublicPath } from '@/lib/offerPath';

export type InterestRailOffer = {
  id: string;
  title: string;
  store?: string | null;
  price?: number | null;
  matchLabel?: string;
};

export function PersonalInterestRail({
  offers,
  token,
}: {
  offers: InterestRailOffer[];
  token: string | null;
}) {
  const reported = useRef('');
  useEffect(() => {
    if (!token || offers.length === 0) return;
    const key = offers.map((offer) => offer.id).join(',');
    if (reported.current === key) return;
    reported.current = key;
    for (const offer of offers) {
      void fetch('/api/me/interests/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'interest_offer_shown', offerId: offer.id }),
      }).catch(() => undefined);
    }
  }, [offers, token]);

  if (offers.length === 0) return null;

  return (
    <section className="mb-5" aria-label={INTERESTS_SECTION.personalHeading}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-[#1d1d1f] dark:text-[#fafafa]">
          {INTERESTS_SECTION.personalHeading}
        </h2>
        <Link href={INTERESTS_SECTION.path} className="text-[13px] font-semibold text-violet-700 dark:text-violet-300">
          {INTERESTS_SECTION.navLabel}
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {offers.map((offer) => (
          <Link
            key={offer.id}
            href={buildOfferPublicPath(offer.id, offer.title)}
            onClick={() => {
              if (!token) return;
              void fetch('/api/me/interests/events', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'interest_offer_clicked', offerId: offer.id }),
              }).catch(() => undefined);
            }}
            className="w-[220px] shrink-0 rounded-2xl border border-black/10 bg-white p-3 text-left shadow-sm dark:border-white/10 dark:bg-[#141414]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
              {offer.matchLabel ?? INTERESTS_SECTION.matchLabels.exact}
            </p>
            <p className="mt-2 line-clamp-2 text-[15px] font-semibold text-[#1d1d1f] dark:text-white">{offer.title}</p>
            <p className="mt-1 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">
              {offer.store || 'Tienda'}{typeof offer.price === 'number' ? ` · $${offer.price}` : ''}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
