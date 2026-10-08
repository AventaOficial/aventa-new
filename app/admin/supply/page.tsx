'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useCommandCenter } from '@/app/admin/owner/command/useCommandCenter';

const TABS = [
  { id: 'salud', label: 'Salud' },
  { id: 'humana', label: 'Oferta humana' },
  { id: 'cazadores', label: 'Crecimiento' },
  { id: 'motor', label: 'Motor' },
] as const;

export default function SupplyHomePage() {
  const { data } = useCommandCenter();
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('salud');
  const supply = data.command.data?.supply ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-1 pb-10">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300">Operar</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">Supply</h1>
        <p className="mt-1 text-sm text-white/50">Una sola casa para la oferta. Los cálculos viven en el informe que ya arma el centro.</p>
      </header>
      <div className="flex flex-wrap gap-1" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${tab === item.id ? 'bg-violet-500/20 text-violet-100' : 'text-white/50 hover:bg-white/[0.05]'}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/75">
        {!supply && data.command.status === 'loading' ? <p>Leyendo la oferta…</p> : null}
        {!supply && data.command.status !== 'loading' ? <p>No hay lectura de oferta en este momento.</p> : null}
        {supply && tab === 'salud' ? (
          <div className="space-y-2">
            <p>Salud {supply.health.level === 'CRITICAL' ? 'crítica' : supply.health.level === 'WARNING' ? 'en aviso' : 'estable'}.</p>
            <p>Pendientes ahora: {supply.pendingNow ?? '—'}.</p>
            <ul className="list-disc space-y-1 pl-4 text-[13px] text-white/65">
              {supply.health.conditions.slice(0, 4).map((condition) => (
                <li key={condition.code}>{condition.detail}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {supply && tab === 'humana' ? (
          <div className="space-y-2">
            {supply.humanSupply ? (
              <>
                <p>30 días: {supply.humanSupply.d30.contributors ?? '—'} humanos · {supply.humanSupply.d30.offers ?? '—'} ofertas.</p>
                <p>Aprobación {supply.humanSupply.d30.approvalRate == null ? '—' : `${Math.round(supply.humanSupply.d30.approvalRate * 100)}%`}.</p>
              </>
            ) : (
              <p>La oferta humana no se publica en esta lectura.</p>
            )}
            <Link href="/admin/owner/crecimiento/cazadores" className="text-violet-300 hover:underline">
              Ver cazadores
            </Link>
          </div>
        ) : null}
        {supply && tab === 'cazadores' ? (
          <div className="space-y-2">
            {supply.hunterGrowth ? (
              <p>
                30 días: {supply.hunterGrowth.d30.newHunters ?? '—'} nuevos · {supply.hunterGrowth.d30.firstApprovals ?? '—'} primeras aprobaciones ·{' '}
                {supply.hunterGrowth.d30.secondContributions ?? '—'} segundas contribuciones.
              </p>
            ) : (
              <p>El crecimiento no está en esta lectura.</p>
            )}
            <Link href="/admin/owner/experimentos" className="text-violet-300 hover:underline">
              Ver experimentos
            </Link>
          </div>
        ) : null}
        {tab === 'motor' ? (
          <div className="space-y-2">
            <p>El motor observa y propone. No publica solo.</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/admin/hunter" className="text-violet-300 hover:underline">
                Abrir motor
              </Link>
              <Link href="/admin/hunters-ai" className="text-violet-300 hover:underline">
                Revisar candidatos
              </Link>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
