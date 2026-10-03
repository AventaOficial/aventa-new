'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, BowArrow, CircleDollarSign, MessagesSquare, Rocket, Server, Shield, Wrench } from 'lucide-react';
import { getYmdInTz } from '@/lib/owner/mxTime';
import CeoControlCenter from './components/CeoControlCenter';
import { useCommandCenter } from './command/useCommandCenter';
import { deriveGoals, deriveHealth, derivePriorities, teamStatusFromHealth } from './command/derive';
import CommandHeader from './command/CommandHeader';
import CeoPriorities from './command/CeoPriorities';
import HealthStatus from './command/HealthStatus';
import ExecutivePulse from './command/ExecutivePulse';
import TeamCarousel, { type TeamTab } from './command/TeamCarousel';
import CatalogHealth from './command/CatalogHealth';
import CapacityPanel from './command/CapacityPanel';
import CeoGoals from './command/CeoGoals';
import SeasonPanel from './command/SeasonPanel';
import ActivityTimeline from './command/ActivityTimeline';
import ActivityChart from './command/ActivityChart';
import ModerationTeam from './command/teams/ModerationTeam';
import FinanceTeam from './command/teams/FinanceTeam';
import GrowthTeam from './command/teams/GrowthTeam';
import ProductTeam from './command/teams/ProductTeam';
import HunterTeam from './command/teams/HunterTeam';
import CommunityTeam from './command/teams/CommunityTeam';
import OperationsTeam from './command/teams/OperationsTeam';
import { ErrorNote, Panel, SourceGate } from './command/ui';
import type { HealthLevel, TeamId } from './command/types';

/** Reloj de pantalla para tiempos relativos y detección de datos stale. */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function OwnerDashboardClient() {
  const { range, changeRange, data, refreshAll, retryCommand, refreshing, lastUpdated, authError } = useCommandCenter();
  const [team, setTeam] = useState<TeamId>('moderacion');
  const [showDetail, setShowDetail] = useState(false);
  const now = useNow();
  const todayYmd = getYmdInTz(new Date(now));

  const base = data.base.data;
  const cmd = data.command.data;
  const gerencia = data.gerencia.data;

  const health = useMemo(() => deriveHealth(base, cmd, todayYmd, now), [base, cmd, todayYmd, now]);
  const priorities = useMemo(() => derivePriorities(base, cmd, todayYmd, now), [base, cmd, todayYmd, now]);
  const goals = useMemo(() => deriveGoals(base, cmd, gerencia), [base, cmd, gerencia]);

  const systemLevel: HealthLevel = !base
    ? 'UNKNOWN'
    : base.summary.status === 'red'
      ? 'CRITICAL'
      : base.summary.status === 'yellow'
        ? 'WARNING'
        : 'HEALTHY';
  const systemLabel = !base ? 'Sistema: sin dato' : `Sistema: ${base.summary.headline}`;

  const openTeam = (id: TeamId) => {
    setTeam(id);
    document.getElementById('equipos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const teams: TeamTab[] = [
    { id: 'moderacion', label: 'Moderación', icon: Shield, status: teamStatusFromHealth('moderacion', health, priorities, !base && !cmd), render: () => <ModerationTeam base={base} cmd={cmd} /> },
    { id: 'finanzas', label: 'Finanzas', icon: CircleDollarSign, status: teamStatusFromHealth('finanzas', health, priorities, !base), render: () => <FinanceTeam base={base} cmd={cmd} gerencia={gerencia} range={range} /> },
    { id: 'growth', label: 'Growth', icon: Rocket, status: teamStatusFromHealth('growth', health, priorities, !cmd), render: () => <GrowthTeam base={base} cmd={cmd} /> },
    { id: 'producto', label: 'Producto', icon: Server, status: teamStatusFromHealth('producto', health, priorities, !base), render: () => <ProductTeam base={base} cmd={cmd} /> },
    { id: 'hunter', label: 'Hunter', icon: BowArrow, status: teamStatusFromHealth('hunter', health, priorities, !cmd || cmd.sources.hunter === 'error'), render: () => <HunterTeam base={base} cmd={cmd} now={now} /> },
    { id: 'comunidad', label: 'Comunidad', icon: MessagesSquare, status: teamStatusFromHealth('comunidad', health, priorities, !cmd), render: () => <CommunityTeam cmd={cmd} /> },
    { id: 'operaciones', label: 'Operaciones', icon: Wrench, status: teamStatusFromHealth('operaciones', health, priorities, !base && !cmd), render: () => <OperationsTeam base={base} cmd={cmd} gerencia={gerencia} todayYmd={todayYmd} now={now} /> },
  ];

  if (authError) return <ErrorNote message={authError} />;

  const loadingCore = data.base.status === 'loading' || data.command.status === 'loading';
  const rangePending = data.command.status === 'loading' && cmd != null && cmd.range.key !== range;

  return (
    <div className="pb-12" data-ceo-command-center>
      <CommandHeader
        range={range}
        onRangeChange={changeRange}
        rangePending={rangePending}
        systemLevel={systemLevel}
        systemLabel={systemLabel}
        lastUpdated={lastUpdated}
        refreshing={refreshing}
        onRefresh={() => void refreshAll()}
        now={now}
      />

      {data.base.status === 'error' ? (
        <div className="mb-4">
          <ErrorNote
            message={
              base
                ? `La última actualización del snapshot del panel falló (${data.base.error ?? 'error'}). Se muestran los datos anteriores.`
                : `No se pudo cargar el snapshot del panel: ${data.base.error ?? 'error'}. Las tarjetas que dependen de él se muestran como UNKNOWN.`
            }
            onRetry={() => void refreshAll()}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
        <CeoPriorities priorities={priorities} loading={loadingCore} dataMissing={!base && !cmd} onOpenTeam={openTeam} className="md:col-span-2 xl:col-span-7" />
        <div className="md:col-span-2 xl:col-span-5 [&>*]:h-full">
          <HealthStatus categories={health} loading={loadingCore} onOpenTeam={openTeam} />
        </div>

        <div className="md:col-span-2 xl:col-span-12">
          <ExecutivePulse command={data.command} base={base} range={range} onRetry={retryCommand} />
        </div>

        <div className="md:col-span-2 xl:col-span-12">
          <TeamCarousel teams={teams} active={team} loading={loadingCore && !base && !cmd} onChange={setTeam} />
        </div>

        <div className="md:col-span-2 xl:col-span-5 [&>*]:h-full">
          <Panel id="tendencia" title="Actividad del período" icon={BarChart3} subtitle={cmd ? `${cmd.range.label} · comparación en Executive Pulse` : 'Serie temporal del período'}>
            <SourceGate source={data.command} onRetry={retryCommand} rows={3} label="serie temporal">
              {(c) => <ActivityChart series={c.series} />}
            </SourceGate>
          </Panel>
        </div>
        <div className="xl:col-span-3 [&>*]:h-full">
          <CatalogHealth command={data.command} onRetry={retryCommand} />
        </div>
        <div className="xl:col-span-4 [&>*]:h-full">
          <CapacityPanel base={base} cmd={cmd} />
        </div>

        <div className="xl:col-span-4 [&>*]:h-full">
          <CeoGoals goals={goals} loading={loadingCore} gerencia={data.gerencia} onRetryGerencia={() => void refreshAll()} />
        </div>
        <div className="xl:col-span-4 [&>*]:h-full">
          <SeasonPanel todayYmd={todayYmd} announcements={data.announcements} onRetry={() => void refreshAll()} />
        </div>
        <div className="md:col-span-2 xl:col-span-4 [&>*]:h-full">
          <ActivityTimeline command={data.command} now={now} onRetry={retryCommand} />
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.06]">
        <button
          type="button"
          aria-expanded={showDetail}
          aria-controls="ceo-technical-detail"
          onClick={() => setShowDetail((v) => !v)}
          className="flex w-full items-center justify-between gap-3 bg-white/[0.02] px-5 py-4 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/60"
        >
          <span className="text-sm font-medium text-white/70">
            {showDetail ? 'Ocultar diagnóstico técnico' : 'Ver diagnóstico técnico completo'}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-white/30">supply · atribución · system health</span>
        </button>
        {showDetail ? (
          <div id="ceo-technical-detail" className="border-t border-white/[0.06] p-4">
            {base ? <CeoControlCenter data={base} /> : <ErrorNote message="Diagnóstico no disponible sin snapshot del panel." onRetry={() => void refreshAll()} />}
          </div>
        ) : null}
      </div>
    </div>
  );
}
