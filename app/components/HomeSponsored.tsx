'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import StoreBrandMark from './StoreBrandMark';
import { slugifyStore } from '@/lib/slug';

type SponsoredKind = 'feed' | 'rail';

const COPY: Record<SponsoredKind, { store: string; title: string; cta: string }> = {
  feed: { store: 'Amazon', title: 'Hasta 30% en electrónicos', cta: 'Ver ofertas' },
  rail: { store: 'Costco', title: 'Hasta 25% en tecnología', cta: 'Ver ofertas' },
};

function matchStore(name: string, stores: string[]): string | null {
  const q = name.toLowerCase();
  return stores.find((s) => s.toLowerCase() === q || s.toLowerCase().includes(q)) ?? null;
}

function SponsoredInner({ kind, store }: { kind: SponsoredKind; store: string }) {
  const ad = COPY[kind];
  if (kind === 'rail') {
    return (
      <div className="rounded-2xl bg-white dark:bg-[#141414] border border-[#e8e8ed] dark:border-[#2a2a2a] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
          Patrocinado
        </p>
        <div className="mt-3">
          <StoreBrandMark store={store} />
        </div>
        <p className="mt-3 text-sm font-semibold text-[#1d1d1f] dark:text-[#fafafa] leading-snug">{ad.title}</p>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-violet-600 dark:text-violet-400">
          {ad.cta}
          <ArrowRight className="h-4 w-4" aria-hidden />
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

export function SponsoredSlot({
  kind,
  stores,
  onSearch,
}: {
  kind: SponsoredKind;
  stores: string[];
  onSearch: (query: string) => void;
}) {
  const ad = COPY[kind];
  const matched = matchStore(ad.store, stores);
  const inner = <SponsoredInner kind={kind} store={matched ?? ad.store} />;

  if (matched) {
    return (
      <Link href={`/tienda/${slugifyStore(matched)}`} className="block">
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => onSearch(ad.store)} className="block w-full text-left">
      {inner}
    </button>
  );
}

export function HomeDesktopRail({
  stores,
  storeFilter,
  onStoreFilter,
  onSearch,
}: {
  stores: string[];
  storeFilter: string | null;
  onStoreFilter: (store: string | null) => void;
  onSearch: (query: string) => void;
}) {
  const shown = stores.slice(0, 8);
  return (
    <aside className="hidden xl:block w-[260px] shrink-0 sticky top-24 space-y-4">
      <SponsoredSlot kind="rail" stores={stores} onSearch={onSearch} />
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
    </aside>
  );
}
