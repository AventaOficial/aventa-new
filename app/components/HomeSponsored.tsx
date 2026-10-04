'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import StoreBrandMark from './StoreBrandMark';
import RailCommunity from './RailCommunity';
import { slugifyStore } from '@/lib/slug';
import { eligibleCampaigns, type SponsoredCampaign, type SponsoredSurface } from '@/lib/sponsored/placements';
import { SPONSORED_CAMPAIGNS } from '@/lib/sponsored/campaigns';
import { trackSponsoredEvent } from '@/lib/sponsored/tracking';
import type { FeedHunter } from '@/lib/community/feedHunters';

function matchStore(name: string, stores: string[]): string | null {
  const q = name.toLowerCase();
  return stores.find((s) => s.toLowerCase() === q || s.toLowerCase().includes(q)) ?? null;
}

function SponsoredInner({ surface, campaign, store }: { surface: SponsoredSurface; campaign: SponsoredCampaign; store: string }) {
  const ad = campaign.creative;
  if (surface === 'rail') {
    return (
      <div className="overflow-hidden rounded-2xl border border-[#e8e8ed] bg-white dark:border-[#2a2a2a] dark:bg-[#141414] p-3.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-600/80 dark:text-violet-400/80">
          Patrocinado
        </p>
        <div className="mt-2">
          <StoreBrandMark store={store} />
        </div>
        <p className="mt-2 text-sm font-medium leading-snug text-[#1d1d1f] dark:text-[#fafafa]">{ad.title}</p>
        <span className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-violet-600 dark:text-violet-400">
          {ad.cta}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-violet-50 dark:bg-violet-950/25 border border-violet-100 dark:border-violet-900/40 px-4 py-3.5 max-[400px]:px-3 max-[400px]:py-3 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
          Patrocinado
        </p>
        <div className="mt-1.5">
          <StoreBrandMark store={store} />
        </div>
        <p className="mt-1 text-sm font-semibold text-[#1d1d1f] dark:text-[#fafafa] leading-snug">{ad.title}</p>
      </div>
      <span className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-violet-600 dark:bg-violet-500 px-3 py-2 text-xs font-semibold text-white">
        {ad.cta}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </span>
    </div>
  );
}

/** Un espacio patrocinado. Registra una impresión al verse por primera vez y cada clic. */
export function SponsoredSlot({
  campaign,
  surface,
  position = null,
  stores,
  onSearch,
}: {
  campaign: SponsoredCampaign;
  surface: SponsoredSurface;
  /** Índice de la oferta tras la que aparece (feed). */
  position?: number | null;
  stores: string[];
  onSearch: (query: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const matched = matchStore(campaign.store, stores);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          trackSponsoredEvent({ type: 'impression', campaignId: campaign.id, surface, position });
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [campaign.id, surface, position]);

  const onClick = () => trackSponsoredEvent({ type: 'click', campaignId: campaign.id, surface, position });
  const inner = <SponsoredInner surface={surface} campaign={campaign} store={matched ?? campaign.store} />;

  return (
    <div ref={ref} data-sponsored-campaign={campaign.id}>
      {matched ? (
        <Link href={`/tienda/${slugifyStore(matched)}`} className="block" onClick={onClick}>
          {inner}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => {
            onClick();
            onSearch(campaign.store);
          }}
          className="block w-full text-left"
        >
          {inner}
        </button>
      )}
    </div>
  );
}

export function HomeDesktopRail({
  stores,
  storeFilter,
  onStoreFilter,
  onSearch,
  hunters,
  now,
}: {
  stores: string[];
  storeFilter: string | null;
  onStoreFilter: (store: string | null) => void;
  onSearch: (query: string) => void;
  hunters: FeedHunter[];
  /** Momento de referencia para la vigencia de campañas. */
  now: number;
}) {
  const shown = stores.slice(0, 8);
  const railCampaign = eligibleCampaigns(SPONSORED_CAMPAIGNS, 'rail', now)[0] ?? null;
  return (
    <aside className="hidden xl:block w-[220px] shrink-0 sticky top-24 space-y-3 opacity-90">
      {railCampaign ? <SponsoredSlot campaign={railCampaign} surface="rail" stores={stores} onSearch={onSearch} /> : null}
      {shown.length > 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#141414] border border-[#e8e8ed] dark:border-[#2a2a2a] p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Tiendas</p>
            {storeFilter ? (
              <button
                type="button"
                onClick={() => onStoreFilter(null)}
                className="text-[11px] font-medium text-violet-600 dark:text-violet-400"
              >
                Todas
              </button>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            {shown.map((store) => {
              const active = storeFilter === store;
              return (
                <button
                  key={store}
                  type="button"
                  onClick={() => onStoreFilter(active ? null : store)}
                  className={`rounded-xl px-2.5 py-2 text-left text-xs transition-colors ${
                    active
                      ? 'bg-[#e8e8ed] dark:bg-[#2c2c2e]'
                      : 'hover:bg-[#f5f5f7] dark:hover:bg-[#1a1a1a]'
                  }`}
                >
                  <StoreBrandMark store={store} />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <RailCommunity hunters={hunters} />
    </aside>
  );
}
