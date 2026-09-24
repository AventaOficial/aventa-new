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

export default function AdminCouponsPage() {
  const { session } = useAuth();
  const [rows, setRows] = useState<CouponRow[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

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
              <div>
                <p className="font-mono text-gray-900 dark:text-gray-100">{row.code}</p>
                <p className="text-gray-500 dark:text-gray-400">
                  {row.store} · {row.status} · {row.verification_status} · {row.applies_to}
                  {row.discount_value != null ? ` · ${row.discount_value} ${row.currency ?? ''}`.trim() : ''}
                </p>
              </div>
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
          </li>
        ))}
      </ul>
    </div>
  );
}
