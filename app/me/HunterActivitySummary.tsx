'use client';

type HunterActivitySummaryProps = {
  published: number;
  approved: number;
  pending: number;
  rejected: number;
  positiveVotes: number;
  comments: number;
  views: number;
};

function StatCard({
  label,
  value,
  hint,
  valueClassName = 'text-gray-900 dark:text-gray-100',
}: {
  label: string;
  value: number;
  hint?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClassName}`}>{value}</p>
      {hint ? (
        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-500 leading-snug">{hint}</p>
      ) : null}
    </div>
  );
}

/** Resumen de actividad del cazador — datos reales, sin hardcode. */
export default function HunterActivitySummary({
  published,
  approved,
  pending,
  rejected,
  positiveVotes,
  comments,
  views,
}: HunterActivitySummaryProps) {
  return (
    <section className="mb-8 space-y-3" aria-label="Actividad del cazador">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          Actividad del cazador
        </h2>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Señales de calidad y contribución a la comunidad — no un marcador de spam.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Ofertas publicadas" value={published} />
        <StatCard
          label="Ofertas aprobadas"
          value={approved}
          valueClassName="text-emerald-600 dark:text-emerald-400"
          hint="Activas ahora"
        />
        <StatCard
          label="En revisión"
          value={pending}
          valueClassName="text-amber-600 dark:text-amber-400"
        />
        <StatCard
          label="Rechazadas"
          value={rejected}
          valueClassName={rejected > 0 ? 'text-red-600 dark:text-red-400' : undefined}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Votos positivos"
          value={positiveVotes}
          valueClassName="text-rose-600 dark:text-rose-400"
        />
        <StatCard label="Comentarios" value={comments} hint="Aprobados en tus ofertas" />
        <StatCard label="Vistas" value={views} hint="En el detalle de tus ofertas" />
      </div>
    </section>
  );
}
