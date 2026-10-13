import { DESPENSA_PLAN_COPY, formatMxnCents, unitPriceLabel, type DespensaPick } from '@/lib/despensa/plan';

const OBSERVED_AT = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'America/Mexico_City' });

const STATUS_TONE: Record<DespensaPick['status'], string> = {
  verified_saving: 'text-emerald-700 dark:text-emerald-400',
  observed_price: 'text-[#1d1d1f] dark:text-[#fafafa]',
  reported_price: 'text-amber-700 dark:text-amber-400',
};

/** Precio, estado de la evidencia, avisos y motivos. Sin insignias: una línea de estado y texto. */
export function DespensaPickDetails({ pick, showReasons = true }: { pick: DespensaPick; showReasons?: boolean }) {
  const { offer } = pick;
  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[18px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">{formatMxnCents(offer.discountPrice)}</span>
        {pick.unitPrice ? (
          <span className="text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">
            {unitPriceLabel(pick.unitPrice)}
            {pick.cheapestPerUnit ? ' · el más bajo por unidad aquí' : ''}
          </span>
        ) : null}
      </p>
      <p className={`mt-1 text-[13px] font-semibold ${STATUS_TONE[pick.status]}`}>
        {DESPENSA_PLAN_COPY.status[pick.status]}
        {pick.saving.status === 'verified'
          ? pick.saving.basis === 'own_history_median'
            ? ` · ${formatMxnCents(pick.saving.amount)} menos que su precio habitual en Aventa`
            : ` · ${formatMxnCents(pick.saving.amount)} menos que su precio más alto en 90 días`
          : null}
      </p>
      <p className="mt-0.5 text-[12px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">{DESPENSA_PLAN_COPY.statusHelp[pick.status]}</p>
      {pick.notes.length > 0 ? (
        <ul className="mt-1 space-y-0.5 text-[12px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">
          {pick.notes.map((n) => (
            <li key={n}>
              {DESPENSA_PLAN_COPY.notes[n]}
              {n === 'price_differs' && pick.saving.status === 'price_differs'
                ? ` Aventa vio ${formatMxnCents(pick.saving.observedPrice)} el ${OBSERVED_AT.format(new Date(pick.saving.observedAt))}.`
                : null}
            </li>
          ))}
        </ul>
      ) : null}
      {showReasons && pick.reasons.length > 0 ? (
        <div className="mt-2">
          <p className="text-[12px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Por qué la recomendamos</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[12px] leading-relaxed text-[#424245] dark:text-[#d4d4d4]">
            {pick.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
