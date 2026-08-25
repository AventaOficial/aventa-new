'use client';

import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { moderationUi } from '../moderation/moderationUi';
import type { CatalogGap } from '@/lib/catalog/priceBrackets';

type Props = {
  mode?: ModerationHubMode;
};

/**
 * Mapa de catálogo: cuántas ofertas vivas hay por rango de presupuesto y
 * dónde están los huecos. Responde «qué ofertas faltan y de cuánto».
 */
export default function ModerationCatalogMap({ mode = 'admin' }: Props) {
  const ui = moderationUi(mode);
  const [gaps, setGaps] = useState<CatalogGap[] | null>(null);
  const [totalMissing, setTotalMissing] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/catalog-gaps')
      .then((r) => r.json())
      .then((body) => {
        if (!alive) return;
        if (!Array.isArray(body?.gaps)) {
          setError('No se pudo leer el catálogo');
          return;
        }
        setGaps(body.gaps as CatalogGap[]);
        setTotalMissing(Number(body.totalMissing ?? 0));
      })
      .catch(() => {
        if (alive) setError('Error de red');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return <p className={`text-xs ${ui.muted}`}>Calculando presupuestos…</p>;
  }
  if (error || !gaps) {
    return <p className="text-xs text-amber-600 dark:text-amber-400">{error ?? 'Sin datos'}</p>;
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Wallet className={`h-3.5 w-3.5 ${ui.iconSoft}`} aria-hidden />
        <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${ui.label}`}>
          Mapa de presupuestos
        </p>
        <span className={`ml-auto text-[11px] tabular-nums ${ui.muted}`}>
          {totalMissing > 0 ? `Faltan ${totalMissing}` : 'Catálogo completo'}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {gaps.map((gap) => (
          <div key={gap.id}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className={`truncate text-[11px] font-medium ${ui.soft}`} title={gap.hint}>
                {gap.label}
              </span>
              <span className={`shrink-0 text-[11px] tabular-nums ${ui.muted}`}>
                {gap.count}/{gap.target}
              </span>
            </div>
            <div className={`h-1.5 overflow-hidden rounded-full ${ui.thumbBg}`}>
              <div
                className={`h-full rounded-full ${
                  gap.missing === 0
                    ? 'bg-emerald-500'
                    : gap.fillPercent < 50
                      ? 'bg-red-500'
                      : 'bg-amber-500'
                }`}
                style={{ width: `${gap.fillPercent}%` }}
              />
            </div>
            {gap.missing > 0 ? (
              <p className={`mt-0.5 text-[10px] ${ui.faint}`}>Faltan {gap.missing}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
