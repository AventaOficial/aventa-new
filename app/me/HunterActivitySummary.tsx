'use client';

import Link from 'next/link';

type HunterActivitySummaryProps = {
  published: number;
  approved: number;
  pending: number;
  rejected: number;
  positiveVotes: number | null;
  comments: number | null;
  views: number | null;
};

function piece(value: number | null, label: string): string {
  return `${value == null ? '—' : value} ${label}`;
}

/** Resumen de actividad del cazador — datos reales, una sola línea. */
export default function HunterActivitySummary({
  published,
  positiveVotes,
  comments,
  views,
}: HunterActivitySummaryProps) {
  const line = [
    piece(published, 'ofertas'),
    piece(positiveVotes, 'votos'),
    piece(comments, 'comentarios'),
    piece(views, 'vistas'),
  ].join(' · ');

  return (
    <section className="space-y-2 rounded-2xl bg-white p-5 dark:bg-[#141414]" aria-label="Actividad del cazador">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-[17px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Actividad</h2>
        <Link
          href="/me/nivel#actividad"
          className="rounded-md text-[13px] text-[#6e6e73] transition-colors duration-150 hover:text-[#1d1d1f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d1d1f] dark:text-[#a3a3a3] dark:hover:text-[#fafafa] dark:focus-visible:ring-[#fafafa]"
        >
          Ver actividad
        </Link>
      </div>
      <p className="text-[15px] leading-relaxed text-[#1d1d1f] dark:text-[#fafafa]">{line}</p>
    </section>
  );
}
