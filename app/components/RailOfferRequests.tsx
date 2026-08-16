'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

type RequestItem = {
  id: string;
  title: string;
  budget_max: number | null;
  preferred_store: string | null;
};

export default function RailOfferRequests() {
  const [items, setItems] = useState<RequestItem[]>([]);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    fetch('/api/plaza/requests?limit=12')
      .then((r) => (r.ok ? r.json() : { requests: [] }))
      .then((data) => setItems((data.requests ?? []) as RequestItem[]))
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    if (items.length <= 5) return;
    const id = setInterval(() => setOffset((n) => n + 1), 7000);
    return () => clearInterval(id);
  }, [items.length]);

  const visible =
    items.length <= 5
      ? items
      : Array.from({ length: 5 }, (_, i) => items[(offset + i) % items.length]);

  return (
    <div className="rounded-2xl border border-[#e8e8ed] bg-white p-4 dark:border-[#2a2a2a] dark:bg-[#141414]">
      <p className="text-xs font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Solicitudes</p>
      {visible.length === 0 ? (
        <p className="mt-2 text-[11px] leading-snug text-[#6e6e73] dark:text-[#a3a3a3]">
          Aún no hay pedidos. En Plaza la comunidad pide lo que quiere cazar.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {visible.map((item) => (
            <li key={`${item.id}-${offset}`} className="border-b border-[#f0f0f2] pb-2 last:border-0 last:pb-0 dark:border-[#2a2a2a]">
              <p className="line-clamp-2 text-[11px] font-medium leading-snug text-[#1d1d1f] dark:text-[#fafafa]">
                {item.title}
              </p>
              {item.budget_max ? (
                <p className="mt-0.5 text-[10px] text-[#6e6e73]">Hasta ${Math.round(item.budget_max).toLocaleString('es-MX')}</p>
              ) : null}
              <Link
                href={`/?upload=1&title=${encodeURIComponent(item.title)}`}
                className="mt-1 inline-block text-[10px] font-semibold text-violet-600 dark:text-violet-400"
              >
                Ayudar a cazar
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href="/plaza"
        className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] font-semibold text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-300"
      >
        Comunidad AVENTA
        <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
      </Link>
    </div>
  );
}
