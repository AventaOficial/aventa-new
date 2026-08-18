'use client';

import Link from 'next/link';
import GlassCard from '@/app/components/panel/GlassCard';
import EmptyState from '@/app/components/panel/EmptyState';
import SectionHeader from '@/app/components/panel/SectionHeader';
import { buildIntelligenceFromData } from '@/lib/owner/buildIntelligence';
import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import { cn } from '@/app/components/panel/utils';

const PRIORITY_CLASS = {
  alta: 'border-red-500/30 bg-red-500/[0.06] text-red-300',
  media: 'border-amber-500/30 bg-amber-500/[0.06] text-amber-300',
  baja: 'border-white/10 bg-white/[0.03] text-white/60',
};

export default function AventaIntelligence({ data }: { data: OwnerDashboardPayload }) {
  const { insights, actions, hasEnoughData } = buildIntelligenceFromData(data);

  return (
    <GlassCard variant="dark" padding="lg" className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-600/10 via-transparent to-transparent pointer-events-none" />
      <div className="relative">
        <SectionHeader
          title="AVENTA Intelligence"
          subtitle="Resumen derivado de datos reales del sistema"
          variant="dark"
        />

        {!hasEnoughData ? (
          <EmptyState
            title="No hay suficientes datos para generar recomendaciones."
            variant="dark"
            className="py-6"
          />
        ) : (
          <>
            <ul className="mt-4 space-y-2">
              {insights.map((ins, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-white/65">
                  <span className="text-violet-400 mt-0.5">•</span>
                  {ins.text}
                </li>
              ))}
            </ul>

            {actions.length > 0 ? (
              <div className="mt-5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/35 mb-2">
                  Recommended actions
                </p>
                <ol className="space-y-2">
                  {actions.map((action, i) => (
                    <li key={i}>
                      <Link
                        href={action.href}
                        className={cn(
                          'flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition-all duration-200 hover:brightness-110',
                          PRIORITY_CLASS[action.priority]
                        )}
                      >
                        <span>
                          {i + 1}. {action.label}
                        </span>
                        <span className="text-[10px] uppercase opacity-60">{action.priority}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </>
        )}
      </div>
    </GlassCard>
  );
}
