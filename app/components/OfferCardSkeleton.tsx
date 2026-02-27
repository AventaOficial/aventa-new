'use client';

/**
 * Skeleton placeholder matching OfferCard feed layout.
 * Used during loading states for offer list.
 */
export default function OfferCardSkeleton() {
  return (
    <div
      className="relative flex flex-row items-stretch overflow-hidden rounded-2xl bg-white dark:bg-[#141414] border border-[#e5e5e7] dark:border-[#262626] p-2.5 md:p-3 animate-pulse"
      aria-hidden
    >
      <div className="w-[35%] min-w-[72px] md:min-w-[140px] shrink-0 flex flex-col gap-2">
        <div className="h-[100px] md:h-36 rounded-xl bg-[#e8e8ed] dark:bg-[#1a1a1a]" />
      </div>
      <div className="flex flex-1 min-w-0 flex-col gap-2 pl-4 md:pl-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 space-y-2">
            <div className="h-6 w-20 rounded-lg bg-[#e8e8ed] dark:bg-[#1a1a1a]" />
            <div className="h-4 w-full rounded-lg bg-[#e8e8ed] dark:bg-[#1a1a1a]" />
            <div className="h-3 w-24 rounded bg-[#e8e8ed] dark:bg-[#1a1a1a]" />
          </div>
        </div>
        <div className="flex gap-2 mt-2">
          <div className="h-5 w-12 rounded-xl bg-[#e8e8ed] dark:bg-[#1a1a1a]" />
          <div className="h-4 w-16 rounded bg-[#e8e8ed] dark:bg-[#1a1a1a]" />
        </div>
        <div className="flex gap-2 mt-2">
          <div className="h-9 flex-1 rounded-xl bg-[#e8e8ed] dark:bg-[#1a1a1a]" />
          <div className="h-9 w-24 rounded-xl bg-[#e8e8ed] dark:bg-[#1a1a1a]" />
        </div>
      </div>
    </div>
  );
}
