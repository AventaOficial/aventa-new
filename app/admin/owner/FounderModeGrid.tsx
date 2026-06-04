'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  CircleDollarSign,
  ClipboardList,
  Link2,
  MousePointerClick,
  Package,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { OwnerDashboardPayload, TrafficLight } from '@/lib/owner/buildOwnerDashboard';

function formatNum(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('es-MX');
}

function formatMoneyCents(cents: number | null): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(
    cents / 100
  );
}

function statusEmoji(status: TrafficLight): string {
  if (status === 'green') return '🟢';
  if (status === 'yellow') return '🟡';
  return '🔴';
}

type FounderCardProps = {
  title: string;
  icon: typeof Users;
  tone?: TrafficLight;
  children: React.ReactNode;
  href?: string;
  footer?: string;
};

function FounderCard({ title, icon: Icon, tone = 'green', children, href, footer }: FounderCardProps) {
  const inner = (
    <div
      className={`rounded-2xl border p-4 h-full flex flex-col transition-shadow hover:shadow-md ${
        tone === 'red'
          ? 'border-red-200/80 dark:border-red-900/50 bg-red-50/40 dark:bg-red-950/15'
          : tone === 'yellow'
            ? 'border-amber-200/80 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/15'
            : 'border-gray-200/70 dark:border-gray-800 bg-white dark:bg-[#1C1C1E]'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 dark:bg-violet-500/20">
            <Icon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 truncate">
            {title}
          </h3>
        </div>
        <span className="text-sm shrink-0">{statusEmoji(tone)}</span>
      </div>
      <div className="flex-1 text-sm text-gray-800 dark:text-gray-200 space-y-1">{children}</div>
      {footer ? <p className="mt-2 text-[11px] text-violet-600 dark:text-violet-400 font-medium">{footer}</p> : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded-2xl">
        {inner}
      </Link>
    );
  }
  return inner;
}

export default function FounderModeGrid({ data }: { data: OwnerDashboardPayload }) {
  const modTone: TrafficLight =
    (data.moderation.pending ?? 0) >= 20
      ? 'red'
      : (data.moderation.pending ?? 0) >= 10
        ? 'yellow'
        : 'green';

  const affTone: TrafficLight =
    data.affiliation.amazonTagConfigured && data.affiliation.mercadolibreTagConfigured
      ? 'green'
      : !data.affiliation.amazonTagConfigured && !data.affiliation.mercadolibreTagConfigured
        ? 'red'
        : 'yellow';

  const revTone: TrafficLight =
    data.economy.confidence === 'alta'
      ? 'green'
      : data.economy.confidence === 'media'
        ? 'yellow'
        : data.economy.epcCents != null
          ? 'yellow'
          : 'green';

  const healthTone: TrafficLight =
    data.offerHealth.outOfStock >= 3 || data.offerHealth.priceChanged >= 5
      ? 'yellow'
      : data.offerHealth.outOfStock > 0 || data.offerHealth.priceChanged > 0
        ? 'yellow'
        : 'green';

  const hasAlerts = data.alerts.length > 0;
  const alertTone: TrafficLight = data.alerts.some((a) => a.severity === 'red')
    ? 'red'
    : hasAlerts
      ? 'yellow'
      : 'green';

  return (
    <section
      className="rounded-3xl bg-gradient-to-br from-[#0f0f12] via-[#1a1528] to-[#0d0d10] text-white p-5 md:p-6 border border-violet-500/20 shadow-[0_12px_40px_rgba(88,28,135,0.2)]"
      aria-label="Founder Mode"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-300/90">Founder Mode</p>
          <p className="mt-1 text-lg font-semibold tracking-tight">{data.summary.headline}</p>
          <p className="mt-0.5 text-xs text-gray-400 max-w-lg">{data.summary.subline}</p>
        </div>
        <span className="text-2xl" title={data.summary.status}>
          {statusEmoji(data.summary.status)}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <FounderCard title="Estado general" icon={Package} tone={data.summary.status}>
          <p className="font-semibold text-white">{data.summary.headline}</p>
          {data.growth.weeklyPct != null ? (
            <p className="text-gray-400 text-xs">
              Registros 7d: {data.growth.weeklyPct >= 0 ? '+' : ''}
              {data.growth.weeklyPct}%
            </p>
          ) : null}
        </FounderCard>

        <FounderCard title="Usuarios" icon={Users} tone="green" href="/admin/users">
          <p>
            <span className="text-gray-400">Hoy </span>
            <span className="font-semibold text-white">+{formatNum(data.today.newUsers)}</span>
          </p>
          <p>
            <span className="text-gray-400">Activos </span>
            <span className="font-semibold">{formatNum(data.today.activeUsers)}</span>
          </p>
          {data.growth.retention48hPct != null ? (
            <p className="text-xs text-gray-400">Retención 48h: {data.growth.retention48hPct}%</p>
          ) : null}
        </FounderCard>

        <FounderCard title="Ofertas" icon={Package} tone="green">
          <p>
            <span className="text-gray-400">Creadas hoy </span>
            <span className="font-semibold text-white">{formatNum(data.today.offersCreated)}</span>
          </p>
          <p>
            <span className="text-gray-400">Aprobadas hoy </span>
            <span className="font-semibold">{formatNum(data.today.offersApproved)}</span>
          </p>
        </FounderCard>

        <FounderCard title="Moderación" icon={ClipboardList} tone={modTone} href="/admin/moderation" footer="Abrir cola →">
          <p>
            <span className="font-semibold text-white text-lg">{formatNum(data.moderation.pending)}</span>
            <span className="text-gray-400"> pendientes</span>
          </p>
          <p className="text-xs text-gray-400">
            Hoy: {formatNum(data.moderation.approvedToday)} apr. · {formatNum(data.moderation.rejectedToday)} rech.
          </p>
        </FounderCard>

        <FounderCard title="Clics" icon={MousePointerClick} tone="green" href="/admin/metrics" footer="Ver métricas →">
          <p>
            <span className="font-semibold text-white text-lg">{formatNum(data.week.outbound)}</span>
            <span className="text-gray-400 text-sm"> / 7d</span>
          </p>
          <p className="text-xs text-gray-400">CTR {data.week.ctr != null ? `${data.week.ctr}%` : '—'}</p>
        </FounderCard>

        <FounderCard title="Afiliación" icon={Link2} tone={affTone} href="/admin/operaciones">
          <p>
            <span className="font-semibold text-white">
              {data.affiliation.programsActive}/{data.affiliation.programsTotal}
            </span>
            <span className="text-gray-400"> programas</span>
          </p>
          <p className="text-xs text-gray-400">
            ML {data.affiliation.mercadolibreTagConfigured ? '✓' : '✗'} · Amazon{' '}
            {data.affiliation.amazonTagConfigured ? '✓' : '✗'}
          </p>
        </FounderCard>

        <FounderCard title="Ingresos" icon={CircleDollarSign} tone={revTone as TrafficLight} href="/admin/commissions" footer="Economía ↓">
          <p className="font-semibold text-white">
            {data.economy.month.estimatedCents != null
              ? formatMoneyCents(data.economy.month.estimatedCents)
              : 'Sin estimar'}
          </p>
          <p className="text-xs text-gray-400">
            Real {data.economy.ledgerAvailable ? formatMoneyCents(data.economy.month.realCents) : '—'} · conf.{' '}
            {data.economy.confidence}
          </p>
        </FounderCard>

        <FounderCard title="Calidad" icon={ShieldCheck} tone={healthTone} footer="Calidad ↓">
          <p className="text-xs text-gray-300 space-y-0.5">
            <span className="block">
              🟢 {formatNum(data.offerHealth.verifiedAvailable)} · 🟡 {formatNum(data.offerHealth.priceChanged)} · 🔴{' '}
              {formatNum(data.offerHealth.outOfStock)}
            </span>
          </p>
        </FounderCard>

        <FounderCard
          title="Alertas"
          icon={AlertTriangle}
          tone={alertTone}
          href={data.recommendedAction.href}
          footer={hasAlerts ? `${data.alerts.length} activa(s)` : 'Sin alertas'}
        >
          {hasAlerts ? (
            <ul className="space-y-1">
              {data.alerts.slice(0, 2).map((a) => (
                <li key={a.id} className="text-xs text-gray-300 line-clamp-2">
                  {a.title}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-400 text-xs">Todo en orden</p>
          )}
        </FounderCard>
      </div>
    </section>
  );
}
