'use client';

import { CheckCircle2, CircleDashed, Lock, Wallet } from 'lucide-react';
import { presentEconomicMoney } from '@/lib/economy/readModel/presentEconomicMoney';
import {
  ECONOMIC_ACTIVATION_REQUIREMENTS,
  evaluateEconomicActivationGate,
  type EconomicActivationRequirementId,
} from '@/lib/economy/activation/economicActivationGate';
import { readEconomicState } from '@/lib/economy/economicState';
import {
  ACTIVATION_SOURCE,
  INTENT_COUNT_SOURCE,
  LIABILITY_SOURCE,
  REWARD_COUNT_SOURCE,
  moneyFlowReading,
  openPayoutIntents,
  payoutIntentCounts,
  rewardObligationCounts,
} from '@/lib/owner/executiveFinance';
import VistaShell from '../shell';
import { DateChip, Ghost, KpiCard, Panel } from '../ui';
import { money, num, useVista } from '../live';

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

export default function PagosVistaPage() {
  const { base, cmd } = useVista();
  const rewards = rewardObligationCounts(cmd?.finance.rewardsByStatus);
  const intents = payoutIntentCounts(cmd?.finance.payoutIntentsByStatus);
  const open = openPayoutIntents(cmd?.finance.payoutIntentsByStatus);
  const incidents =
    intents.failed != null && intents.unknown != null ? intents.failed + intents.unknown : null;
  const frozen = cmd?.finance.moneyPathFrozen ?? base?.systemHealth.moneyPathFrozen ?? null;
  const month = base?.economicMonth ?? null;
  const gate = cmd?.finance.economicGate ?? evaluateEconomicActivationGate();
  const economic = readEconomicState();
  const missing = new Set(gate.missing);
  const flow = moneyFlowReading({
    moneyPathFrozen: frozen,
    payout: gate.payout,
    rewardsProgramActive: month?.rewardsProgramActive ?? null,
  });

  return (
    <VistaShell
      title="Pagos"
      crumb="Pagos"
      subtitle="Lo que Aventa debe a sus cazadores. La obligación, el pago iniciado y el pago confirmado no son la misma cifra."
      toolbar={
        <>
          <DateChip />
          <Ghost href="/admin/rewards">Operar una recompensa</Ghost>
        </>
      }
    >
      <p className="text-[12px] leading-relaxed text-white/50">
        Los conteos de abajo son históricos: no usan el período del mosaico. {REWARD_COUNT_SOURCE}
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard icon={Wallet} tint="bg-amber-500/15 text-amber-200" label="Por aprobar" value={num(rewards.pendingApproval)} sub="Estado PENDING" title={REWARD_COUNT_SOURCE} />
        <KpiCard icon={Wallet} tint="bg-violet-500/15 text-violet-200" label="En validación" value={num(rewards.validating)} sub="Estado VALIDATING" title={REWARD_COUNT_SOURCE} />
        <KpiCard icon={Wallet} tint="bg-sky-500/15 text-sky-200" label="Aprobadas por pagar" value={num(rewards.approvedToPay)} sub="Estado AVAILABLE" title="AVAILABLE es una obligación lista. Todavía no es un pago iniciado." />
        <KpiCard icon={Wallet} tint="bg-white/10 text-white/70" label="Marcadas PAID" value={num(rewards.markedPaid)} sub="Estado de la recompensa" title="PAID no demuestra un payout_intent resuelto ni un cobro bancario." />
        <KpiCard icon={Wallet} tint="bg-rose-500/15 text-rose-200" label="Pagos abiertos" value={num(open)} sub="Reservados, enviados o desconocidos" title={INTENT_COUNT_SOURCE} />
        <KpiCard icon={Wallet} tint="bg-rose-500/20 text-rose-200" label="Con incidencia" value={num(incidents)} sub="FAILED o UNKNOWN" title="UNKNOWN no es éxito y no debe leerse como PAID." />
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="Obligación de recompensas">
          <p className="mb-3 text-[12px] leading-relaxed text-white/55">{REWARD_COUNT_SOURCE}</p>
          <ul className="space-y-2 text-[13px] text-white/75">
            <li className="flex justify-between gap-3"><span>Pendientes de aprobación</span><b>{num(rewards.pendingApproval)}</b></li>
            <li className="flex justify-between gap-3"><span>En validación</span><b>{num(rewards.validating)}</b></li>
            <li className="flex justify-between gap-3"><span>Aprobadas por pagar</span><b>{num(rewards.approvedToPay)}</b></li>
            <li className="flex justify-between gap-3"><span>Marcadas PAID</span><b>{num(rewards.markedPaid)}</b></li>
            <li className="flex justify-between gap-3"><span>Canceladas o revertidas</span><b>{num(rewards.cancelled)}</b></li>
          </ul>
          <p className="mt-3 text-[12px] leading-relaxed text-white/50">
            Si aquí hay filas PAID y «Pagos abiertos» está en cero, no hay un intent en curso. El programa de recompensas lista el estado histórico de la fila. Esta vista no lo convierte en un pago completado.
          </p>
        </Panel>
        <Panel className="xl:col-span-5" title="Pago iniciado">
          <p className="mb-3 text-[12px] leading-relaxed text-white/55">{INTENT_COUNT_SOURCE}</p>
          <ul className="space-y-2 text-[13px] text-white/75">
            <li className="flex justify-between gap-3"><span>Reservados, aún no enviados</span><b>{num(intents.reserved)}</b></li>
            <li className="flex justify-between gap-3"><span>Enviados al proveedor</span><b>{num(intents.submitted)}</b></li>
            <li className="flex justify-between gap-3"><span>Resultado desconocido</span><b>{num(intents.unknown)}</b></li>
            <li className="flex justify-between gap-3"><span>Fallidos</span><b>{num(intents.failed)}</b></li>
            <li className="flex justify-between gap-3"><span>Resueltos por el proveedor</span><b>{num(intents.providerResolved)}</b></li>
            <li className="flex justify-between gap-3"><span>Cancelados</span><b>{num(intents.cancelled)}</b></li>
          </ul>
          <p className="mt-3 text-[12px] leading-relaxed text-white/50">
            Un intent resuelto por el proveedor no es dinero confirmado en el banco.
          </p>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-5" title="Responsabilidad registrada">
          <p className="text-[22px] font-semibold tabular-nums text-white">{money(base?.userLiabilityConfirmedCents)}</p>
          <p className="mt-2 text-[12px] leading-relaxed text-white/60">{LIABILITY_SOURCE}</p>
          <p className="mt-3 text-[12px] text-white/50">
            Lectura del mes {month?.periodLabel ?? 'canónico'}, solo recompensas atadas a una comisión reconocida:
          </p>
          <ul className="mt-2 space-y-1.5 text-[12px] text-white/75">
            <li className="flex justify-between gap-3"><span>En validación</span><b>{month ? presentEconomicMoney(month.creatorValidating) : 'Sin datos'}</b></li>
            <li className="flex justify-between gap-3"><span>Disponible por pagar</span><b>{month ? presentEconomicMoney(month.creatorAvailable) : 'Sin datos'}</b></li>
            <li className="flex justify-between gap-3"><span>Marcado pagado en el mes</span><b>{month ? presentEconomicMoney(month.creatorPaid) : 'Sin datos'}</b></li>
          </ul>
          <p className="mt-2 text-[11px] text-white/40">
            Esa lectura del mes no se suma con el histórico de arriba. Si el mes dice «Sin registro» y el programa muestra PAID, esas filas están fuera del settlement de este mes o no pasaron el filtro de producción.
          </p>
        </Panel>
        <Panel className="xl:col-span-7" title="Flujo de dinero" icon={Lock}>
          <p className="text-[18px] font-semibold text-white">
            {flow.blocked == null ? 'Sin datos' : flow.blocked ? 'Bloqueado' : 'Sin bloqueo en esta lectura'}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-white/65">{flow.summary}</p>
          {flow.operations.length > 0 ? (
            <ul className="mt-3 space-y-1.5 text-[12px] text-white/75">
              {flow.operations.map((operation) => <li key={operation}>Bloqueado: {operation}</li>)}
            </ul>
          ) : null}
          <ul className="mt-3 space-y-1.5 text-[12px] text-white/60">
            <li>Pago real: {economic.payoutStatus === 'FROZEN' ? 'congelado por la política vigente' : 'permitido por la política vigente'}.</li>
            <li>Política fiscal: {economic.fiscalPolicyStatus === 'UNCONFIRMED' ? 'sin confirmar' : 'activa'}.</li>
            <li>Proveedor: {economic.providerStatus === 'SANDBOX' ? 'pruebas, no producción' : 'producción'}.</li>
            <li>{month?.monetizationLabel ?? 'Sin lectura de monetización del mes.'}</li>
          </ul>
          {cmd?.finance.latestPayoutBatch ? (
            <p className="mt-3 text-[12px] text-white/55">
              Último lote: {cmd.finance.latestPayoutBatch.periodKey ?? 'sin período'} · {cmd.finance.latestPayoutBatch.status ?? 'sin estado'}.
              Auditoría en {cmd.range.label}: {num(cmd.finance.rewardAuditEventsInRange)} eventos.
            </p>
          ) : (
            <p className="mt-3 text-[12px] text-white/45">No hay un lote de pagos registrado.</p>
          )}
        </Panel>
      </div>

      <Panel
        title={`Requisitos para poder pagar · ${ECONOMIC_ACTIVATION_REQUIREMENTS.length - missing.size} de ${ECONOMIC_ACTIVATION_REQUIREMENTS.length}`}
        icon={Lock}
      >
        <p className="mb-3 text-[12px] leading-relaxed text-white/55">{ACTIVATION_SOURCE}</p>
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
        <p className="mt-3 text-[11px] text-white/40">
          Un requisito marcado no enciende pagos por sí solo. La operación de una recompensa sigue en su pantalla; esta vista no la ejecuta.
        </p>
        <div className="mt-3">
          <Ghost href="/equipo/contabilidad">Operar contabilidad del equipo</Ghost>
        </div>
      </Panel>
    </VistaShell>
  );
}
