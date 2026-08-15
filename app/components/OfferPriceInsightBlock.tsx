'use client';

import { useEffect, useState } from 'react';
import type { PriceInsight } from '@/lib/offers/priceHistory';

function formatMx(n: number): string {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
}

/** Bloque compacto de historial propio AVENTA (90d) para Información adicional. */
export default function OfferPriceInsightBlock({ offerId }: { offerId: string }) {
  const [insight, setInsight] = useState<PriceInsight | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!offerId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/offers/${offerId}/price-insight`);
        if (!res.ok) {
          if (!cancelled) setFailed(true);
          return;
        }
        const data = (await res.json()) as { insight?: PriceInsight };
        if (!cancelled && data.insight) setInsight(data.insight);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offerId]);

  if (failed) return null;
  if (!insight) {
    return (
      <p className="text-xs text-gray-400 dark:text-gray-500">Consultando historial de precio…</p>
    );
  }

  const tone =
    insight.verdict === 'strong'
      ? 'text-emerald-700 dark:text-emerald-400'
      : insight.verdict === 'label_only'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-gray-700 dark:text-gray-300';

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        Precio en AVENTA (hasta 90 días)
      </p>
      <p className={`text-sm leading-relaxed ${tone}`}>{insight.verdictLabel}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
        <span>
          Ahora: <strong className="text-gray-800 dark:text-gray-200 tabular-nums">{formatMx(insight.current)}</strong>
        </span>
        {insight.min90d != null ? (
          <span>
            Mín. visto: <strong className="tabular-nums">{formatMx(insight.min90d)}</strong>
          </span>
        ) : null}
        {insight.labelDiscountPct != null ? (
          <span>
            Descuento etiqueta: <strong className="tabular-nums">{insight.labelDiscountPct}%</strong>
          </span>
        ) : null}
        {insight.samples90d > 0 ? <span>{insight.samples90d} registro{insight.samples90d === 1 ? '' : 's'}</span> : null}
      </div>
    </div>
  );
}
