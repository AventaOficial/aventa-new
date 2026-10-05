import { Check, ShieldAlert, X } from 'lucide-react';
import { buildRewardsOnboarding, type ProgressionLayer } from '@/lib/rewards/onboarding';

function LayerCard({ layer }: { layer: ProgressionLayer }) {
  const closed = layer.status === 'closed';
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
            closed
              ? 'rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400'
              : 'rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400'
          }
        >
          {closed ? 'Cerrado' : 'Activo'}
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

export default function RewardsProgramGuide({
  programActive,
  defaultOpen = false,
}: {
  programActive: boolean;
  defaultOpen?: boolean;
}) {
  const guide = buildRewardsOnboarding(programActive);

  return (
    <details
      open={defaultOpen}
      className="group mt-6 rounded-2xl border border-gray-200 bg-gray-50/60 dark:border-zinc-800/80 dark:bg-[#0b0b0d]"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-gray-900 marker:hidden dark:text-white">
        Cómo funciona el programa
        <span className="text-xs font-medium text-violet-600 group-open:hidden dark:text-violet-400">Ver guía</span>
        <span className="hidden text-xs font-medium text-violet-600 group-open:inline dark:text-violet-400">Ocultar</span>
      </summary>

      <div className="space-y-5 border-t border-gray-200 px-4 pb-5 pt-4 dark:border-zinc-800/80">
        <div className="grid gap-3 md:grid-cols-3">
          {guide.layers.map((layer) => (
            <LayerCard key={layer.id} layer={layer} />
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-500">Cuenta</p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-gray-700 dark:text-zinc-300">
              {guide.counts.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-500">No cuenta</p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-gray-700 dark:text-zinc-300">
              {guide.doesNotCount.map((item) => (
                <li key={item} className="flex gap-2">
                  <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-500">Estados</p>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            {guide.states.map((state) => (
              <div key={state.label} className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-[#0e0e10]">
                <dt className="text-xs font-semibold text-gray-900 dark:text-white">{state.label}</dt>
                <dd className="text-[11px] leading-relaxed text-gray-600 dark:text-zinc-400">{state.description}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs leading-relaxed text-gray-700 dark:text-zinc-300">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <div className="space-y-1">
            {guide.abuse.map((item) => (
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
