import { HUNTER_GROWTH_EXPERIMENTS } from '@/lib/owner/hunterExperiments';

export default function ExperimentosPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-10">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300">Crecer</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">Experimentos</h1>
        <p className="mt-1 text-sm text-white/50">Hipótesis activas. El éxito se lee del crecimiento, no de un clic.</p>
      </header>
      <ul className="space-y-3">
        {HUNTER_GROWTH_EXPERIMENTS.map((experiment) => (
          <li key={experiment.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/75">
            <p className="font-medium text-white">{experiment.hypothesis}</p>
            <p className="mt-2 text-white/50">
              Superficie: {experiment.surface}. Éxito: {experiment.success}. Límite: {experiment.guardrail}.
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
