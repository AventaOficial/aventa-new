import Link from 'next/link';
import { ArrowRight, Heart } from 'lucide-react';

function SavedCardsArt() {
  return (
    <svg viewBox="0 0 460 340" className="mx-auto w-full max-w-105" aria-hidden>
      <defs>
        <linearGradient id="fav-front" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ddd6fe" />
          <stop offset="42%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id="fav-mid" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6d28d9" />
          <stop offset="100%" stopColor="#3b0764" />
        </linearGradient>
        <linearGradient id="fav-back" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4c1d95" />
          <stop offset="100%" stopColor="#2e1065" />
        </linearGradient>
        <filter id="fav-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="10" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g transform="translate(36 78) rotate(-16)">
        <rect width="168" height="168" rx="36" fill="url(#fav-back)" opacity="0.95" />
      </g>
      <g transform="translate(214 36) rotate(12)">
        <rect width="150" height="150" rx="34" fill="url(#fav-mid)" />
      </g>
      <g transform="translate(18 168) rotate(-8)">
        <rect width="92" height="92" rx="24" fill="#5b21b6" />
        <path d="M28 34h22l8 8v28H28z" fill="none" stroke="white" strokeWidth="3" strokeLinejoin="round" opacity="0.85" />
        <circle cx="52" cy="58" r="4" fill="white" opacity="0.85" />
      </g>
      <g transform="translate(318 176) rotate(8)">
        <rect width="92" height="92" rx="24" fill="#6d28d9" />
        <path d="M30 36h8l6 28h22" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        <circle cx="46" cy="70" r="3.5" fill="white" />
        <circle cx="62" cy="70" r="3.5" fill="white" />
      </g>
      <g filter="url(#fav-glow)" transform="translate(118 78)">
        <rect width="196" height="196" rx="42" fill="url(#fav-front)" />
        <path
          d="M98 132c-28-18-40-34-32-48 8-12 24-11 32 2 8-13 24-14 32-2 8 14-4 30-32 48z"
          fill="white"
          opacity="0.95"
        />
      </g>
      <g stroke="white" strokeWidth="4" strokeLinecap="round" opacity="0.85">
        <path d="M168 58l10-22" />
        <path d="M196 48l8-16" />
        <path d="M292 92l22-8" />
        <path d="M86 150l-16 8" />
        <path d="M78 188l-18 4" />
      </g>
    </svg>
  );
}

export default function FavoritesEmptyState() {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#160c2c] px-6 py-10 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:px-10 lg:px-12 lg:py-14">
      <div className="pointer-events-none absolute -right-10 bottom-0 h-40 w-56 rotate-12 rounded-4xl bg-violet-700/25" aria-hidden />
      <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)] lg:gap-6">
        <SavedCardsArt />
        <div className="max-w-md">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/25 bg-violet-500/15 px-3 py-1 text-[13px] font-medium text-violet-100">
            <Heart className="h-3.5 w-3.5" aria-hidden />
            Aún no tienes favoritos
          </p>
          <h2 className="mt-5 text-[32px] font-semibold leading-[1.15] tracking-tight text-white sm:text-4xl">
            Guarda las mejores ofertas
            <span className="mt-1 block bg-linear-to-r from-fuchsia-200 to-violet-300 bg-clip-text text-transparent">
              para verlas después
            </span>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/70">
            Usa el corazón en cualquier oferta para guardarla aquí. Así podrás encontrarlas rápido cuando las necesites.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-full bg-violet-600 px-5 text-[15px] font-semibold text-white shadow-[0_10px_30px_rgba(124,58,237,0.35)] transition-colors hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#160c2c]"
          >
            <Heart className="h-4 w-4" aria-hidden />
            Explorar ofertas
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
