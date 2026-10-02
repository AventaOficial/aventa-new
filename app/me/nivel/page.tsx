'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MeSectionPage from '@/app/me/dashboard/MeSectionPage';
import ReputationBar from '@/app/components/ReputationBar';
import { createClient } from '@/lib/supabase/client';
import { REPUTATION_LEVELS, getReputationLabel } from '@/lib/reputation';

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

  return (
    <MeSectionPage
      title="Tu nivel"
      lede="Identidad dentro de la comunidad. No mide recompensas ni pagos."
    >
      {error ? <p className="text-sm text-gray-600 dark:text-zinc-300">No se pudo cargar tu nivel.</p> : null}
      {level == null && !error ? <p className="text-sm text-gray-500 dark:text-zinc-500">Cargando nivel…</p> : null}
      {level != null ? (
        <div className="space-y-4">
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            Nivel {level} · {getReputationLabel(level)}
          </p>
          <ReputationBar variant="hunter" level={level} score={score} />
          <ul className="divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-[#121214]">
            {REPUTATION_LEVELS.map((step) => (
              <li key={step.level} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className={step.level === level ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-zinc-400'}>
                  Nivel {step.level} · {step.label}
                </span>
                {step.level === level ? <span className="text-xs text-violet-600 dark:text-violet-300">Actual</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </MeSectionPage>
  );
}
