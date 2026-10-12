import { presentOfferPrice } from '@/lib/formatPrice';
import {
  LABEL_CONTRADICTED_NOTE,
  listPercentText,
  listPriceDifferenceText,
  observedDropText,
  type ListPriceView,
} from '@/lib/offers/listPriceComparison';

/** Precio de lista tachado y «−N% vs. lista», junto al precio actual (modal y detalle). */
export function OfferListPriceInline({
  view,
  currency,
  strikeClassName,
}: {
  view: ListPriceView;
  currency?: string | null;
  strikeClassName: string;
}) {
  if (!view.comparison) return null;
  return (
    <>
      <span className={`${strikeClassName} line-through`}>
        {presentOfferPrice(view.comparison.listPrice, currency)}
      </span>
      {view.listPercent != null ? (
        <span className="text-sm font-semibold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
          {listPercentText(view.listPercent)}
        </span>
      ) : null}
    </>
  );
}

/** Diferencia aritmética, contradicción del historial y bajada respaldada, cada una con su nombre. */
export function OfferListPriceNotes({
  view,
  currency,
  className,
}: {
  view: ListPriceView;
  currency?: string | null;
  className: string;
}) {
  const differenceText = view.comparison ? listPriceDifferenceText(view.comparison, currency) : null;
  if (!differenceText && !view.labelContradicted && view.observedDropPercent == null) return null;
  return (
    <div className={className}>
      {differenceText ? <p>{differenceText}</p> : null}
      {view.labelContradicted ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">{LABEL_CONTRADICTED_NOTE}</p>
      ) : null}
      {view.observedDropPercent != null ? (
        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
          {observedDropText(view.observedDropPercent)}
        </p>
      ) : null}
    </div>
  );
}
