'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Plus,
  Trash2,
  Video,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { TEAM_QUALITY_RULES, type TeamFilmCandidate, type TeamQueueItem, type TeamWorkTask } from '@/lib/admin/teamBoard';
import type { TeamBoardPayload } from '@/lib/admin/buildTeamBoard';

const TONE_CLASS: Record<TeamQueueItem['tone'], string> = {
  ok: 'border-emerald-200/80 dark:border-emerald-800/50 bg-emerald-50/70 dark:bg-emerald-950/20',
  attention: 'border-amber-200/80 dark:border-amber-800/50 bg-amber-50/80 dark:bg-amber-950/20',
  blocked: 'border-red-200/80 dark:border-red-800/50 bg-red-50/80 dark:bg-red-950/20',
};

function formatMoney(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
}

function FilmCard({ item }: { item: TeamFilmCandidate }) {
  return (
    <article className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-[#1C1C1E] overflow-hidden">
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" className="h-28 w-full object-cover bg-gray-100 dark:bg-gray-900" />
      ) : (
        <div className="h-28 bg-gray-100 dark:bg-gray-900" />
      )}
      <div className="p-3 space-y-1.5">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">{item.title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{item.store}</p>
        <p className="text-sm text-gray-800 dark:text-gray-200">
          {formatMoney(item.price)}
          {item.originalPrice != null ? (
            <span className="ml-2 text-xs text-gray-400 line-through">{formatMoney(item.originalPrice)}</span>
          ) : null}
          {item.discountPercent != null ? (
            <span className="ml-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">-{item.discountPercent}%</span>
          ) : null}
        </p>
        <a
          href={item.offerUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline"
        >
          Abrir en tienda
        </a>
      </div>
    </article>
  );
}

export default function EquipoTrabajoPage() {
  const { session } = useAuth();
  const [data, setData] = useState<TeamBoardPayload | null>(null);
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
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/team-board', { headers: headers() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'No se pudo cargar');
        setData(null);
        return;
      }
      setData(body as TeamBoardPayload);
    } catch {
      setError('Error de red');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }
    load();
  }, [session?.access_token, load]);

  async function patch(payload: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/team-board', {
        method: 'PATCH',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'No se pudo guardar');
        return;
      }
      if (body?.board && data) {
        setData({ ...data, board: body.board, seededTasks: false });
      }
    } catch {
      setError('Error de red');
    } finally {
      setSaving(false);
    }
  }

  const tasks: TeamWorkTask[] = data?.board.tasks ?? [];

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400">
          Equipo
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-[#1D1D1F] dark:text-gray-100">Zona de trabajo</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
          Aquí entra quien ayude a operar Aventa: qué hay que hacer hoy, qué está atrasado y qué ofertas sí
          merecen video. El centro de operaciones y el bot siguen siendo solo del fundador.
        </p>
      </header>

      {error ? (
        <p className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando tablero…
        </div>
      ) : null}

      {data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.queue.map((item) => (
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
                  <p className="text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{item.count}</p>
                </div>
              </Link>
            ))}
          </section>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Ofertas vivas ahora: <strong>{data.pulse.liveActive}</strong>
            {data.commissionsPublic ? null : ' · Pagos a cazadores: programa todavía apagado (listo para cuando haya comisión real).'}
          </p>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-[#1C1C1E] p-5">
              <div className="flex items-center gap-2 mb-4">
                <ClipboardList className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Tareas compartidas</h2>
              </div>
              <form
                className="flex gap-2 mb-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = newTask.trim();
                  if (text.length < 3) return;
                  void patch({ action: 'add', text }).then(() => setNewTask(''));
                }}
              >
                <input
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  placeholder="Agregar tarea para el equipo…"
                  className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#111113] px-3 py-2 text-sm"
                  maxLength={280}
                />
                <button
                  type="submit"
                  disabled={saving || newTask.trim().length < 3}
                  className="inline-flex items-center gap-1 rounded-xl bg-violet-600 text-white px-3 py-2 text-sm font-medium disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  Añadir
                </button>
              </form>
              <ul className="space-y-2">
                {tasks.map((task) => (
                  <li key={task.id} className="flex items-start gap-2 rounded-xl px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-900/60">
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={(e) => void patch({ action: 'toggle', id: task.id, done: e.target.checked })}
                      className="mt-1"
                    />
                    <span className={`flex-1 text-sm ${task.done ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-200'}`}>
                      {task.text}
                    </span>
                    <button
                      type="button"
                      onClick={() => void patch({ action: 'remove', id: task.id })}
                      className="p-1 text-gray-400 hover:text-red-500"
                      aria-label="Eliminar tarea"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-[#1C1C1E] p-5">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Calidad, no basura</h2>
              </div>
              <ul className="space-y-2.5">
                {TEAM_QUALITY_RULES.map((rule) => (
                  <li key={rule} className="flex gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 text-xs text-amber-900 dark:text-amber-100">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Si la cola del bot pasa de 12, no apruebes a ciegas: rechaza lo flojo. El inventario gana a
                  Promodescuentos solo si se puede confiar en el precio.
                </span>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Para grabar hoy</h2>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Ofertas vivas de Mercado Libre o Amazon con descuento visible. Tú y tu hermano graban; aquí solo
              está la materia prima.
            </p>
            {data.film.length === 0 ? (
              <p className="text-sm text-gray-500">Aún no hay ofertas que pasen el filtro de calidad para video.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {data.film.map((item) => (
                  <FilmCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
