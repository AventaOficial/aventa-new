'use client';

import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import { evaluateEconomicActivationGate } from '@/lib/economy/activation/economicActivationGate';
import { CURRENT_FISCAL_POLICY } from '@/lib/economy/fiscal/fiscalPolicy';
import Link from 'next/link';

function cell(label: string, value: string, href: string, hint: string) {
  return { label, value, href, hint };
}

export default function CeoPulse({
  command,
  systemLabel,
}: {
  command: OwnerCommandPayload | null;
  systemLabel: string;
}) {
  const gate = evaluateEconomicActivationGate();
  const supply = command?.supply;
  const pending = supply?.pendingNow;
  const users = command?.users.activeUsers;
  const growth = command?.users.newUsers.value;
  const cells = [
    cell('Usuarios', users == null ? '—' : users.toLocaleString('es-MX'), '/admin/users', 'Activos en el período'),
    cell('Supply', pending == null ? '—' : `${pending.toLocaleString('es-MX')} pendientes`, '/admin/supply', supply?.health.level === 'CRITICAL' ? 'Salud crítica' : supply?.health.level === 'WARNING' ? 'En aviso' : supply ? 'Estable' : 'Sin lectura'),
    cell('Growth', growth == null ? '—' : `${growth.toLocaleString('es-MX')} nuevos`, '/admin/owner/crecimiento', 'Usuarios nuevos del período'),
    cell('Dinero', gate.payout === 'ALLOWED' ? 'Pago permitido' : 'Pago congelado', '/admin/owner/economia', CURRENT_FISCAL_POLICY.status === 'UNCONFIRMED' ? 'Fiscal sin confirmar' : 'Fiscal activa'),
    cell('Sistema', systemLabel, '/admin/health', 'Salud que ya calcula el centro'),
  ];

  return (
    <section aria-label="Estado de hoy" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {cells.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 hover:border-violet-400/30"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">{item.label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">{item.value}</p>
          <p className="mt-1 truncate text-[11px] text-white/45">{item.hint}</p>
        </Link>
      ))}
    </section>
  );
}
