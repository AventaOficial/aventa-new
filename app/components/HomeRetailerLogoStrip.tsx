'use client';

import { resolveStoreBrand } from '@/lib/stores/storeBrand';

const FEATURED_STORES = [
  { name: 'Liverpool', logo: '/stores/liverpool.svg' },
  { name: 'Bodega Aurrera', logo: '/stores/bodega-aurrera.svg' },
  { name: 'Chedraui', logo: '/stores/chedraui.svg' },
  { name: 'Costco', logo: '/stores/costco.svg' },
] as const;

type HomeRetailerLogoStripProps = {
  selectedStore: string | null;
  onSelectStore: (store: string | null) => void;
};

/**
 * Quick retailer filters for the home feed. Logos are contained rather than
 * cropped so each retailer's mark remains legible across viewport sizes.
 */
export default function HomeRetailerLogoStrip({
  selectedStore,
  onSelectStore,
}: HomeRetailerLogoStripProps) {
  return (
    <section
      aria-label="Tiendas destacadas"
      className="mx-auto w-full max-w-[1400px] px-4 max-[400px]:px-3 md:px-8 lg:px-10 pb-4 md:pb-5"
    >
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[#1d1d1f] dark:text-[#fafafa] md:text-base">
          Explora por tienda
        </h2>
        {selectedStore ? (
          <button
            type="button"
            onClick={() => onSelectStore(null)}
            className="text-xs font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400"
          >
            Quitar filtro
          </button>
        ) : null}
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FEATURED_STORES.map((store) => {
          const selected = selectedStore === store.name;
          return (
            <button
              key={store.name}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelectStore(selected ? null : store.name)}
              className={`flex min-h-[76px] min-w-[118px] shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border px-4 py-3 transition-colors md:min-w-[144px] md:min-h-[88px] ${
                selected
                  ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-500/15 dark:bg-violet-950/30'
                  : 'border-[#e5e5e7] bg-white hover:border-violet-300 dark:border-[#262626] dark:bg-[#141414] dark:hover:border-violet-700'
              }`}
            >
              {/* Local retailer artwork; contain preserves each logo's full aspect ratio. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={store.logo}
                alt=""
                aria-hidden="true"
                width={112}
                height={36}
                loading="lazy"
                className="h-8 w-[104px] object-contain md:h-9 md:w-[120px]"
              />
              <span className="text-xs font-medium text-[#6e6e73] dark:text-[#a3a3a3]">
                {store.name}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
