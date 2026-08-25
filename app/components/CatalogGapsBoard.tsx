'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Target, Wallet } from 'lucide-react';
import type { CatalogGap } from '@/lib/catalog/priceBrackets';

type Props = {
  /** `card` para Plaza y la Guía; `compact` para rieles laterales. */
  variant?: 'card' | 'compact';
  title?: string;
};

/**
 * «Qué falta hoy»: huecos del catálogo por rango de presupuesto, para que los
 * cazadores sepan qué buscar en vez de adivinar.
 */
export default function CatalogGapsBoard({
  variant = 'card',
  title = 'Qué falta hoy',
}: Props) {
  const [gaps, setGaps] = useState<CatalogGap[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/catalog-gaps')
      .then((r) => (r.ok ? r.json() : { gaps: [] }))
      .then((body) => {
        if (alive) setGaps(Array.isArray(body?.gaps) ? (body.gaps as CatalogGap[]) : []);
      })
      .catch(() => {
        if (alive) setGaps([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const missing = (gaps ?? []).filter((g) => g.missing > 0).sort((a, b) => b.missing - a.missing);
  const compact = variant === 'compact';

  return (
    <div className="rounded-2xl border border-[#e8e8ed] bg-white p-4 dark:border-[#2a2a2a] dark:bg-[#141414]">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />
        <p className="text-sm font-semibold text-[#1d1d1f] dark:text-[#fafafa]">{title}</p>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-[#6e6e73] dark:text-[#a3a3a3]">
        Estos son los rangos de precio donde el catálogo está flojo. Si encuentras algo así, súbelo.
      </p>

      {loading ? (
        <p className="mt-3 text-[11px] text-[#6e6e73] dark:text-[#a3a3a3]">Calculando…</p>
      ) : missing.length === 0 ? (
        <p className="mt-3 text-[11px] text-[#6e6e73] dark:text-[#a3a3a3]">
          Ahora mismo el catálogo está completo en todos los rangos. Sube lo que encuentres bueno.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {missing.slice(0, compact ? 3 : 5).map((gap) => (
            <li
              key={gap.id}
              className="border-b border-[#f0f0f2] pb-2.5 last:border-0 last:pb-0 dark:border-[#2a2a2a]"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[13px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">
                  {gap.label}
                </p>
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-violet-600 dark:text-violet-400">
                  faltan {gap.missing}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-[#6e6e73] dark:text-[#a3a3a3]">
                {gap.hint}
              </p>
              {!compact ? (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#f0f0f2] dark:bg-[#2a2a2a]">
                  <div
                    className="h-full rounded-full bg-violet-500"
                    style={{ width: `${gap.fillPercent}%` }}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/subir"
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2.5 text-[12px] font-semibold text-white hover:bg-violet-500"
      >
        <Target className="h-3.5 w-3.5" aria-hidden />
        Subir una oferta
      </Link>
    </div>
  );
}
