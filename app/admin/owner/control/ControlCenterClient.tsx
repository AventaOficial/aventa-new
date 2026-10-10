'use client';

import { useState, type FormEvent } from 'react';
import { DEFAULT_FEED_PRESENTATION } from '@/lib/control/schema';

const INPUT = 'mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white';

export default function ControlCenterClient({
  storage,
}: {
  storage: 'ready' | 'missing' | 'unknown';
}) {
  const [maxSameProduct, setMaxSameProduct] = useState(DEFAULT_FEED_PRESENTATION.maxSameProduct);
  const [message, setMessage] = useState<string | null>(
    storage === 'missing'
      ? 'Esta base todavía no tiene la tabla. El feed sigue el valor en código hasta aplicar la migración.'
      : null,
  );
  const [pending, setPending] = useState(false);

  async function saveFeed(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/owner/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'feed_presentation',
          recordKey: 'home_vitales',
          payload: { maxSameProduct },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage(body.error ?? 'No se pudo guardar');
        return;
      }
      setMessage('Guardado. Día a día usa este tope en la siguiente carga del feed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={saveFeed} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="text-sm font-semibold text-white">Presentación de Día a día</h2>
      <p className="mt-1 text-xs leading-relaxed text-white/55">
        Limita cuántas variantes del mismo producto aparecen antes de ceder el lugar. Día a día ya usa la ventana de una semana del feed; aquí no se cambia esa antigüedad ni la puntuación.
      </p>
      <label className="mt-4 block text-xs text-white/70">
        Máximo del mismo producto
        <input
          className={INPUT}
          type="number"
          min={1}
          max={4}
          value={maxSameProduct}
          onChange={(event) => setMaxSameProduct(Number(event.target.value))}
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? 'Guardando…' : 'Guardar presentación'}
      </button>
      {message ? <p className="mt-3 text-xs leading-relaxed text-amber-200/90">{message}</p> : null}
    </form>
  );
}
