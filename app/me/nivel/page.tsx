'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MeSectionPage, { meCardClass } from '@/app/me/dashboard/MeSectionPage';
import { createClient } from '@/lib/supabase/client';
import { REPUTATION_LEVELS, getReputationLabel, getReputationProgress } from '@/lib/reputation';

const ADVANCE = [
  { title: 'Oferta aprobada', detail: '+10 puntos' },
  { title: 'Oferta rechazada', detail: '−15 puntos' },
  { title: 'Comentario aprobado', detail: '+2 puntos' },
  { title: 'Comentario rechazado', detail: '−5 puntos' },
  { title: 'Like en tu comentario', detail: '+1 punto' },
] as const;

export default function NivelPage() {
  const router = useRouter();
  const [level, setLevel] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace('/');
        return;
      }
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('reputation_level, reputation_score')
        .eq('id', auth.user.id)
        .maybeSingle();
      if (!active) return;
      if (profileError || !data) {
        setError(true);
        return;
      }
      setLevel((data as { reputation_level?: number }).reputation_level ?? 1);
      setScore((data as { reputation_score?: number }).reputation_score ?? 0);
    })();
    return () => {
      active = false;
    };
  }, [router]);

  const current = level == null ? null : REPUTATION_LEVELS.find((item) => item.level === level) ?? REPUTATION_LEVELS[0];
  const next = level == null ? null : REPUTATION_LEVELS.find((item) => item.level === level + 1) ?? null;
  const progress = level == null ? 0 : Math.round(getReputationProgress(score, level) * 100);
  const remaining = next ? Math.max(0, next.minScore - score) : 0;

  return (
    <MeSectionPage
      title="Nivel Aventa"
      lede="No es el programa de recompensas. Este nivel es tu progreso dentro de la comunidad."
    >
      {error ? <p className="text-sm text-[#6e6e73] dark:text-[#a3a3a3]">No se pudo cargar tu nivel.</p> : null}
      {level == null && !error ? <p className="text-sm text-[#6e6e73] dark:text-[#a3a3a3]">Cargando nivel…</p> : null}
      {level != null && current ? (
        <div className="space-y-8">
          <section className={`${meCardClass} p-5 sm:p-6`}>
            <p className="text-[13px] font-medium text-[#6e6e73] dark:text-[#a3a3a3]">Nivel actual</p>
            <p className="mt-2 text-[28px] font-semibold tracking-tight">
              Nivel {level} · {getReputationLabel(level)}
            </p>
            <p className="mt-2 text-[15px] tabular-nums text-[#6e6e73] dark:text-[#a3a3a3]">
              {score} puntos
              {next ? ` · ${next.minScore} para el siguiente` : ''}
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#ececf1] dark:bg-[#2c2c2e]" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso de nivel">
              <div className="h-full rounded-full bg-[#1d1d1f] dark:bg-[#fafafa]" style={{ width: `${progress}%` }} />
            </div>
            {next ? (
              <p className="mt-3 text-[15px]">
                Siguiente: {next.label}. Te faltan {remaining} {remaining === 1 ? 'punto' : 'puntos'}.
              </p>
            ) : (
              <p className="mt-3 text-[15px]">Este es el nivel más alto de Aventa.</p>
            )}
          </section>

          <section>
            <h2 className="text-[20px] font-semibold tracking-tight">Cómo avanzas</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {ADVANCE.map((item) => (
                <li key={item.title} className={`${meCardClass} px-4 py-4`}>
                  <p className="text-[15px] font-medium">{item.title}</p>
                  <p className="mt-1 text-[13px] tabular-nums text-[#6e6e73] dark:text-[#a3a3a3]">{item.detail}</p>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-[20px] font-semibold tracking-tight">Camino de niveles</h2>
            <ol className="mt-4 space-y-3">
              {REPUTATION_LEVELS.map((step) => {
                const state = step.level < level ? 'completado' : step.level === level ? 'actual' : step.level === level + 1 ? 'siguiente' : 'futuro';
                return (
                  <li key={step.level} className={`${meCardClass} flex items-center justify-between gap-3 px-4 py-4 ${state === 'actual' ? 'ring-1 ring-[#1d1d1f] dark:ring-[#fafafa]' : ''}`}>
                    <div>
                      <p className={`text-[15px] ${state === 'futuro' ? 'text-[#6e6e73] dark:text-[#a3a3a3]' : 'font-medium'}`}>
                        Nivel {step.level} · {step.label}
                      </p>
                      <p className="mt-1 text-[13px] tabular-nums text-[#6e6e73] dark:text-[#a3a3a3]">
                        {step.maxScore === Infinity ? `Desde ${step.minScore} pts` : `${step.minScore}–${step.maxScore} pts`}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#f5f5f7] px-2.5 py-1 text-[12px] font-medium capitalize text-[#1d1d1f] dark:bg-white/10 dark:text-[#fafafa]">
                      {state}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      ) : null}
    </MeSectionPage>
  );
}
