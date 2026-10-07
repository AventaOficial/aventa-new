'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ClientLayout from '@/app/ClientLayout';
import { PUBLIC_NAVBAR_OFFSET_CLASS } from '@/lib/ui/publicNavbarOffset';

export const SPACE_LINKS = [
  { href: '/me', label: 'Inicio' },
  { href: '/me/favorites', label: 'Favoritos' },
  { href: '/me/ofertas', label: 'Mis ofertas' },
  { href: '/me/estadisticas', label: 'Actividad' },
  { href: '/me/nivel', label: 'Nivel' },
  { href: '/me?panel=logros', label: 'Logros' },
  { href: '/me/recompensas', label: 'Recompensas' },
  { href: '/settings', label: 'Configuración' },
] as const;

export const meCardClass =
  'rounded-2xl border border-black/[0.04] bg-white shadow-sm dark:border-white/10 dark:bg-[#141414]';

export default function MeSectionPage({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <ClientLayout>
      <div className="min-h-screen bg-[#F5F5F7] text-[#1d1d1f] dark:bg-[#0a0a0a] dark:text-[#fafafa]">
        <section className={`mx-auto max-w-3xl px-4 pb-16 md:px-8 ${PUBLIC_NAVBAR_OFFSET_CLASS}`}>
          <Link
            href="/me"
            className="inline-flex min-h-11 items-center rounded-md text-[13px] font-medium text-[#1d1d1f] hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-[#fafafa] dark:hover:text-violet-300 sm:min-h-0"
          >
            Tu espacio
          </Link>
          <nav className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Espacio personal">
            {SPACE_LINKS.map((item) => {
              const current = item.href === '/me' ? pathname === '/me' : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={current ? 'page' : undefined}
                  className={`shrink-0 rounded-full px-3 py-2 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                    current
                      ? 'bg-[#1d1d1f] text-white dark:bg-[#fafafa] dark:text-[#1d1d1f]'
                      : 'bg-white text-[#6e6e73] hover:text-[#1d1d1f] dark:bg-[#141414] dark:text-[#a3a3a3] dark:hover:text-[#fafafa]'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <h1 className="mt-6 text-[28px] font-semibold tracking-tight text-[#1d1d1f] dark:text-[#fafafa]">{title}</h1>
          {lede ? <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">{lede}</p> : null}
          <div className="mt-8">{children}</div>
        </section>
      </div>
    </ClientLayout>
  );
}
