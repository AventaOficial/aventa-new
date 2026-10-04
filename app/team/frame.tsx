import type { ReactNode } from 'react';

export function TeamFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col justify-center px-4 py-16">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#737373]">Aventa Team OS</p>
      <h1 className="mt-2 text-2xl font-semibold text-[#1d1d1f] dark:text-[#fafafa]">{title}</h1>
      <div className="mt-6">{children}</div>
    </main>
  );
}
