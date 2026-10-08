'use client';

import Link from 'next/link';
import { useCommandCenter } from '@/app/admin/owner/command/useCommandCenter';

export default function CazadoresGrowthPage() {
  const { data } = useCommandCenter();
  const report = data.command.data?.supply?.humanSupply ?? null;
  const growth = data.command.data?.supply?.hunterGrowth ?? null;
  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-10">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300">Crecer</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">Cazadores</h1>
        <p className="mt-1 text-sm text-white/50">Solo personas. Un envío sin aprobar no cuenta como éxito.</p>
      </header>
      <section className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/75">
        {!report ? <p>Sin lectura de oferta humana.</p> : null}
        {report ? (
          <>
            <p>7 días: {report.d7.contributors ?? '—'} humanos · {report.d7.offers ?? '—'} ofertas.</p>
            <p>30 días: {report.d30.contributors ?? '—'} humanos · {report.d30.offers ?? '—'} ofertas · aprobación {report.d30.approvalRate == null ? '—' : `${Math.round(report.d30.approvalRate * 100)}%`}.</p>
          </>
        ) : null}
        {growth ? (
          <p>
            Embudo 30 días: {growth.d30.firstSubmissions ?? '—'} primeros envíos · {growth.d30.firstApprovals ?? '—'} primeras aprobaciones ·{' '}
            {growth.d30.secondContributions ?? '—'} segundas.
          </p>
        ) : null}
        <Link href="/admin/owner/experimentos" className="inline-block text-violet-300 hover:underline">
          Experimentos
        </Link>
      </section>
    </div>
  );
}
