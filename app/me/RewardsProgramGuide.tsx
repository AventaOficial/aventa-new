'use client';

import { useEffect, useRef } from 'react';
import { Check, ShieldAlert, X } from 'lucide-react';
import {
  MEMBER_STATUS_COPY,
  PROGRAM_STATUS_COPY,
  buildRewardsOnboarding,
  type ProgressionLayer,
  type RewardsMemberStatus,
  type RewardsProgramStatus,
} from '@/lib/rewards/onboarding';

const SEEN_KEY = 'aventa-rewards-guide-seen';

const LAYER_STATUS_LABEL: Record<ProgressionLayer['status'], string> = {
  active: 'Activo',
  paused: 'En pausa',
  frozen: 'Congelado',
};

function LayerCard({ layer }: { layer: ProgressionLayer }) {
  const off = layer.status !== 'active';
  return (
    <div
      data-progression-layer={layer.id}
      className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-zinc-800/80 dark:bg-[#0e0e10]"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
          {layer.label}
        </p>
        <span
          className={
            off
              ? 'rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400'
              : 'rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400'
          }
        >
          {LAYER_STATUS_LABEL[layer.status]}
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{layer.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-zinc-400">{layer.summary}</p>
      <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-gray-600 dark:text-zinc-400">
        {layer.points.map((point) => (
          <li key={point} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-400" aria-hidden />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ListBlock({ title, items, tone }: { title: string; items: string[]; tone: 'yes' | 'no' | 'plain' }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-500">{title}</p>
      <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-gray-700 dark:text-zinc-300">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            {tone === 'yes' ? (
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
            ) : tone === 'no' ? (
              <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
            ) : (
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-400" aria-hidden />
            )}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function RewardsProgramGuide({
  programStatus,
  memberStatus,
  defaultOpen = false,
}: {
  programStatus: RewardsProgramStatus;
  memberStatus: RewardsMemberStatus;
  defaultOpen?: boolean;
}) {
  const guide = buildRewardsOnboarding(programStatus);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const program = PROGRAM_STATUS_COPY[programStatus];
  const member = MEMBER_STATUS_COPY[memberStatus];
  const nonMoney = guide.layers.filter((l) => !l.money);
  const money = guide.layers.filter((l) => l.money);

  useEffect(() => {
    const node = detailsRef.current;
    if (!node) return;
    try {
      if (!localStorage.getItem(SEEN_KEY)) node.open = true;
    } catch {
      /* almacenamiento bloqueado: se queda como venga */
    }
  }, []);

  const markSeen = () => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* sin almacenamiento no se recuerda; no es crítico */
    }
  };

  return (
    <details
      ref={detailsRef}
      open={defaultOpen}
      onToggle={markSeen}
      data-rewards-program-status={programStatus}
      data-rewards-member-status={memberStatus}
      className="group mt-6 rounded-2xl border border-gray-200 bg-gray-50/60 dark:border-zinc-800/80 dark:bg-[#0b0b0d]"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-gray-900 marker:hidden dark:text-white">
        Cómo funciona el programa
        <span className="text-xs font-medium text-violet-600 group-open:hidden dark:text-violet-400">Ver guía</span>
        <span className="hidden text-xs font-medium text-violet-600 group-open:inline dark:text-violet-400">Ocultar</span>
      </summary>

      <div className="space-y-6 border-t border-gray-200 px-4 pb-5 pt-4 dark:border-zinc-800/80">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-[#0e0e10]">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-zinc-500">Estado del programa</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{program.label}</p>
            <p className="text-[11px] leading-relaxed text-gray-600 dark:text-zinc-400">{program.description}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-[#0e0e10]">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-zinc-500">Tu estado</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{member.label}</p>
            <p className="text-[11px] leading-relaxed text-gray-600 dark:text-zinc-400">{member.description}</p>
          </div>
        </div>

        <ol className="grid gap-2 sm:grid-cols-4">
          {guide.journey.map((step, i) => (
            <li key={step.verb} className="rounded-xl bg-violet-500/[0.06] px-3 py-2.5 dark:bg-violet-500/[0.08]">
              <p className="text-xs font-bold text-violet-700 dark:text-violet-300">
                {i + 1}. {step.verb}
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-gray-600 dark:text-zinc-400">{step.description}</p>
            </li>
          ))}
        </ol>

        <section aria-label="Progresión que no es dinero">
          <p className="mb-2 text-xs font-semibold text-gray-900 dark:text-white">Lo que nunca es dinero</p>
          <div className="grid gap-3 md:grid-cols-2">
            {nonMoney.map((layer) => (
              <LayerCard key={layer.id} layer={layer} />
            ))}
          </div>
        </section>

        <section aria-label="Ruta de una recompensa">
          <p className="mb-2 text-xs font-semibold text-gray-900 dark:text-white">El camino de una recompensa</p>
          <div className="grid gap-3 md:grid-cols-3">
            {money.map((layer) => (
              <LayerCard key={layer.id} layer={layer} />
            ))}
          </div>
        </section>

        <div className="grid gap-5 sm:grid-cols-2">
          <ListBlock title="Cuenta para desbloquear" items={guide.counts} tone="yes" />
          <ListBlock title="No cuenta" items={guide.doesNotCount} tone="no" />
          <ListBlock title="Por qué una recompensa queda pendiente" items={guide.pending} tone="plain" />
          <ListBlock title="Para cobrar" items={guide.withdrawal} tone="plain" />
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs leading-relaxed text-gray-700 dark:text-zinc-300">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <div className="space-y-1">
            {[...guide.abuse, ...guide.guarantees].map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        </div>

        <p className="text-xs leading-relaxed text-gray-600 dark:text-zinc-400">
          <span className="font-semibold text-gray-900 dark:text-white">¿Cuándo recibo algo? </span>
          {guide.whenReceive}
        </p>
      </div>
    </details>
  );
}
