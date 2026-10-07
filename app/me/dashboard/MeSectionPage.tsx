'use client';

import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Crown, Gift, Heart, Home, Tag, Trophy } from 'lucide-react';
import ClientLayout from '@/app/ClientLayout';
import { PUBLIC_NAVBAR_OFFSET_CLASS } from '@/lib/ui/publicNavbarOffset';

export const SPACE_LINKS = [
  { href: '/me', label: 'Inicio' },
  { href: '/me/favorites', label: 'Favoritos' },
  { href: '/me/ofertas', label: 'Mis ofertas' },
  { href: '/me/nivel', label: 'Nivel' },
  { href: '/me/logros', label: 'Logros' },
  { href: '/me/recompensas', label: 'Recompensas' },
] as const;

const NAV_ICONS = {
  '/me': Home,
  '/me/favorites': Heart,
  '/me/ofertas': Tag,
  '/me/nivel': Crown,
  '/me/logros': Trophy,
  '/me/recompensas': Gift,
} as const;

export const meCardClass =
  'rounded-2xl border border-black/[0.04] bg-white shadow-sm dark:border-white/10 dark:bg-[#141414]';

function isCurrentLink(href: string, pathname: string, panel: string | null): boolean {
  if (href === '/me') return pathname === '/me' && panel !== 'logros';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SpaceNav({ panel }: { panel: string | null }) {
  const pathname = usePathname();

  return (
    <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Espacio personal">
      {SPACE_LINKS.map((item) => {
        const Icon = NAV_ICONS[item.href];
        const current = isCurrentLink(item.href, pathname, panel);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? 'page' : undefined}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 ${
              current
                ? 'bg-violet-600 text-white'
                : 'bg-white text-[#3a3550] shadow-sm ring-1 ring-black/10 hover:bg-violet-50 dark:bg-white/10 dark:text-white/80 dark:shadow-none dark:ring-0 dark:hover:bg-white/15'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SpaceNavLive() {
  const panel = useSearchParams().get('panel');
  return <SpaceNav panel={panel} />;
}

export function MeSpaceShell({
  title,
  accent,
  lede,
  note,
  aside,
  asideBare = false,
  tone = 'day',
  wide = false,
  accentClassName,
  asideColumns,
  plain = false,
  children,
}: {
  title: string;
  accent?: string;
  lede?: ReactNode;
  note?: ReactNode;
  aside?: ReactNode;
  asideBare?: boolean;
  tone?: 'day' | 'night';
  wide?: boolean;
  accentClassName?: string;
  asideColumns?: string;
  plain?: boolean;
  children: ReactNode;
}) {
  void tone;
  const width = wide ? 'max-w-7xl' : 'max-w-6xl';
  const canvas = 'me-canvas min-h-screen';
  if (plain) {
    return (
      <ClientLayout>
        <div className={canvas}>
          <div className={`mx-auto px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:px-8 ${PUBLIC_NAVBAR_OFFSET_CLASS} ${width}`}>
            {children}
          </div>
        </div>
      </ClientLayout>
    );
  }
  return (
    <ClientLayout>
      <div className={canvas}>
        <section className={`relative overflow-hidden border-b border-[var(--me-line)] bg-[var(--me-hero)] text-[var(--me-ink)] dark:border-transparent ${PUBLIC_NAVBAR_OFFSET_CLASS}`}>
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <div className="absolute -right-16 top-8 h-56 w-56 rotate-12 rounded-4xl bg-violet-200/80 dark:bg-violet-600/40" />
            <div className="absolute right-24 top-24 h-40 w-72 -rotate-6 rounded-4xl bg-fuchsia-200/70 dark:bg-fuchsia-700/30" />
            <div className="absolute -left-10 bottom-0 h-24 w-40 rotate-6 bg-violet-100 dark:bg-violet-900/50" />
          </div>
          <div className={`relative mx-auto px-4 pb-28 md:px-8 ${width}`}>
            <p className="text-[13px] text-[var(--me-muted)]">Tu espacio</p>
            <Suspense fallback={<SpaceNav panel={null} />}>
              <SpaceNavLive />
            </Suspense>
            <div className={`mt-8 grid items-end gap-6 ${aside ? (asideColumns ?? 'lg:grid-cols-[minmax(0,1fr)_340px]') : ''}`}>
              <div>
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                  {title}
                  {accent ? (
                    <span className={accentClassName ? `inline-block ${accentClassName}` : 'text-violet-600 dark:text-violet-400'}> {accent}</span>
                  ) : null}
                </h1>
                {lede ? <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--me-muted)]">{lede}</p> : null}
                {note ? <div className="mt-4">{note}</div> : null}
              </div>
              {aside ? (
                asideBare ? (
                  <div>{aside}</div>
                ) : (
                  <aside className="rounded-2xl border border-[var(--me-line)] bg-[var(--me-card)] p-4 text-[var(--me-ink)] shadow-sm dark:border-white/15 dark:bg-[#24143f]/80 dark:shadow-none">{aside}</aside>
                )
              ) : null}
            </div>
          </div>
        </section>
        <div className={`relative z-10 mx-auto -mt-16 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:px-8 ${width}`}>
          {children}
        </div>
      </div>
    </ClientLayout>
  );
}

export default function MeSectionPage({
  title,
  accent,
  lede,
  note,
  aside,
  children,
}: {
  title: string;
  accent?: string;
  lede?: ReactNode;
  note?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <MeSpaceShell title={title} accent={accent} lede={lede} note={note} aside={aside}>
      {children}
    </MeSpaceShell>
  );
}
