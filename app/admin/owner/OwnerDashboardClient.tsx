'use client';

import { useEffect, useMemo, useState } from 'react';
import { BowArrow, CircleDollarSign, MessagesSquare, Rocket, Server, Shield, Wrench } from 'lucide-react';
import { getYmdInTz } from '@/lib/owner/mxTime';
import { cn } from '@/app/components/panel/utils';
import { useCommandCenter } from './command/useCommandCenter';
import { deriveGoals, deriveHealth, derivePriorities, teamStatusFromHealth } from './command/derive';
import { ErrorNote } from './command/ui';
import type { TeamId } from './command/types';
import { TEAM_TOOL_HREF } from './command/drilldowns';
import { summarizeDecision } from './command/decision';
import DecisionStrip from './command/ceo/DecisionStrip';
import CeoTopBar from './command/ceo/CeoTopBar';
import CommunityCard from './command/ceo/CommunityCard';
import UsersCard from './command/ceo/UsersCard';
import OffersCard from './command/ceo/OffersCard';
import TeamsCard, { type TeamRow } from './command/ceo/TeamsCard';
import { teamSnapshot } from './command/ceo/teamSnapshot';
import RevenueCard from './command/ceo/RevenueCard';
import PayoutsCard from './command/ceo/PayoutsCard';
import CapacityCard from './command/ceo/CapacityCard';
import GoalsCard from './command/ceo/GoalsCard';
import SeasonCard from './command/ceo/SeasonCard';
import PrioritiesCard from './command/ceo/PrioritiesCard';
import HuntersSupplyPulse from './command/ceo/HuntersSupplyPulse';
import SupplyIntelligenceCard from './command/ceo/SupplyIntelligenceCard';
import HumanSupplyCard from './command/ceo/HumanSupplyCard';
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

export default function OwnerDashboardClient() {
  const { range, changeRange, data, refreshAll, retryCommand, refreshing, lastUpdated, authError } = useCommandCenter();
  const now = useNow();
  const todayYmd = getYmdInTz(new Date(now));

  const base = data.base.data;
  const cmd = data.command.data;
  const gerencia = data.gerencia.data;

  const health = useMemo(() => deriveHealth(base, cmd, todayYmd, now), [base, cmd, todayYmd, now]);
  const priorities = useMemo(() => derivePriorities(base, cmd, todayYmd, now), [base, cmd, todayYmd, now]);
  const goals = useMemo(() => deriveGoals(base, cmd, gerencia), [base, cmd, gerencia]);
  const decision = useMemo(() => summarizeDecision(health, priorities), [health, priorities]);

  if (authError) return <ErrorNote message={authError} />;

  const loadingCore = data.base.status === 'loading' || data.command.status === 'loading';
  const rangePending = data.command.status === 'loading' && cmd != null && cmd.range.key !== range;
  const retryAll = () => void refreshAll();

  const team = (id: TeamId, label: string, icon: TeamRow['icon'], missing: boolean): TeamRow => ({
    id,
    label,
    icon,
    status: teamStatusFromHealth(id, health, priorities, missing),
    href: TEAM_TOOL_HREF[id],
    snapshot: teamSnapshot(id, base, cmd, priorities),
  });

  const teams: TeamRow[] = [
    team('moderacion', 'Moderación', Shield, !base && !cmd),
    team('finanzas', 'Finanzas', CircleDollarSign, !base),
    team('growth', 'Growth', Rocket, !cmd),
    team('producto', 'Producto', Server, !base),
    team('hunter', 'Hunter', BowArrow, !cmd || cmd.sources.hunter === 'error'),
    team('comunidad', 'Comunidad', MessagesSquare, !cmd),
    team('operaciones', 'Operaciones', Wrench, !base && !cmd),
  ];

  return (
    <div className="space-y-5 pb-10" data-ceo-dashboard>
      <header className="-mb-2 flex flex-wrap items-center justify-end gap-3">
        <h1 className="sr-only">CEO Dashboard</h1>
        <DecisionStrip summary={decision} loading={loadingCore && !base && !cmd} />
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
        <ErrorNote message="No se pudo actualizar el estado general. Se muestran los datos anteriores." onRetry={retryAll} />
      ) : null}
      {data.command.status === 'error' && cmd ? (
        <ErrorNote message="No se pudo actualizar el período. Se muestran los datos anteriores." onRetry={retryCommand} />
      ) : null}

      <style>{CEO_MOSAIC_CSS}</style>
      <HuntersSupplyPulse />
      <SupplyIntelligenceCard source={data.command} />
      <HumanSupplyCard source={data.command} />
      <div className={cn('ceo-mosaic', rangePending && 'opacity-80 transition-opacity')} aria-busy={rangePending}>
        <CommunityCard source={data.command} onRetry={retryCommand} className="ceo-area-community" />
        <UsersCard source={data.command} onRetry={retryCommand} className="ceo-area-users" />
        <OffersCard source={data.command} range={range} onRangeChange={changeRange} onRetry={retryCommand} className="ceo-area-offers" />
        <TeamsCard teams={teams} loading={loadingCore && !base && !cmd} className="ceo-area-teams" />

        <RevenueCard base={data.base} command={data.command} range={range} onRangeChange={changeRange} onRetry={retryAll} className="ceo-area-revenue" />
        <PayoutsCard source={data.command} onRetry={retryCommand} className="ceo-area-payouts" />
        <CapacityCard source={data.command} onRetry={retryCommand} className="ceo-area-capacity" />

        <GoalsCard goals={goals} loading={loadingCore} className="ceo-area-goals" />
        <SeasonCard todayYmd={todayYmd} className="ceo-area-season" />
        <PrioritiesCard priorities={priorities} loading={loadingCore} dataMissing={!base && !cmd} className="ceo-area-priorities" />
      </div>
    </div>
  );
}
