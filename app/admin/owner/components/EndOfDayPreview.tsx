'use client';

import GlassCard from '@/app/components/panel/GlassCard';
import SectionHeader from '@/app/components/panel/SectionHeader';
import { formatMoneyCents, formatNum, greetingForHour } from '@/app/components/panel/utils';
import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import { buildIntelligenceFromData } from '@/lib/owner/buildIntelligence';

/** Componente preparado para experiencia de cierre de día — no obligatorio aún */
export default function EndOfDayPreview({ data }: { data: OwnerDashboardPayload }) {
  const hour = new Date().getHours();
  if (hour < 18) return null;

  const { actions } = buildIntelligenceFromData(data);

  return (
    <GlassCard variant="dark" padding="lg" className="border border-violet-500/15">
      <SectionHeader
        title="End of Day"
        subtitle={`${greetingForHour(hour)} · resumen del día`}
        variant="dark"
      />
      <p className="mt-3 text-sm text-white/60">
        Hoy AVENTA generó{' '}
        <span className="text-white font-medium">
          {formatMoneyCents(data.economy.day.estimatedCents ?? data.economy.day.realCents)}
        </span>{' '}
        estimado ·{' '}
        <span className="text-white font-medium">{formatNum(data.today.outbound)}</span> clics ·{' '}
        <span className="text-white font-medium">{formatNum(data.today.newUsers)}</span> usuarios nuevos.
      </p>
      {data.alerts.length > 0 ? (
        <p className="mt-2 text-xs text-white/40">
          {data.alerts.length} alerta(s) activa(s) — revisar antes de cerrar.
        </p>
      ) : (
        <p className="mt-2 text-xs text-emerald-400/80">Sin incidentes críticos pendientes.</p>
      )}
      {actions[0] ? (
        <p className="mt-3 text-xs text-white/45">
          Mañana deberías revisar: <span className="text-violet-300">{actions[0].label}</span>
        </p>
      ) : null}
    </GlassCard>
  );
}
