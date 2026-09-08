'use client';

import Link from 'next/link';
import {
  Package,
  CheckCircle2,
  Clock,
  XCircle,
  Heart,
  MessageCircle,
  Eye,
} from 'lucide-react';

type HunterActivitySummaryProps = {
  published: number;
  approved: number;
  pending: number;
  rejected: number;
  positiveVotes: number;
  comments: number;
  views: number;
};

function StatCard({
  icon: Icon,
  iconClass,
  label,
  value,
  hint,
}: {
  icon: typeof Package;
  iconClass: string;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-[#121214] p-4 shadow-[0_0_0_1px_rgba(139,92,246,0.04)] transition-colors hover:border-violet-500/30">
      <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl ${iconClass}`}>
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <p className="text-2xl font-bold tabular-nums text-white">{value}</p>
      <p className="mt-0.5 text-sm font-medium text-zinc-200">{label}</p>
      <p className="mt-1 text-[11px] leading-snug text-zinc-500">{hint}</p>
    </div>
  );
}

/** Resumen de actividad del cazador — datos reales, shell premium. */
export default function HunterActivitySummary({
  published,
  approved,
  pending,
  rejected,
  positiveVotes,
  comments,
  views,
}: HunterActivitySummaryProps) {
  return (
    <section className="mb-8 space-y-4" aria-label="Actividad del cazador">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-white">Tu actividad como cazador</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Un resumen de tu contribución en AVENTA.
          </p>
        </div>
        <Link
          href="/me/estadisticas"
          className="text-xs font-medium text-violet-400 hover:text-violet-300 hover:underline"
        >
          Ver métricas completas
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={Package}
          iconClass="bg-violet-500/15 text-violet-400"
          label="Ofertas publicadas"
          value={published}
          hint="Todas tus aportaciones."
        />
        <StatCard
          icon={CheckCircle2}
          iconClass="bg-emerald-500/15 text-emerald-400"
          label="Aprobadas"
          value={approved}
          hint="Ofertas que valieron la pena."
        />
        <StatCard
          icon={Clock}
          iconClass="bg-amber-500/15 text-amber-400"
          label="En revisión"
          value={pending}
          hint="Pronto sabremos más."
        />
        <StatCard
          icon={XCircle}
          iconClass="bg-red-500/15 text-red-400"
          label="Rechazadas"
          value={rejected}
          hint="Sigue mejorando."
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard
          icon={Heart}
          iconClass="bg-rose-500/15 text-rose-400"
          label="Votos positivos"
          value={positiveVotes}
          hint="Apoyo de la comunidad."
        />
        <StatCard
          icon={MessageCircle}
          iconClass="bg-sky-500/15 text-sky-400"
          label="Comentarios"
          value={comments}
          hint="Aprobados en tus ofertas."
        />
        <StatCard
          icon={Eye}
          iconClass="bg-zinc-500/20 text-zinc-300"
          label="Vistas"
          value={views}
          hint="En el detalle de tus ofertas."
        />
      </div>
    </section>
  );
}
