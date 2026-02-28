'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ShieldOff } from 'lucide-react';

type BanRow = {
  id: string;
  user_id: string;
  reason: string | null;
  created_at: string;
  expires_at: string | null;
  banned_by: string;
};

export default function BansPage() {
  const [bans, setBans] = useState<BanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [unbanningId, setUnbanningId] = useState<string | null>(null);

  const fetchBans = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/bans', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBans(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBans();
  }, []);

  const handleBan = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = userId.trim();
    if (!uid) return;
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/bans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: uid, reason: reason.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setUserId('');
        setReason('');
        fetchBans();
      } else {
        alert(data?.error ?? 'Error al banear');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnban = async (user_id: string) => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    setUnbanningId(user_id);
    try {
      const res = await fetch(`/api/admin/bans?userId=${encodeURIComponent(user_id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) fetchBans();
      else {
        const data = await res.json().catch(() => ({}));
        alert(data?.error ?? 'Error al desbanear');
      }
    } finally {
      setUnbanningId(null);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
        <ShieldOff className="h-5 w-5" />
        Baneos
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Usuarios baneados no pueden publicar comentarios ni ofertas. Para banear necesitas el UUID del usuario (desde Logs o base de datos).
      </p>

      <form onSubmit={handleBan} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 mb-6 space-y-3 max-w-md">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">User ID (UUID)</label>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Motivo (opcional)</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Spam, insultos, etc."
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
          />
        </div>
        <button
          type="submit"
          disabled={!userId.trim() || submitting}
          className="rounded-lg bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {submitting ? 'Banear…' : 'Banear usuario'}
        </button>
      </form>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">Cargando baneos…</p>
        ) : bans.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">No hay usuarios baneados.</p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {bans.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-mono text-gray-900 dark:text-gray-100 truncate">{b.user_id}</p>
                  {b.reason && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{b.reason}</p>}
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {new Date(b.created_at).toLocaleString()}
                    {b.expires_at && ` · Expira: ${new Date(b.expires_at).toLocaleDateString()}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleUnban(b.user_id)}
                  disabled={unbanningId === b.user_id}
                  className="shrink-0 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  {unbanningId === b.user_id ? '…' : 'Desbanear'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
