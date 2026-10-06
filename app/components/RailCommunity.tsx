'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BowArrow, MessagesSquare, Target } from 'lucide-react';
import type { FeedHunter } from '@/lib/community/feedHunters';

type RequestItem = {
  id: string;
  title: string;
  budget_max: number | null;
  preferred_store: string | null;
};

type DiscussionItem = { id: string; title: string; created_at: string };

const VISIBLE_REQUESTS = 4;
const VISIBLE_DISCUSSIONS = 2;

function SectionTitle({ icon: Icon, children }: { icon: typeof Target; children: string }) {
  return (
    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-violet-600/80 dark:text-violet-400/80">
      <Icon className="h-3 w-3" aria-hidden />
      {children}
    </p>
  );
}

/**
 * Comunidad en el Home: pedidos de caza, conversaciones de Plaza y cazadores del feed.
 * Cada bloque solo aparece si tiene contenido real; los pedidos muestran una invitación si están vacíos.
 */
export default function RailCommunity({ hunters, note = null }: { hunters: FeedHunter[]; note?: string | null }) {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [discussions, setDiscussions] = useState<DiscussionItem[]>([]);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    fetch('/api/plaza/requests?limit=12')
      .then((r) => (r.ok ? r.json() : { requests: [] }))
      .then((data) => setRequests((data.requests ?? []) as RequestItem[]))
      .catch(() => setRequests([]));
    fetch('/api/plaza/discussions')
      .then((r) => (r.ok ? r.json() : { discussions: [] }))
      .then((data) => setDiscussions(((data.discussions ?? []) as DiscussionItem[]).slice(0, VISIBLE_DISCUSSIONS)))
      .catch(() => setDiscussions([]));
  }, []);

  useEffect(() => {
    if (requests.length <= VISIBLE_REQUESTS) return;
    const id = setInterval(() => setOffset((n) => n + 1), 7000);
    return () => clearInterval(id);
  }, [requests.length]);

  const visibleRequests =
    requests.length <= VISIBLE_REQUESTS
      ? requests
      : Array.from({ length: VISIBLE_REQUESTS }, (_, i) => requests[(offset + i) % requests.length]);

  return (
    <div className="space-y-3">
    <section
      aria-labelledby="rail-requests-title"
      className="rounded-2xl border border-[#e8e8ed] bg-white p-4 dark:border-[#2a2a2a] dark:bg-[#141414]"
    >
      <h2 id="rail-requests-title" className="text-xs font-semibold text-[#1d1d1f] dark:text-[#fafafa]">
        Pedidos de caza
      </h2>
      <p className="mt-0.5 text-[10px] leading-snug text-[#6e6e73] dark:text-[#a3a3a3]">Lo que la comunidad está pidiendo.</p>
      {note ? <p className="mt-2 text-[11px] leading-snug text-violet-700 dark:text-violet-300">{note}</p> : null}

      <div className="mt-3 space-y-2">
        <SectionTitle icon={Target}>Pedidos de caza</SectionTitle>
        {visibleRequests.length === 0 ? (
          <p className="text-[11px] leading-snug text-[#6e6e73] dark:text-[#a3a3a3]">
            Aún no hay pedidos. En Plaza la comunidad pide lo que quiere cazar.
          </p>
        ) : (
          <ul className="space-y-2">
            {visibleRequests.map((item) => (
              <li key={`${item.id}-${offset}`} className="border-b border-[#f0f0f2] pb-2 last:border-0 last:pb-0 dark:border-[#2a2a2a]">
                <p className="line-clamp-2 text-[11px] font-medium leading-snug text-[#1d1d1f] dark:text-[#fafafa]">{item.title}</p>
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
      </div>

      {discussions.length > 0 ? (
        <div className="mt-4 space-y-2 border-t border-[#f0f0f2] pt-3 dark:border-[#2a2a2a]">
          <SectionTitle icon={MessagesSquare}>En la Plaza</SectionTitle>
          <ul className="space-y-1.5">
            {discussions.map((d) => (
              <li key={d.id}>
                <Link
                  href="/plaza"
                  className="line-clamp-2 text-[11px] font-medium leading-snug text-[#1d1d1f] hover:text-violet-700 dark:text-[#fafafa] dark:hover:text-violet-300"
                >
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Link
        href="/plaza"
        className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] font-semibold text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-300"
      >
        Ir a la Plaza
        <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
      </Link>
    </section>

      {hunters.length > 0 ? (
        <section
          aria-labelledby="rail-hunters-title"
          className="rounded-2xl border border-[#e8e8ed] bg-white p-4 dark:border-[#2a2a2a] dark:bg-[#141414]"
        >
          <h2 id="rail-hunters-title" className="sr-only">Cazadores en el feed</h2>
          <div className="space-y-2">
          <SectionTitle icon={BowArrow}>Cazadores en el feed</SectionTitle>
          <ul className="space-y-1.5">
            {hunters.map((h) => {
              const body = (
                <>
                  {h.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.avatarUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-semibold text-violet-700 dark:bg-violet-950/60 dark:text-violet-300"
                      aria-hidden
                    >
                      {h.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[#1d1d1f] dark:text-[#fafafa]">{h.name}</span>
                  <span className="shrink-0 text-[10px] tabular-nums text-[#6e6e73] dark:text-[#a3a3a3]">
                    {h.offers} {h.offers === 1 ? 'oferta' : 'ofertas'}
                  </span>
                </>
              );
              return (
                <li key={h.userId}>
                  {h.profilePath ? (
                    <Link href={h.profilePath} className="flex items-center gap-2 rounded-lg hover:bg-[#f5f5f7] dark:hover:bg-[#1a1a1a]">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}
