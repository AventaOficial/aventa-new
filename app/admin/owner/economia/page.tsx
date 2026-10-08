import Link from 'next/link';
import { evaluateEconomicActivationGate } from '@/lib/economy/activation/economicActivationGate';
import { readEconomicState } from '@/lib/economy/economicState';

export default function EconomiaPage() {
  const gate = evaluateEconomicActivationGate();
  const state = readEconomicState();
  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-10">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300">Dinero</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">Economía</h1>
        <p className="mt-2 text-sm text-white/60">Comisión confirmada financia recompensa. Clics solos no cuentan. El pago real sigue cerrado.</p>
      </header>
      <div className="grid gap-2 sm:grid-cols-2">
        <Status title="Payout" value={state.payoutStatus === 'FROZEN' ? 'Congelado' : 'Permitido'} />
        <Status title="Política fiscal" value={state.fiscalPolicyStatus === 'UNCONFIRMED' ? 'Sin confirmar' : 'Activa'} />
        <Status title="Proveedor" value={state.providerStatus === 'SANDBOX' ? 'Sandbox' : 'Producción'} />
        <Status title="Infraestructura" value={state.infrastructureReady ? 'Lista' : 'Incompleta'} />
      </div>
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
        <p>Cadena: economía, comisiones, rewards, contabilidad, payouts.</p>
        <p className="mt-2">Requisitos abiertos de la compuerta: {gate.missing.length}.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link className="text-violet-300 hover:underline" href="/admin/commissions">Comisiones</Link>
          <Link className="text-violet-300 hover:underline" href="/admin/rewards">Rewards</Link>
          <Link className="text-violet-300 hover:underline" href="/equipo/contabilidad">Contabilidad</Link>
          <Link className="text-violet-300 hover:underline" href="/admin/owner/payouts">Payouts</Link>
        </div>
      </section>
    </div>
  );
}

function Status({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">{title}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
