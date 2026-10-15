'use client';

import { useEffect, useState } from 'react';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { moderationUi } from '@/app/admin/moderation/moderationUi';
import { cn } from '@/app/components/panel/utils';

type SimilarRow = {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  store: string | null;
  created_at: string;
};

type Props = {
  store: string | null;
  title: string | null;
  offerUrl: string | null;
  mode: ModerationHubMode;
};

export default function FocusSimilarOffers({ store, title, offerUrl, mode }: Props) {
  const ui = moderationUi(mode);
  const [rows, setRows] = useState<SimilarRow[]>([]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (store) params.set('store', store);
    if (title) params.set('title', title);
    if (offerUrl) params.set('offer_url', offerUrl);
    if (!params.toString()) return;
    let cancelled = false;
    fetch(`/api/offers/similar?${params}`)
      .then((res) => (res.ok ? res.json() : { similar: [] }))
      .then((body: { similar?: SimilarRow[] }) => {
        if (!cancelled) setRows(Array.isArray(body.similar) ? body.similar : []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [store, title, offerUrl]);

  if (rows.length === 0) return null;

  return (
    <section>
      <p className={cn('text-xs font-semibold uppercase tracking-wider', ui.label)}>Ofertas parecidas en Aventa</p>
      <p className={cn('mt-1 text-sm', ui.muted)}>Misma tienda o título similar ya publicado. Revisa si es duplicado.</p>
      <ul className="mt-2 space-y-2">
        {rows.slice(0, 5).map((row) => (
          <li key={row.id} className={cn('rounded-lg border px-2 py-1.5 text-xs', ui.border)}>
            <p className={cn('font-medium', ui.body)}>{row.title}</p>
            <p className={cn('tabular-nums', ui.muted)}>
              ${row.price}
              {row.original_price != null ? ` · lista $${row.original_price}` : ''}
              {row.store ? ` · ${row.store}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
