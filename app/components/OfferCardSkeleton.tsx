'use client';

export default function OfferCardSkeleton() {
  return (
    <div
      className="relative flex flex-col gap-2 overflow-hidden rounded-2xl bg-white dark:bg-[#141414] border border-[#e5e5e7] dark:border-[#262626] p-2.5 md:p-3 animate-pulse"
      aria-hidden
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-full bg-[#e8e8ed] dark:bg-[#1a1a1a]" />
          <div className="h-3 w-28 rounded bg-[#e8e8ed] dark:bg-[#1a1a1a]" />
        </div>
        <div className="h-7 w-7 rounded-lg bg-[#e8e8ed] dark:bg-[#1a1a1a]" />
      </div>
      <div className="flex flex-row items-stretch">
        <div className="w-[38%] min-w-[90px] md:min-w-[140px] shrink-0 flex flex-col gap-2">
          <div className="h-[128px] md:h-[158px] rounded-xl bg-[#e8e8ed] dark:bg-[#1a1a1a]" />
          <div className="h-8 w-20 mx-auto rounded-full bg-[#e8e8ed] dark:bg-[#1a1a1a]" />
        </div>
        <div className="flex flex-1 min-w-0 flex-col gap-2 pl-3 md:pl-4">
          <div className="h-4 w-full rounded-lg bg-[#e8e8ed] dark:bg-[#1a1a1a]" />
          <div className="h-3 w-32 rounded bg-[#e8e8ed] dark:bg-[#1a1a1a]" />
          <div className="h-6 w-24 rounded bg-[#e8e8ed] dark:bg-[#1a1a1a]" />
          <div className="mt-auto h-9 w-full rounded-xl bg-[#e8e8ed] dark:bg-[#1a1a1a]" />
        </div>
      </div>
    </div>
  );
}
