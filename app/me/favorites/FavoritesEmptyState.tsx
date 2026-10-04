import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

function HeartIllustration() {
  return (
    <svg viewBox="0 0 160 120" className="h-28 w-36 shrink-0 sm:h-32 sm:w-44" aria-hidden>
      <path
        d="M80 98 C44 74 30 54 40 39 C50 25 70 27 80 43 C90 27 110 25 120 39 C130 54 116 74 80 98 Z"
        fill="none"
        className="stroke-violet-500/25 dark:stroke-violet-400/25"
        strokeWidth="12"
        strokeLinejoin="round"
      />
      <path
        d="M80 98 C44 74 30 54 40 39 C50 25 70 27 80 43 C90 27 110 25 120 39 C130 54 116 74 80 98 Z"
        fill="none"
        className="stroke-violet-600 dark:stroke-violet-300"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <g strokeWidth="3" strokeLinecap="round">
        <path d="M118 16 L124 6" className="stroke-[#1d1d1f] dark:stroke-[#fafafa]" />
        <path d="M130 30 L142 26" className="stroke-[#1d1d1f] dark:stroke-[#fafafa]" />
        <path d="M136 82 L144 88" className="stroke-fuchsia-500" />
        <path d="M24 60 L12 60" className="stroke-[#1d1d1f] dark:stroke-[#fafafa]" />
        <path d="M30 84 L20 92" className="stroke-[#1d1d1f] dark:stroke-[#fafafa]" />
        <path d="M34 24 L40 30" className="stroke-fuchsia-500" />
      </g>
    </svg>
  );
}

export default function FavoritesEmptyState() {
  return (
    <section className="flex flex-col items-center gap-6 rounded-2xl border border-dashed border-black/15 bg-white/60 px-6 py-10 text-center dark:border-white/15 dark:bg-white/[0.02] sm:flex-row sm:justify-center sm:gap-10 sm:px-10 sm:py-12 sm:text-left">
      <HeartIllustration />
      <div className="max-w-sm">
        <h2 className="text-[20px] font-bold leading-tight text-[#1d1d1f] dark:text-[#fafafa]">Aún no has guardado ofertas</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">
          Usa el corazón en cualquier oferta para tenerla aquí a la mano.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-6 text-[14px] font-semibold text-white transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0a0a0a]"
        >
          Explorar ofertas
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
