'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Circle,
  Lock,
  MinusCircle,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import KpiCard from '@/app/components/panel/KpiCard';
import LoadingState from '@/app/components/panel/LoadingState';
import StatusBadge from '@/app/components/panel/StatusBadge';
import { cn } from '@/app/components/panel/utils';
import { centsToMx } from '@/lib/finance/hubConfig';
import type {
  AutomationLevel,
  BatchPayeeLine,
  ExceptionItem,
  PayoutOpsSnapshot,
  PipelineStage,
  RunbookStep,
  StageActor,
} from '@/lib/finance/payoutOps/types';

const LEVEL_LABEL: Record<AutomationLevel, string> = {
  auto: 'Automático',
  semi: 'Semi',
  manual: 'Manual',
  blocked: 'Bloqueado',
};

const LEVEL_TONE: Record<AutomationLevel, 'ok' | 'attention' | 'critical' | 'neutral'> = {
  auto: 'ok',
  semi: 'attention',
  manual: 'neutral',
  blocked: 'critical',
};

const ACTOR_LABEL: Record<StageActor, string> = {
  sistema: 'Sistema',
  finance: 'Contabilidad',
  owner: 'Owner',
  externo: 'Externo',
};

const DECISION_LABEL: Record<BatchPayeeLine['gate']['decision'], string> = {
  pass: 'Pagable',
  review: 'Revisar',
  fail: 'Bloqueado',
  carry: 'Acumula',
};

const DECISION_TONE: Record<BatchPayeeLine['gate']['decision'], 'ok' | 'attention' | 'critical' | 'neutral'> = {
  pass: 'ok',
  review: 'attention',
  fail: 'critical',
  carry: 'neutral',
};

const SEVERITY_TONE: Record<ExceptionItem['severity'], 'critical' | 'attention' | 'info'> = {
  critical: 'critical',
  attention: 'attention',
  info: 'info',
};

const card =
  'rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] p-4';

function ActorIcon({ actor }: { actor: StageActor }) {
  if (actor === 'sistema') return <Bot className="h-3.5 w-3.5" />;
  return <UserRound className="h-3.5 w-3.5" />;
}

function StepIcon({ status }: { status: RunbookStep['status'] }) {
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === 'blocked') return <Lock className="h-4 w-4 text-red-500" />;
  if (status === 'na') return <MinusCircle className="h-4 w-4 text-gray-400" />;
  return <Circle className="h-4 w-4 text-amber-500" />;
}

function ScoreRing({ pct, label }: { pct: number; label: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <div className="flex items-center gap-3">
      <svg width="68" height="68" viewBox="0 0 68 68" aria-hidden="true">
        <circle cx="34" cy="34" r={r} strokeWidth="6" className="stroke-gray-200 dark:stroke-white/10" fill="none" />
        <circle
          cx="34"
          cy="34"
          r={r}
          strokeWidth="6"
          strokeLinecap="round"
          className="stroke-amber-500"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={off}
          transform="rotate(-90 34 34)"
        />
        <text x="34" y="38" textAnchor="middle" className="fill-gray-900 dark:fill-gray-100 text-sm font-semibold">
          {pct}%
        </text>
      </svg>
      <p className="text-xs text-gray-600 dark:text-gray-400 max-w-36 leading-snug">{label}</p>
    </div>
  );
}

function StageCard({ stage }: { stage: PipelineStage }) {
  return (
    <div className={cn(card, 'flex flex-col gap-3 min-w-0')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-600/80 dark:text-amber-400/80">
            {stage.title}
          </p>
          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug">{stage.question}</p>
        </div>
        <StatusBadge tone={LEVEL_TONE[stage.automation]} className="shrink-0">
          {LEVEL_LABEL[stage.automation]}
        </StatusBadge>
      </div>

      <dl className="space-y-1.5">
        {stage.metrics.map((m) => (
          <div key={m.label} className="flex justify-between gap-2 text-xs">
            <dt className="text-gray-500 dark:text-gray-400 truncate" title={m.hint ?? undefined}>
              {m.label}
            </dt>
            <dd className="font-medium tabular-nums text-gray-900 dark:text-gray-100 shrink-0">{m.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto space-y-1.5 border-t border-gray-100 dark:border-white/6 pt-2.5">
        <p className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
          <ActorIcon actor={stage.actor} />
          {ACTOR_LABEL[stage.actor]}
          <span className="text-gray-300 dark:text-gray-600">·</span>
          {stage.live ? 'corriendo' : 'solo código'}
        </p>
        <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-snug">{stage.automationReason}</p>
        <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
          <span className="font-semibold">Siguiente:</span> {stage.nextUnlock}
        </p>
      </div>
    </div>
  );
}

export default function PayoutOpsPanel() {
  const { session } = useAuth();
  const [data, setData] = useState<PayoutOpsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = {};
    if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`;
    return h;
  }, [session?.access_token]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const res = await fetch('/api/staff/finance/payout-ops', { headers: headers(), cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Error al cargar');
        return;
      }
      setData(body as PayoutOpsSnapshot);
    } catch {
      setError('Error de red');
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    if (session?.access_token) void load();
    else setLoading(false);
  }, [session?.access_token, load]);

  const criticalCount = useMemo(
    () => data?.exceptions.filter((e) => e.severity === 'critical').length ?? 0,
    [data],
  );

  if (loading) return <LoadingState message="Cargando Centro de Pagos…" variant="light" />;

  if (forbidden) {
    return (
      <div className={cn(card, 'flex items-start gap-3')}>
        <Lock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Acceso restringido</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            El Centro de Pagos es solo para el fundador (owner) y Contabilidad (finance). El resto de la
            contabilidad sigue disponible en las otras pestañas.
          </p>
        </div>
      </div>
    );
  }

  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!data) return null;

  const { runtime, batch, score } = data;
  const frozenTone = runtime.moneyPathFrozen ? 'ok' : runtime.productionRuntime ? 'critical' : 'attention';

  return (
    <div className="space-y-6">
      {/* Estado del money path */}
      <section className={cn(card, 'space-y-4')}>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-600" />
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Estado del dinero</h2>
              <StatusBadge tone={frozenTone}>
                {runtime.moneyPathFrozen ? 'Money path congelado (seguro)' : 'Money path abierto'}
              </StatusBadge>
              <StatusBadge tone={runtime.rewardsProgramActive ? 'attention' : 'neutral'}>
                Recompensas {runtime.rewardsProgramActive ? 'ON' : 'OFF'}
              </StatusBadge>
              <StatusBadge tone={runtime.settlementBridgeEnabled ? 'attention' : 'neutral'}>
                Settlement {runtime.settlementBridgeEnabled ? 'ON' : 'OFF'}
              </StatusBadge>
              <StatusBadge tone={runtime.payoutProvider.mode === 'real' ? 'ok' : 'neutral'}>
                Proveedor: {runtime.payoutProvider.configured ?? 'ninguno'}
              </StatusBadge>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 max-w-2xl">
              {runtime.payoutProvider.detail} Veredicto de activación:{' '}
              <span className="font-medium">{runtime.activationVerdict}</span>
              {runtime.remainingBlockers.length > 0 ? ` · bloqueos: ${runtime.remainingBlockers.join(', ')}` : ''}.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              Política: {data.config.creatorShareBps / 100} % creador · mínimo {centsToMx(data.config.minPayoutCents)} ·
              hold {data.config.holdDays} días · términos v{data.config.termsVersion}. Este centro no mueve dinero.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Actualizar
          </button>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-center">
          <ScoreRing pct={score.internalPct} label="Automatización interna (cajas 1–4)" />
          <ScoreRing pct={score.endToEndPct} label="Automatización de punta a punta (6 cajas)" />
          <div className="sm:col-span-2 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">Qué desbloquea el siguiente %</p>
            <ul className="space-y-1">
              {score.explanation.map((e) => (
                <li key={e} className="flex items-start gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                  <ArrowRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* KPIs del lote */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Pagable ahora" value={centsToMx(batch.totals.payableCents)} deltaLabel={`${batch.totals.payableCount} creador(es)`} variant="light" />
        <KpiCard label="En revisión" value={centsToMx(batch.totals.reviewCents)} deltaLabel={`${batch.totals.reviewCount} creador(es)`} variant="light" />
        <KpiCard label="Bloqueado (datos)" value={centsToMx(batch.totals.blockedCents)} deltaLabel={`${batch.totals.blockedCount} creador(es)`} variant="light" />
        <KpiCard label="Acumula (bajo mínimo)" value={centsToMx(batch.totals.carryCents)} deltaLabel={`${batch.totals.carryCount} creador(es)`} variant="light" />
        <KpiCard label="En vuelo" value={centsToMx(batch.totals.inFlightCents)} deltaLabel={`${batch.totals.inFlightCount} recompensa(s)`} variant="light" />
      </div>

      {/* Las 6 cajas */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Cómo se paga: las 6 cajas</h2>
          <p className="text-xs text-gray-500">Nivel calculado desde flags + datos, no declarado.</p>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {data.stages.map((s) => (
            <StageCard key={s.id} stage={s} />
          ))}
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Runbook */}
        <section className={card}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Runbook del periodo {batch.periodLabel}
            </h2>
            <span className="text-xs text-gray-500">
              {data.runbook.filter((s) => s.status === 'done').length}/{data.runbook.filter((s) => s.status !== 'na').length} listos
            </span>
          </div>
          <ol className="space-y-2.5">
            {data.runbook.map((step) => (
              <li key={step.id} className="flex gap-3">
                <div className="mt-0.5 shrink-0">
                  <StepIcon status={step.status} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {step.order}. {step.title}
                    </p>
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-gray-500">
                      <ActorIcon actor={step.actor} />
                      {ACTOR_LABEL[step.actor]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{step.description}</p>
                  <p
                    className={cn(
                      'mt-0.5 text-xs',
                      step.status === 'blocked'
                        ? 'text-red-600 dark:text-red-400'
                        : step.status === 'done'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-gray-700 dark:text-gray-300',
                    )}
                  >
                    {step.detail}
                    {step.href ? (
                      <>
                        {' '}
                        <Link href={step.href} className="text-amber-600 hover:underline">
                          Ir
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Excepciones */}
        <section className={card}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Cola de excepciones
              {criticalCount > 0 ? (
                <span className="ml-2 inline-flex items-center gap-1 text-xs text-red-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {criticalCount} crítica(s)
                </span>
              ) : null}
            </h2>
            <span className="text-xs text-gray-500">{data.exceptions.length} en cola</span>
          </div>
          {data.exceptions.length === 0 ? (
            <p className="text-sm text-gray-500">Sin excepciones. El 1–5 % que necesita humano está limpio.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.exceptions.map((ex) => (
                <li key={ex.id} className="py-2.5 flex gap-3">
                  <StatusBadge tone={SEVERITY_TONE[ex.severity]} className="shrink-0 mt-0.5 h-fit">
                    {ex.severity === 'critical' ? 'Crítico' : ex.severity === 'attention' ? 'Atender' : 'Info'}
                  </StatusBadge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{ex.title}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">{ex.detail}</p>
                    <p className="mt-0.5 text-[11px] text-gray-500 flex items-center gap-1">
                      <ActorIcon actor={ex.owner} />
                      {ACTOR_LABEL[ex.owner]}
                      {ex.href ? (
                        <>
                          <span className="text-gray-300 dark:text-gray-600">·</span>
                          <Link href={ex.href} className="text-amber-600 hover:underline">
                            Abrir
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Lote */}
      <section className={card}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Lote {batch.periodLabel} — quién cobraría y por qué
          </h2>
          <div className="flex items-center gap-2">
            <StatusBadge tone={batch.readyToRelease ? 'ok' : 'neutral'}>
              {batch.readyToRelease ? 'Listo para decisión humana' : 'No liberable'}
            </StatusBadge>
          </div>
        </div>
        {batch.releaseBlockers.length > 0 ? (
          <p className="mb-3 text-xs text-gray-600 dark:text-gray-400">
            Bloqueado por: {batch.releaseBlockers.join(', ')}. La liberación siempre es una decisión humana; este
            centro solo la prepara.
          </p>
        ) : null}
        {batch.lines.length === 0 ? (
          <p className="text-sm text-gray-500">
            Sin saldos disponibles. Cuando haya recompensas en AVAILABLE aparecerán aquí agrupadas por creador.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3 font-semibold">Creador</th>
                  <th className="py-2 pr-3 font-semibold text-right">Monto</th>
                  <th className="py-2 pr-3 font-semibold text-right">Recompensas</th>
                  <th className="py-2 pr-3 font-semibold">Decisión</th>
                  <th className="py-2 font-semibold">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {batch.lines.map((line) => (
                  <tr key={line.creatorId}>
                    <td className="py-2 pr-3 text-gray-900 dark:text-gray-100">
                      {line.displayName ?? line.creatorId.slice(0, 8)}
                    </td>
                    <td className="py-2 pr-3 text-right font-medium tabular-nums">{centsToMx(line.amountCents)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-gray-600 dark:text-gray-400">{line.rewardCount}</td>
                    <td className="py-2 pr-3">
                      <StatusBadge tone={DECISION_TONE[line.gate.decision]}>{DECISION_LABEL[line.gate.decision]}</StatusBadge>
                    </td>
                    <td className="py-2 text-xs text-gray-600 dark:text-gray-400">
                      {line.gate.reasons.length > 0 ? line.gate.reasons.join(' ') : 'Todos los gates en orden.'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-gray-500 text-center">
        Fuentes: ledger canónico, creator_rewards, payout_intents, reward_payouts, clawbacks, perfiles fiscales.
        Tablas ausentes: {Object.entries(data.tables).filter(([, ok]) => !ok).map(([t]) => t).join(', ') || 'ninguna'}.
      </p>
    </div>
  );
}
