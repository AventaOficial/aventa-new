'use client';

import { resolveStoreBrand } from '@/lib/stores/storeBrand';

type StoreBrandMarkProps = {
  store: string;
  className?: string;
};

/** Logo circular de tienda + nombre en negrita (Mercado Libre, Amazon u otras). */
export default function StoreBrandMark({ store, className = '' }: StoreBrandMarkProps) {
  const brand = resolveStoreBrand(store);
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}>
      {brand.logoSrc ? (
        // SVG local: <img> evita el decoder de next/image
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brand.logoSrc}
          alt=""
          width={18}
          height={18}
          className="h-4 w-4 md:h-[18px] md:w-[18px] rounded-full object-cover shrink-0 ring-1 ring-black/10 dark:ring-white/10"
        />
      ) : (
        <span
          className="flex h-4 w-4 md:h-[18px] md:w-[18px] shrink-0 items-center justify-center rounded-full text-[8px] md:text-[9px] font-bold text-white"
          style={{ backgroundColor: brand.bg }}
          aria-hidden
        >
          {brand.initials}
        </span>
      )}
      <span className="font-semibold text-gray-800 dark:text-gray-200 truncate">{brand.name}</span>
    </span>
  );
}
