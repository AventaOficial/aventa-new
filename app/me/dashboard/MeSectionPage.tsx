'use client';

import Link from 'next/link';
import ClientLayout from '@/app/ClientLayout';

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
        <section className="mx-auto max-w-3xl px-4 pb-16 pt-24 md:px-8 md:pt-12">
          <Link href="/me" className="text-xs font-medium text-violet-600 hover:underline dark:text-violet-400">
            Volver a tu espacio
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
          {lede ? <p className="mt-2 text-sm text-gray-600 dark:text-zinc-400">{lede}</p> : null}
          <div className="mt-6">{children}</div>
        </section>
      </div>
    </ClientLayout>
  );
}
