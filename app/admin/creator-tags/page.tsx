'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, RefreshCw, Save, Tags } from 'lucide-react';

type ProfileRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  leader_badge: string | null;
  ml_tracking_tag: string | null;
  amazon_tracking_tag: string | null;
  commissions_accepted_at: string | null;
};

export default function AdminCreatorTagsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [q, setQ] = useState('');
  const [onlyTagged, setOnlyTagged] = useState(false);
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { ml: string; amz: string; badge: string }>
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data }) => {
      const access = data.session?.access_token ?? null;
      setToken(access);
      if (!access) {
        setAllowed(false);
        return;
      }
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        setAllowed(false);
        return;
      }
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', uid)
        .in('role', ['owner', 'admin']);
      setAllowed(Boolean(roles?.length));
    });
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setMsg(null);
    const params = new URLSearchParams({ limit: '60' });
    if (q.trim()) params.set('q', q.trim());
    if (onlyTagged) params.set('only_tagged', '1');
    const res = await fetch(`/api/admin/creator-tags?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setMsg(typeof body?.error === 'string' ? body.error : 'Error al cargar');
      return;
    }
    const list = (Array.isArray(body?.profiles) ? body.profiles : []) as ProfileRow[];
    setRows(list);
    const next: Record<string, { ml: string; amz: string; badge: string }> = {};
    for (const p of list) {
      next[p.id] = {
        ml: p.ml_tracking_tag ?? '',
        amz: p.amazon_tracking_tag ?? '',
        badge: p.leader_badge ?? '',
      };
    }
    setDrafts(next);
  }, [token, q, onlyTagged]);

  useEffect(() => {
    if (token && allowed) void load();
  }, [token, allowed, load]);

  const save = async (userId: string) => {
    if (!token) return;
    const d = drafts[userId];
    if (!d) return;
    setSavingId(userId);
    setMsg(null);
    const res = await fetch('/api/admin/creator-tags', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        ml_tracking_tag: d.ml.trim() || null,
        amazon_tracking_tag: d.amz.trim() || null,
        leader_badge: d.badge === 'cazador_estrella' || d.badge === 'cazador_aventa' ? d.badge : null,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSavingId(null);
    if (!res.ok) {
      setMsg(typeof body?.error === 'string' ? body.error : 'No se pudo guardar');
      return;
    }
    setMsg('Guardado.');
    await load();
  };

  if (allowed === null) {
    return <div className="p-8 text-gray-500">Cargando…</div>;
  }
  if (!allowed) {
    return <div className="p-8 text-gray-500">Sin permisos.</div>;
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0a0a0a] -m-4 lg:-m-6 p-4 lg:p-6">
      <div className="max-w-4xl mx-auto space-y-5">
        <Link href="/admin/commissions" className="inline-flex items-center gap-1 text-sm text-violet-600 hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Comisiones
        </Link>

        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-5">
          <h1 className="text-xl font-bold flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <Tags className="h-5 w-5 text-violet-500" />
            Tags de atribución (creadores)
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Asigná <code className="text-xs">ml_tracking_tag</code> y{' '}
            <code className="text-xs">amazon_tracking_tag</code>. Los CTAs de sus ofertas usan esos
            tags (prioridad sobre el tag de plataforma) para poder pagar el 40% atribuible.
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
            Requiere migración{' '}
            <code className="text-[10px]">profiles_amazon_tracking_tag.sql</code> en Supabase.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar nombre, username o tag"
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-[#1a1a1a] min-w-[200px]"
            />
            <label className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={onlyTagged}
                onChange={(e) => setOnlyTagged(e.target.checked)}
              />
              Solo con tag
            </label>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Buscar
            </button>
          </div>
          {msg ? <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{msg}</p> : null}
        </section>

        <div className="space-y-3">
          {rows.map((p) => {
            const d = drafts[p.id] ?? { ml: '', amz: '', badge: '' };
            return (
              <div
                key={p.id}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-4 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {p.display_name || p.username || p.id.slice(0, 8)}
                    </p>
                    <p className="text-[10px] text-gray-500 font-mono">{p.id}</p>
                    {p.commissions_accepted_at ? (
                      <span className="text-[10px] text-emerald-600">Programa aceptado</span>
                    ) : (
                      <span className="text-[10px] text-gray-400">Sin aceptar programa</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void save(p.id)}
                    disabled={savingId === p.id}
                    className="inline-flex items-center gap-1 rounded-lg bg-violet-600 text-white px-3 py-1.5 text-xs disabled:opacity-60"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {savingId === p.id ? '…' : 'Guardar'}
                  </button>
                </div>
                <div className="grid sm:grid-cols-3 gap-2">
                  <label className="text-xs">
                    ML tag
                    <input
                      value={d.ml}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [p.id]: { ...d, ml: e.target.value },
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm font-mono bg-white dark:bg-[#1a1a1a]"
                      placeholder="aventa_usuario"
                    />
                  </label>
                  <label className="text-xs">
                    Amazon tag
                    <input
                      value={d.amz}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [p.id]: { ...d, amz: e.target.value },
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm font-mono bg-white dark:bg-[#1a1a1a]"
                      placeholder="aventa-20"
                    />
                  </label>
                  <label className="text-xs">
                    Badge
                    <select
                      value={d.badge}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [p.id]: { ...d, badge: e.target.value },
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm bg-white dark:bg-[#1a1a1a]"
                    >
                      <option value="">—</option>
                      <option value="cazador_estrella">Cazador estrella</option>
                      <option value="cazador_aventa">Cazador Aventa</option>
                    </select>
                  </label>
                </div>
              </div>
            );
          })}
          {!loading && rows.length === 0 ? (
            <p className="text-sm text-gray-500">Sin resultados.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
