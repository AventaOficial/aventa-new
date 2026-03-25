'use client';

import { useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { Scale } from 'lucide-react';

export default function VoteWeightsPage() {
  const { session } = useAuth();
  const [userId, setUserId] = useState('');
  const [multiplier, setMultiplier] = useState('1');
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : undefined;

  const loadUser = () => {
    if (!authHeaders || !userId.trim()) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    fetch(`/api/admin/vote-weight?user_id=${encodeURIComponent(userId.trim())}`, { headers: authHeaders })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? 'Error');
        setDisplayName(typeof data.display_name === 'string' ? data.display_name : null);
        setMultiplier(String(data.vote_weight_multiplier ?? 1));
        setMessage('Perfil cargado.');
      })
      .catch((e) => setError(e?.message ?? 'Error'))
      .finally(() => setLoading(false));
  };

  const save = () => {
    if (!authHeaders || !userId.trim()) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    fetch('/api/admin/vote-weight', {
      method: 'PATCH',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId.trim(),
        vote_weight_multiplier: parseInt(multiplier, 10),
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? 'Error');
        setMessage(data.warning ?? 'Guardado. Los rankings de las ofertas donde votó esta persona se recalculan.');
      })
      .catch((e) => setError(e?.message ?? 'Error'))
      .finally(() => setLoading(false));
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Scale className="h-6 w-6 text-purple-600 dark:text-purple-400" />
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200">Peso de voto (ranking)</h1>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Solo owner. Cada like suma <strong className="text-gray-700 dark:text-gray-300">2 × multiplicador</strong> al{' '}
        <code className="text-xs">ranking_momentum</code> de la oferta. Por defecto 1 (equivalente a ×2 por like). Con 50, cada
        like cuenta como 100 puntos de impulso.
      </p>
      <p className="text-xs text-amber-700 dark:text-amber-300/90 mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
        Ejecuta en Supabase el SQL antes: <code className="text-[11px]">docs/supabase-migrations/profiles_vote_weight_multiplier.sql</code>
      </p>

      <div className="max-w-md space-y-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">UUID del usuario</label>
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={loading || !session}
          onClick={loadUser}
          className="text-sm font-medium text-purple-600 dark:text-purple-400 hover:underline"
        >
          Cargar multiplicador actual
        </button>
        {displayName != null && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Nombre: <span className="font-medium text-gray-800 dark:text-gray-200">{displayName}</span>
          </p>
        )}
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 pt-2">Multiplicador (1–1000)</label>
        <input
          type="number"
          min={1}
          max={1000}
          value={multiplier}
          onChange={(e) => setMultiplier(e.target.value)}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={loading || !session}
          onClick={save}
          className="w-full rounded-lg bg-purple-600 dark:bg-purple-500 text-white py-2.5 text-sm font-semibold hover:opacity-95 disabled:opacity-50"
        >
          Guardar y recalcular ofertas
        </button>
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="mt-4 text-sm text-green-700 dark:text-green-400">
          {message}
        </p>
      )}
    </div>
  );
}
