'use client';

import Link from 'next/link';
import { ExternalLink, Plus, Check } from 'lucide-react';
import OfferMedia from '@/app/components/offers/OfferMedia';
import { buildOfferPublicPath } from '@/lib/offerPath';
import { formatMxnCents, unitPriceLabel, type DespensaNeedPlan, type DespensaPick } from '@/lib/despensa/plan';
import { DespensaPickDetails } from './DespensaPickDetails';

type Props = {
  plan: DespensaNeedPlan;
  selected: ReadonlySet<string>;
  onToggle: (pick: DespensaPick) => void;
};

function ToggleButton({ pick, active, onToggle }: { pick: DespensaPick; active: boolean; onToggle: (p: DespensaPick) => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onToggle(pick)}
      className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors ${
        active
          ? 'bg-emerald-600 text-white hover:bg-emerald-500'
          : 'bg-[#e8e8ed] text-[#1d1d1f] hover:bg-[#d2d2d7] dark:bg-[#2c2c2e] dark:text-[#fafafa] dark:hover:bg-[#3a3a3c]'
      }`}
    >
      {active ? <Check className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
      {active ? 'En tu lista' : 'Agregar a mi lista'}
    </button>
  );
}

/** Una necesidad: la mejor opción según el ranking y, plegadas, las demás presentaciones. */
export function DespensaNeedSection({ plan, selected, onToggle }: Props) {
  const [best, ...others] = plan.picks;
  const href = buildOfferPublicPath(best.offer.id, best.offer.title);
  return (
    <article className="rounded-2xl border border-[#e5e5e7] bg-white p-4 dark:border-[#262626] dark:bg-[#141414]">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">{plan.need.label}</h3>
        {plan.personal ? <span className="text-[12px] text-violet-700 dark:text-violet-300">En tus intereses</span> : null}
      </header>
      <div className="mt-3 flex gap-3">
        <Link href={href} className="w-20 shrink-0 sm:w-24" aria-label={`Ver ${best.offer.title}`}>
          <OfferMedia src={best.offer.imageUrl} alt={best.offer.title} sizes="96px" ratioClass="aspect-square" compact />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={href} className="line-clamp-2 text-[14px] font-medium text-[#1d1d1f] hover:underline dark:text-[#fafafa]">
            {best.offer.title}
          </Link>
          <p className="mt-0.5 text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">
            {[best.offer.store, best.variantLabel].filter(Boolean).join(' · ')}
          </p>
          <div className="mt-2">
            <DespensaPickDetails pick={best} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ToggleButton pick={best} active={selected.has(best.offer.id)} onToggle={onToggle} />
            <Link href={href} className="inline-flex items-center gap-1 text-[13px] font-semibold text-violet-700 hover:underline dark:text-violet-300">
              Ver oferta <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
      {others.length > 0 ? (
        <details className="mt-3 border-t border-[#e5e5e7] pt-3 dark:border-[#262626]">
          <summary className="cursor-pointer text-[13px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">
            Comparar {others.length} {others.length === 1 ? 'opción más' : 'opciones más'}
          </summary>
          <ul className="mt-2 divide-y divide-[#e5e5e7] dark:divide-[#262626]">
            {others.map((p) => {
              const otherHref = buildOfferPublicPath(p.offer.id, p.offer.title);
              return (
                <li key={p.offer.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link href={otherHref} className="line-clamp-2 text-[13px] text-[#1d1d1f] hover:underline dark:text-[#fafafa]">
                      {p.offer.title}
                    </Link>
                    <p className="text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">
                      {[
                        formatMxnCents(p.offer.discountPrice),
                        p.unitPrice ? unitPriceLabel(p.unitPrice) : 'sin precio por unidad',
                        p.cheapestPerUnit ? 'el más bajo por unidad aquí' : null,
                        p.offer.store,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <ToggleButton pick={p} active={selected.has(p.offer.id)} onToggle={onToggle} />
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </article>
  );
}
