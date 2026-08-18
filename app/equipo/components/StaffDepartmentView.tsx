'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  Trash2,
  Video,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import type { StaffDepartmentId } from '@/lib/staff/permissions';
import type { StaffHomePayload } from '@/lib/staff/buildStaffHome';
import { STAFF_QUALITY_RULES } from '@/lib/staff/workBoard';

const TONE_CLASS = {
  ok: 'border-emerald-200/80 dark:border-emerald-800/50 bg-emerald-50/70 dark:bg-emerald-950/20',
  attention: 'border-amber-200/80 dark:border-amber-800/50 bg-amber-50/80 dark:bg-amber-950/20',
  blocked: 'border-red-200/80 dark:border-red-800/50 bg-red-50/80 dark:bg-red-950/20',
} as const;

function formatMoney(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
}

type Props = {
  department: StaffDepartmentId;
  title: string;
  subtitle: string;
  showFilm?: boolean;
  showQualityRules?: boolean;
  actionLinks?: { label: string; href: string; external?: boolean }[];
};

export default function StaffDepartmentView({
  department,
  title,
  subtitle,
  showFilm = false,
  showQualityRules = false,
  actionLinks = [],
}: Props) {
  const { session } = useAuth();
  const [data, setData] = useState<StaffHomePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTask, setNewTask] = useState('');
  const [saving, setSaving] = useState(false);

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = {};
    if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`;
    return h;
  }, [session?.access_token]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/home?department=${department}`, { headers: headers() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'No se pudo cargar');
        setData(null);
        return;
      }
      setData(body as StaffHomePayload);
    } catch {
      setError('Error de red');
    } finally {
      setLoading(false);
    }
  }, [department, headers]);

  useEffect(() => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }
    load();
  }, [session?.access_token, load]);

  async function patchTasks(payload: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch('/api/staff/tasks', {
        method: 'PATCH',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ department, ...payload }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'No se pudo guardar');
        return;
      }
      if (body?.board && data) setData({ ...data, board: body.board });
    } finally {
      setSaving(false);
    }
  }

  const queue =
    department === 'home'
      ? data?.queue ?? []
      : (data?.queue ?? []).filter((q) => !q.department || q.department === department);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">
          Hub de equipo · México
        </p>
        {data?.greeting && department === 'home' ? (
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            {data.greeting}
          </h1>
        ) : (
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">{title}</h1>
        )}
        <p className="text-sm text-gray-600 dark:text-gray-400 max-w-2xl">{subtitle}</p>
        {data?.roleLabel ? (
          <p className="text-xs text-gray-500">
            Rol: <strong>{data.roleLabel}</strong>
            {data.pulse ? (
              <>
                {' '}
                · Ofertas vivas: <strong>{data.pulse.liveActive}</strong>
              </>
            ) : null}
          </p>
        ) : null}
      </header>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando…
        </div>
      ) : null}

      {actionLinks.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {actionLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              target={link.external ? '_blank' : undefined}
              rel={link.external ? 'noreferrer' : undefined}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-[#141414] px-3 py-2 text-sm font-medium text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            >
              {link.label}
              {link.external ? <ExternalLink className="h-3.5 w-3.5" /> : null}
            </Link>
          ))}
        </div>
      ) : null}

      {data && queue.length > 0 ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {queue.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={`rounded-2xl border p-4 transition hover:shadow-sm ${TONE_CLASS[item.tone]}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.label}</p>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{item.detail}</p>
                </div>
                <p className="text-2xl font-semibold tabular-nums">{item.count}</p>
              </div>
            </Link>
          ))}
        </section>
      ) : null}

      {data ? (
        <section className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-[#141414] p-5">
          <h2 className="text-base font-semibold mb-4">Tareas del día</h2>
          <form
            className="flex gap-2 mb-4"
            onSubmit={(e) => {
              e.preventDefault();
              const text = newTask.trim();
              if (text.length < 3) return;
              void patchTasks({ action: 'add', text }).then(() => setNewTask(''));
            }}
          >
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="Agregar tarea…"
              className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#111] px-3 py-2 text-sm"
              maxLength={280}
            />
            <button
              type="submit"
              disabled={saving || newTask.trim().length < 3}
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 text-white px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Añadir
            </button>
          </form>
          <ul className="space-y-2">
            {data.board.tasks.map((task) => (
              <li key={task.id} className="flex items-start gap-2 rounded-xl px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-900/60">
                <input
                  type="checkbox"
                  checked={task.done}
                  onChange={(e) => void patchTasks({ action: 'toggle', id: task.id, done: e.target.checked })}
                />
                <span className={`flex-1 text-sm ${task.done ? 'text-gray-400 line-through' : ''}`}>{task.text}</span>
                <button
                  type="button"
                  onClick={() => void patchTasks({ action: 'remove', id: task.id })}
                  className="p-1 text-gray-400 hover:text-red-500"
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {showQualityRules ? (
        <section className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-[#141414] p-5">
          <h2 className="text-base font-semibold mb-3">Calidad, no basura</h2>
          <ul className="space-y-2">
            {STAFF_QUALITY_RULES.map((rule) => (
              <li key={rule} className="flex gap-2 text-sm text-gray-700 dark:text-gray-300">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500" />
                {rule}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {showFilm && data && data.film.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-emerald-600" />
            <h2 className="text-base font-semibold">Para grabar hoy</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.film.map((item) => (
              <article key={item.id} className="rounded-2xl border overflow-hidden bg-white dark:bg-[#141414]">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt="" className="h-28 w-full object-cover" />
                ) : (
                  <div className="h-28 bg-gray-100 dark:bg-gray-900" />
                )}
                <div className="p-3 space-y-1">
                  <p className="text-sm font-medium line-clamp-2">{item.title}</p>
                  <p className="text-xs text-gray-500">{item.store}</p>
                  <p className="text-sm">
                    {formatMoney(item.price)}
                    {item.discountPercent != null ? (
                      <span className="ml-2 text-xs font-semibold text-emerald-600">-{item.discountPercent}%</span>
                    ) : null}
                  </p>
                  <a href={item.offerUrl} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 hover:underline">
                    Abrir en tienda
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {data?.pulse && department === 'contabilidad' ? (
        <section className="rounded-2xl border border-amber-200/80 bg-amber-50/50 dark:bg-amber-950/20 p-4 text-sm flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
          <p>
            {data.pulse.commissionsPublic
              ? `Hay ${data.pulse.payoutsPending} asignación(es) pendiente(s) de marcar como pagadas.`
              : 'El programa de comisiones sigue apagado hasta tener ingreso afiliado real. Prepara ledger y datos fiscales.'}
          </p>
        </section>
      ) : null}
    </div>
  );
}
