'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';

type CouponRow = {
  canonical_key: string;
  store: string;
  code: string;
  discount_type: string;
  discount_value: number | null;
  currency: string | null;
  applies_to: string;
  status: string;
  verification_status: string;
  confidence: number;
  expires_at: string | null;
};

type HistoryEvent = {
  event_type: string;
  changes: string[] | null;
  actor_role: string | null;
  observed_at: string;
};

export default function AdminCouponsPage() {
  const { session } = useAuth();
  const [rows, setRows] = useState<CouponRow[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [history, setHistory] = useState<{ events: HistoryEvent[]; first: string | null; last: string | null } | null>(
    null,
  );

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    let cancelled = false;
    fetch('/api/admin/coupons', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
        if (cancelled) return;
        if (!res.ok) {
          setNote(data.error === 'migration_pending' ? 'Falta aplicar la migración de cupones.' : 'No se pudo leer la cuponera.');
          setRows([]);
          return;
        }
        setNote(null);
        setRows(data.coupons ?? []);
      })
      .catch(() => {
        if (!cancelled) setNote('No se pudo leer la cuponera.');
      });
    return () => {
      cancelled = true;
    };
  }, [session?.access_token, reload]);

  async function openHistory(canonicalKey: string) {
    const token = session?.access_token;
    if (!token) return;
    setOpenKey(canonicalKey);
    const res = await fetch(`/api/admin/coupons?canonicalKey=${encodeURIComponent(canonicalKey)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => null);
    const coupon = data?.coupon as { first_seen_at?: string; last_seen_at?: string } | null;
    setHistory({
      events: data?.events ?? [],
      first: coupon?.first_seen_at ?? null,
      last: coupon?.last_seen_at ?? null,
    });
  }

  async function act(canonicalKey: string, action: 'verify' | 'invalidate') {
    const token = session?.access_token;
    if (!token) return;
    await fetch('/api/admin/coupons', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, canonicalKey }),
    });
    setReload((value) => value + 1);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Cuponera</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Una mención no se muestra como disponible. Verificar no publica ofertas.
      </p>
      {note ? <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">{note}</p> : null}
      <ul className="mt-4 space-y-2">
        {rows.map((row) => (
          <li
            key={row.canonical_key}
            className="rounded-xl border border-gray-200 px-4 py-3 text-sm dark:border-gray-800"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" className="text-left" onClick={() => void openHistory(row.canonical_key)}>
                <p className="font-mono text-gray-900 dark:text-gray-100">{row.code}</p>
                <p className="text-gray-500 dark:text-gray-400">
                  {row.store} · {row.status} · {row.verification_status} · {row.applies_to}
                  {row.discount_value != null ? ` · ${row.discount_value} ${row.currency ?? ''}`.trim() : ''}
                </p>
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-full bg-violet-600 px-3 py-1 text-xs font-medium text-white"
                  onClick={() => void act(row.canonical_key, 'verify')}
                >
                  Verificar
                </button>
                <button
                  type="button"
                  className="rounded-full border border-gray-300 px-3 py-1 text-xs dark:border-gray-700"
                  onClick={() => void act(row.canonical_key, 'invalidate')}
                >
                  Invalidar
                </button>
              </div>
            </div>
            {openKey === row.canonical_key && history ? (
              <div className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                <p>Primera vez: {history.first ?? '—'}</p>
                <p>Última vez: {history.last ?? '—'}</p>
                <ul className="mt-1 space-y-1">
                  {history.events.map((event, index) => (
                    <li key={`${event.observed_at}-${index}`}>
                      {event.event_type}
                      {event.actor_role ? ` · ${event.actor_role}` : ''}
                      {event.changes?.length ? ` · ${event.changes.join(', ')}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
