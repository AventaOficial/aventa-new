'use client';

import Link from 'next/link';
import ClientLayout from '@/app/ClientLayout';
import { PUBLIC_NAVBAR_OFFSET_CLASS } from '@/lib/ui/publicNavbarOffset';

export default function MeSectionPage({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <ClientLayout>
      <div className="min-h-screen bg-[#F5F5F7] text-gray-900 dark:bg-[#0a0a0a] dark:text-gray-100">
        <section className={`mx-auto max-w-3xl px-4 pb-16 md:px-8 ${PUBLIC_NAVBAR_OFFSET_CLASS}`}>
          <Link
            href="/me"
            className="inline-flex min-h-11 items-center rounded-md text-xs font-medium text-violet-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-violet-400 sm:min-h-0"
          >
            Volver a tu espacio
          </Link>
          <h1 className="mt-1 text-2xl sm:mt-3 font-bold text-gray-900 dark:text-white">{title}</h1>
          {lede ? <p className="mt-2 text-sm text-gray-600 dark:text-zinc-400">{lede}</p> : null}
          <div className="mt-6">{children}</div>
        </section>
      </div>
    </ClientLayout>
  );
}
