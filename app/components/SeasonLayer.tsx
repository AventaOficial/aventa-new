'use client';

import type { SeasonDefinition } from '@/lib/seasons/resolve';

export default function SeasonLayer({
  season,
  onSearch,
}: {
  season: SeasonDefinition | null;
  onSearch: (query: string) => void;
}) {
  if (!season) return null;
  const showBanner = season.modules.includes('banner') || season.modules.includes('featured');
  const showCategories = season.modules.includes('categories') && season.categories.length > 0;
  if (!showBanner && !showCategories) return null;

  return (
    <div className="mx-auto mb-4 max-w-[1400px] px-4 max-[400px]:px-3 md:px-8 lg:px-10">
      {showBanner ? (
        <p
          className="rounded-2xl border border-violet-200 bg-white px-4 py-3 text-[14px] text-[#1d1d1f] dark:border-violet-900 dark:bg-[#141414] dark:text-[#fafafa]"
          style={{ boxShadow: `inset 3px 0 0 ${season.accent}` }}
        >
          {season.banner}
        </p>
      ) : null}
      {showCategories ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {season.categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => onSearch(category)}
              className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[13px] font-medium text-[#1d1d1f] dark:border-white/15 dark:bg-[#141414] dark:text-[#fafafa]"
            >
              {category}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
