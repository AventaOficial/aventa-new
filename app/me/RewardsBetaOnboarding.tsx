'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Step = { id: string; title: string; body: string[] };

export default function RewardsBetaOnboarding({
  steps,
  onDone,
}: {
  steps: Step[];
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const step = steps[index];
  const last = index >= steps.length - 1;

  async function activate() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError('Inicia sesión para activar Rewards.');
        return;
      }
      const res = await fetch('/api/me/rewards/beta', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Activó Rewards en la beta.' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === 'string' ? body.error : 'No se pudo activar.');
        return;
      }
      onDone();
    } catch {
      setError('Error de red.');
    } finally {
      setBusy(false);
    }
  }

  if (!step) return null;

  return (
    <section className="rounded-3xl border border-violet-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#141416] sm:p-7" aria-label="Onboarding de Rewards">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">Rewards beta · {index + 1} de {steps.length}</p>
      <h2 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{step.title}</h2>
      <div className="mt-4 space-y-2 text-sm leading-relaxed text-gray-700 dark:text-zinc-300">
        {step.body.map((line) => <p key={line}>{line}</p>)}
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      <div className="mt-6 flex justify-end gap-2">
        {index > 0 ? (
          <button type="button" className="rounded-xl border border-gray-200 px-4 py-2 text-sm dark:border-zinc-700" onClick={() => setIndex((n) => n - 1)}>
            Atrás
          </button>
        ) : null}
        {last ? (
          <button type="button" disabled={busy} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void activate()}>
            Activar Rewards
          </button>
        ) : (
          <button type="button" className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => setIndex((n) => n + 1)}>
            Siguiente
          </button>
        )}
      </div>
    </section>
  );
}
