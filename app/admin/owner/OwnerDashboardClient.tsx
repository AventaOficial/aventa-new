'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BowArrow, CircleDollarSign, MessagesSquare, Rocket, Server, Shield, Wrench } from 'lucide-react';
import { getYmdInTz } from '@/lib/owner/mxTime';
import { cn } from '@/app/components/panel/utils';
import CeoControlCenter from './components/CeoControlCenter';
import { useCommandCenter } from './command/useCommandCenter';
import { deriveGoals, deriveHealth, derivePriorities, teamStatusFromHealth } from './command/derive';
import HealthStatus from './command/HealthStatus';
import TeamCarousel, { type TeamTab } from './command/TeamCarousel';
import ActivityTimeline, { KIND_TEAM } from './command/ActivityTimeline';
import TechnicalDiagnostics from './command/TechnicalDiagnostics';
import ModerationTeam from './command/teams/ModerationTeam';
import FinanceTeam from './command/teams/FinanceTeam';
import GrowthTeam from './command/teams/GrowthTeam';
import ProductTeam from './command/teams/ProductTeam';
import HunterTeam from './command/teams/HunterTeam';
import CommunityTeam from './command/teams/CommunityTeam';
import OperationsTeam from './command/teams/OperationsTeam';
import { ErrorNote } from './command/ui';
import type { TeamId } from './command/types';
import CeoTopBar from './command/ceo/CeoTopBar';
import PulseCard from './command/ceo/PulseCard';
import PeriodActivityCard from './command/ceo/PeriodActivityCard';
import CommunityCard from './command/ceo/CommunityCard';
import UsersCard from './command/ceo/UsersCard';
import OffersCard from './command/ceo/OffersCard';
import CatalogCard from './command/ceo/CatalogCard';
import PlazaCard from './command/ceo/PlazaCard';
import ModerationCard from './command/ceo/ModerationCard';
import RevenueCard from './command/ceo/RevenueCard';
import PayoutsCard from './command/ceo/PayoutsCard';
import CapacityCard from './command/ceo/CapacityCard';
import GoalsCard from './command/ceo/GoalsCard';
import SeasonCard from './command/ceo/SeasonCard';
import PrioritiesCard from './command/ceo/PrioritiesCard';
import { CEO_MOSAIC_CSS } from './command/ceo/mosaic';

/** Reloj de pantalla para tiempos relativos y detección de datos stale. */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

const TEAM_HREF: Record<TeamId, string> = {
  moderacion: '/admin/moderation',
  finanzas: '/equipo/contabilidad',
  growth: '/admin/owner/crecimiento',
  producto: '/admin/health',
  hunter: '/admin/hunter',
  comunidad: '/plaza',
  operaciones: '/admin/operaciones',
};

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-0.5">
        <h2 id={`${id}-title`} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
          {title}
        </h2>
        {hint ? <p className="text-[11px] text-white/35">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function OwnerDashboardClient() {
  const { range, changeRange, data, refreshAll, retryCommand, refreshing, lastUpdated, authError } = useCommandCenter();
  const [team, setTeam] = useState<TeamId>('moderacion');
  const now = useNow();
  const todayYmd = getYmdInTz(new Date(now));

  const base = data.base.data;
  const cmd = data.command.data;
  const gerencia = data.gerencia.data;

  const health = useMemo(() => deriveHealth(base, cmd, todayYmd, now), [base, cmd, todayYmd, now]);
  const priorities = useMemo(() => derivePriorities(base, cmd, todayYmd, now), [base, cmd, todayYmd, now]);
  const goals = useMemo(() => deriveGoals(base, cmd, gerencia), [base, cmd, gerencia]);

  if (authError) return <ErrorNote message={authError} />;

  const loadingCore = data.base.status === 'loading' || data.command.status === 'loading';
  const rangePending = data.command.status === 'loading' && cmd != null && cmd.range.key !== range;
  const retryAll = () => void refreshAll();
  const activity = cmd?.activity ?? [];

  const openTeam = (id: TeamId) => {
    setTeam(id);
    document.getElementById('equipos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const tab = (id: TeamId, label: string, icon: TeamTab['icon'], missing: boolean, render: () => ReactNode): TeamTab => ({
    id,
    label,
    icon,
    status: teamStatusFromHealth(id, health, priorities, missing),
    href: TEAM_HREF[id],
    activity: activity.filter((e) => KIND_TEAM[e.kind] === id),
    render,
  });

  const teams: TeamTab[] = [
    tab('moderacion', 'Moderación', Shield, !base && !cmd, () => <ModerationTeam base={base} cmd={cmd} />),
    tab('finanzas', 'Finanzas', CircleDollarSign, !base, () => <FinanceTeam base={base} cmd={cmd} gerencia={gerencia} range={range} />),
    tab('growth', 'Growth', Rocket, !cmd, () => <GrowthTeam base={base} cmd={cmd} />),
    tab('producto', 'Producto', Server, !base, () => <ProductTeam base={base} cmd={cmd} />),
    tab('hunter', 'Hunter', BowArrow, !cmd || cmd.sources.hunter === 'error', () => <HunterTeam base={base} cmd={cmd} now={now} />),
    tab('comunidad', 'Comunidad', MessagesSquare, !cmd, () => <CommunityTeam cmd={cmd} />),
    tab('operaciones', 'Operaciones', Wrench, !base && !cmd, () => <OperationsTeam base={base} cmd={cmd} gerencia={gerencia} todayYmd={todayYmd} now={now} />),
  ];

  return (
    <div className="space-y-5 pb-10" data-ceo-dashboard>
      <header className="-mb-2 flex flex-wrap items-center justify-end gap-3">
        <h1 className="sr-only">CEO Dashboard</h1>
        <CeoTopBar
          range={range}
          onRangeChange={changeRange}
          rangePending={rangePending}
          lastUpdated={lastUpdated}
          refreshing={refreshing}
          onRefresh={retryAll}
          now={now}
          period={cmd?.range ?? null}
        />
      </header>

      {data.base.status === 'error' && base ? (
        <ErrorNote message="No se pudo actualizar el estado general. Se muestran los datos anteriores; detalle en Diagnóstico técnico." onRetry={retryAll} />
      ) : null}
      {data.command.status === 'error' && cmd ? (
        <ErrorNote message="No se pudo actualizar el período. Se muestran los datos anteriores; detalle en Diagnóstico técnico." onRetry={retryCommand} />
      ) : null}

      <style>{CEO_MOSAIC_CSS}</style>
      <div className={cn('ceo-mosaic', rangePending && 'opacity-80 transition-opacity')} aria-busy={rangePending}>
        <CommunityCard source={data.command} onRetry={retryCommand} className="ceo-area-community" />
        <UsersCard source={data.command} onRetry={retryCommand} className="ceo-area-users" />
        <OffersCard source={data.command} range={range} onRangeChange={changeRange} onRetry={retryCommand} className="ceo-area-offers" />
        <ModerationCard source={data.command} onRetry={retryCommand} className="ceo-area-moderation" />

        <RevenueCard base={data.base} command={data.command} range={range} onRangeChange={changeRange} onRetry={retryAll} className="ceo-area-revenue" />
        <PayoutsCard source={data.command} onRetry={retryCommand} className="ceo-area-payouts" />
        <CapacityCard source={data.command} onRetry={retryCommand} className="ceo-area-capacity" />

        <GoalsCard goals={goals} loading={loadingCore} className="ceo-area-goals" />
        <SeasonCard todayYmd={todayYmd} className="ceo-area-season" />
        <PrioritiesCard priorities={priorities} loading={loadingCore} dataMissing={!base && !cmd} className="ceo-area-priorities" />
      </div>

      <TeamCarousel teams={teams} active={team} loading={loadingCore && !base && !cmd} onChange={setTeam} now={now} />

      <Section id="operacion" title="Detalle del período">
        <PeriodActivityCard source={data.command} onRetry={retryCommand} />
      </Section>

      <Section id="catalogo" title="Catálogo" hint="Estado actual del catálogo">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <CatalogCard source={data.command} onRetry={retryCommand} />
          <PlazaCard source={data.command} onRetry={retryCommand} />
        </div>
      </Section>

      <ActivityTimeline command={data.command} now={now} onRetry={retryCommand} />

      <PulseCard command={data.command} base={base} range={range} onRetry={retryCommand} />

      <HealthStatus categories={health} loading={loadingCore} now={now} onOpenTeam={openTeam} />

      <TechnicalDiagnostics data={data}>{base ? <CeoControlCenter data={base} /> : null}</TechnicalDiagnostics>
    </div>
  );
}
