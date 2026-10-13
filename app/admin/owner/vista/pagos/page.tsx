'use client';

import { CheckCircle2, CircleDashed, Lock, Wallet } from 'lucide-react';
import VistaShell from '../shell';
import { DateChip, Donut, Ghost, KpiCard, Panel, PeriodBar } from '../ui';
import { money, num, useVista } from '../live';
import {
  ECONOMIC_ACTIVATION_REQUIREMENTS,
  evaluateEconomicActivationGate,
  type EconomicActivationRequirementId,
} from '@/lib/economy/activation/economicActivationGate';
import { readEconomicState } from '@/lib/economy/economicState';

const REQUIREMENT_LABEL: Record<EconomicActivationRequirementId, string> = {
  commission_confirmation: 'Comisiones confirmadas por las tiendas',
  reward_rules: 'Reglas de recompensa aprobadas',
  fiscal_policy: 'Política fiscal confirmada',
  tax_documentation: 'Documentación fiscal de los cazadores',
  payment_identity: 'Identidad de quien recibe el pago',
  fraud_rules: 'Reglas contra fraude',
  reversal_behavior: 'Qué pasa si una compra se cancela',
  payout_provider: 'Proveedor de pagos en producción',
  reconciliation: 'Conciliación contra el banco',
  legal_terms: 'Términos legales',
  privacy: 'Aviso de privacidad',
  production_monitoring: 'Monitoreo en producción',
};

function countStatus(map: Record<string, number> | null | undefined, keys: string[]): number | null {
  if (!map) return null;
  return keys.reduce((acc, key) => acc + (map[key] ?? 0), 0);
}

export default function PagosVistaPage() {
  const { range, changeRange, base, cmd } = useVista();
  const payouts = cmd?.finance.payoutIntentsByStatus ?? null;
  const rewards = cmd?.finance.rewardsByStatus ?? null;
  const pending = countStatus(payouts, ['RESERVED']);
  const review = countStatus(payouts, ['SUBMITTED', 'UNKNOWN']);
  const ready = countStatus(payouts, ['SUCCEEDED']);
  const frozen = cmd?.finance.moneyPathFrozen ?? base?.systemHealth.moneyPathFrozen ?? null;
  const total = [pending, review, ready].every((n) => n != null) ? (pending ?? 0) + (review ?? 0) + (ready ?? 0) : null;
  const pct = (part: number | null) => (part != null && total ? Math.round((part / total) * 100) : 0);
  const gate = evaluateEconomicActivationGate();
  const economic = readEconomicState();
  const missing = new Set(gate.missing);
  return (
    <VistaShell
      title="Pagos pendientes"
      crumb="Pagos pendientes"
      subtitle="Conteos del flujo de pagos. Esta vista no mueve dinero."
      toolbar={<><DateChip /><PeriodBar value={range} onChange={changeRange} /><Ghost href="/admin/rewards">Abrir recompensas</Ghost></>}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard icon={Wallet} tint="bg-violet-500/20 text-violet-200" label="Pendientes" value={num(pending)} />
        <KpiCard icon={Wallet} tint="bg-amber-500/15 text-amber-200" label="En revisión" value={num(review)} />
        <KpiCard icon={Wallet} tint="bg-emerald-500/15 text-emerald-200" label="Listos" value={num(ready)} />
        <KpiCard icon={Wallet} tint="bg-sky-500/15 text-sky-200" label="Recompensas abiertas" value={num(countStatus(rewards, ['pending', 'review', 'approved']))} />
        <KpiCard icon={Wallet} tint="bg-indigo-500/15 text-indigo-200" label="Responsabilidad confirmada" value={money(base?.userLiabilityConfirmedCents)} />
        <KpiCard icon={Wallet} tint="bg-rose-500/15 text-rose-200" label="Flujo de dinero" value={frozen == null ? '—' : frozen ? 'Congelado' : 'Activo'} />
      </div>
      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-5" title="Pagos por estado">
          <div className="flex items-center gap-4">
            <Donut parts={[{ pct: pct(ready), color: '#34d399' }, { pct: pct(pending), color: '#fb7185' }, { pct: pct(review), color: '#fbbf24' }]}>
              <span className="text-[18px] font-semibold text-white">{num(total)}</span>
            </Donut>
            <ul className="space-y-1 text-[12px] text-white/70">
              <li>Listos · {num(ready)}</li>
              <li>Pendientes · {num(pending)}</li>
              <li>En revisión · {num(review)}</li>
            </ul>
          </div>
        </Panel>
        <Panel className="xl:col-span-7" title="Último lote" extra={<Ghost href="/equipo/contabilidad">Contabilidad</Ghost>}>
          {cmd?.finance.latestPayoutBatch ? (
            <ul className="space-y-2 text-[13px] text-white/75">
              <li>Período · {cmd.finance.latestPayoutBatch.periodKey ?? '—'}</li>
              <li>Estado · {cmd.finance.latestPayoutBatch.status ?? '—'}</li>
              <li>Creado · {cmd.finance.latestPayoutBatch.createdAt ?? '—'}</li>
              <li>Eventos de auditoría en el período · {num(cmd.finance.rewardAuditEventsInRange)}</li>
            </ul>
          ) : <p className="text-[12px] text-white/45">No hay un lote de pagos registrado.</p>}
        </Panel>
      </div>
      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-5" title="Estado económico" icon={Lock}>
          <ul className="space-y-2 text-[13px] text-white/75">
            <li className="flex justify-between">Pago real <b>{economic.payoutStatus === 'FROZEN' ? 'Congelado' : 'Permitido'}</b></li>
            <li className="flex justify-between">Política fiscal <b>{economic.fiscalPolicyStatus === 'UNCONFIRMED' ? 'Sin confirmar' : 'Activa'}</b></li>
            <li className="flex justify-between">Proveedor de pagos <b>{economic.providerStatus === 'SANDBOX' ? 'Pruebas (sandbox)' : 'Producción'}</b></li>
            <li className="flex justify-between">Infraestructura <b>{economic.infrastructureReady ? 'Lista' : 'Incompleta'}</b></li>
          </ul>
          <p className="mt-3 text-[11px] text-white/45">
            La comisión confirmada financia la recompensa. Los clics solos no cuentan. Congelado no es una falla: es una compuerta cerrada a propósito.
          </p>
        </Panel>
        <Panel
          className="xl:col-span-7"
          title={`Qué falta para poder pagar · ${ECONOMIC_ACTIVATION_REQUIREMENTS.length - missing.size} de ${ECONOMIC_ACTIVATION_REQUIREMENTS.length}`}
          extra={<Ghost href="/admin/commissions">Abrir comisiones</Ghost>}
        >
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {ECONOMIC_ACTIVATION_REQUIREMENTS.map((id) => {
              const done = !missing.has(id);
              const Icon = done ? CheckCircle2 : CircleDashed;
              return (
                <li key={id} className="flex items-center gap-2 text-[12px] text-white/70">
                  <Icon className={done ? 'h-3.5 w-3.5 shrink-0 text-emerald-300' : 'h-3.5 w-3.5 shrink-0 text-white/30'} aria-hidden />
                  {REQUIREMENT_LABEL[id]}
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </VistaShell>
  );
}
