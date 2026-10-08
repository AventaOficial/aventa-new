import Link from 'next/link';
import { readEconomicState } from '@/lib/economy/economicState';

export default function PayoutsPage() {
  const state = readEconomicState();
  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-10">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300">Dinero</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">Payouts</h1>
      </header>
      <section className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
        <p className="text-xs font-semibold uppercase tracking-[0.14em]">Payout congelado</p>
        <p className="mt-2">
          No hay SPEI, liquidación ni proveedor de producción. El modo visible es {state.providerStatus === 'SANDBOX' ? 'sandbox' : 'producción'} y la
          compuerta sigue cerrada.
        </p>
      </section>
      <p className="text-sm text-white/55">
        La contabilidad del equipo sigue en{' '}
        <Link href="/equipo/contabilidad" className="text-violet-300 hover:underline">
          Contabilidad
        </Link>
        . Registrar un pago real no está disponible desde aquí.
      </p>
    </div>
  );
}
