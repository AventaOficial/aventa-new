'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Briefcase,
  ArrowLeft,
  ListTodo,
  Wallet,
  Lightbulb,
  ShieldCheck,
  Calculator,
  Trash2,
  Rocket,
  Copy,
  Check,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const LS_TASKS = 'aventa_owner_tasks_v1';
const LS_COSTS = 'aventa_owner_costs_v1';
const LS_IDEAS = 'aventa_owner_ideas_v1';
const LS_MOD = 'aventa_owner_mod_goal_v1';
const LS_INCOME = 'aventa_owner_income_v1';
const LS_PLANS = 'aventa_owner_plans_v1';

function todayKey() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Mexico_City' });
}

type TaskItem = { id: string; text: string; done: boolean };
type CostLine = { id: string; label: string; amount: number };

const DEFAULT_TASKS: TaskItem[] = [
  {
    id: 'seed-1',
    text: 'Subir / buscar ~50 ofertas (ventana sugerida 4:00–14:00 CDMX)',
    done: false,
  },
];

const DEFAULT_COSTS: CostLine[] = [
  { id: 'c1', label: 'Cursor (plan mensual)', amount: 400 },
  { id: 'c2', label: 'Dominio (prorrateo mensual del pago anual)', amount: 0 },
  { id: 'c3', label: 'Vercel Hobby / otros fijos', amount: 0 },
];

/** Checklist de medio plazo: tiendas, empresa, fiscalidad (orientativo; no es asesoría legal). */
const DEFAULT_PLAN_ITEMS: TaskItem[] = [
  {
    id: 'plan-ios',
    text: 'App en producción iOS: cuenta Apple Developer (99 USD/año), App Store Connect, guidelines y revisión',
    done: false,
  },
  {
    id: 'plan-android',
    text: 'App en producción Android: cuenta Google Play Console (cuota única), políticas y firma del APK/AAB',
    done: false,
  },
  {
    id: 'plan-stack',
    text: 'Decidir enfoque técnico: PWA + “Añadir a inicio”, Capacitor/React Native, o nativo (coste/tiempo)',
    done: false,
  },
  {
    id: 'plan-empresa',
    text: 'México — formalizar: persona moral vs actividad empresarial; nombre y objeto social acorde al producto',
    done: false,
  },
  {
    id: 'plan-fiscal',
    text: 'México — régimen fiscal (SAT), facturación si aplica, contador de confianza para arrancar bien',
    done: false,
  },
  {
    id: 'plan-legal-app',
    text: 'Legales para tiendas: privacidad, términos, edad mínima, datos que recopila la app (alineado con sitio)',
    done: false,
  },
  {
    id: 'plan-banco',
    text: 'Cuenta bancaria / métodos de pago a nombre del negocio cuando exista persona moral o actividad',
    done: false,
  },
];

const PROMPT_CURSOR_AUDITORIA = `Actúa como auditor técnico senior de un producto web en producción (Next.js + Supabase + Vercel).

Contexto: soy el fundador, quiero una auditoría total del estado actual del repositorio y de los últimos cambios relevantes.

Por favor:
1) Resume qué áreas del sistema tocaste o revisarías primero (auth, feed, admin, APIs, BD, PWA, costos).
2) Lista riesgos concretos (seguridad, datos personales, rate limits, errores 401/400, SEO, rendimiento).
3) Indica qué validar en Supabase (RLS, vistas, migraciones pendientes) y en Vercel (variables, crons).
4) Propón un orden de prioridades para las próximas 48–72 h si estoy cerca de lanzar.
5) Si algo no puedes ver sin el código, dilo explícitamente y pide los archivos o rutas que necesitas.

Responde en español, con viñetas claras y sin relleno.`;

const PROMPT_GEMINI_CONTEXTO = `Eres mi asistente personal para el proyecto AVENTA (aventaofertas.com): comunidad de “cazadores de ofertas” en México.

Stack principal: Next.js (App Router), React, Supabase (auth + Postgres + storage), despliegue en Vercel, PWA instalable. Hay panel admin para moderación, centro de operaciones para el owner, feed home y feed “Para ti” personalizado.

Mi nivel: muy nuevo en negocios digitales, empresa e impuestos; necesito explicaciones sencillas y pasos ordenados, sin asumir que ya sé jerga.

Reglas:
- No inventes leyes ni plazos del SAT; cuando hablemos de empresa o impuestos en México, recuerda que debe contrastarse con un contador o abogado.
- Separa siempre “opinión / buena práctica” de “dato verificable”.
- Si me propones un plan, que tenga fases (MVP → escala) y criterios de “listo”.
- Puedes ayudarme con redacción de emails, checklists, preguntas para asesores y priorización; no sustituyes a un profesional fiscal/legal.

Objetivo: que sienta control y claridad; actúa como secretaría ejecutiva: agenda, seguimiento y recordatorios de lo pendiente.`;

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function TrabajoPageContent() {
  const router = useRouter();
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [costs, setCosts] = useState<CostLine[]>([]);
  const [ideas, setIdeas] = useState('');
  const [modTarget, setModTarget] = useState(0);
  const [modNote, setModNote] = useState('');
  const [incomeAffiliate, setIncomeAffiliate] = useState(0);
  const [incomeOther, setIncomeOther] = useState(0);
  const [planItems, setPlanItems] = useState<TaskItem[]>([]);
  const [copyState, setCopyState] = useState<'cursor' | 'gemini' | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace('/');
        return;
      }
      supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'owner')
        .maybeSingle()
        .then(({ data }) => {
          setIsOwner(!!data);
          if (!data) router.replace('/');
        });
    });
  }, [router]);

  useEffect(() => {
    if (isOwner !== true) return;
    const day = todayKey();
    const storedTasks = loadJson<{ items: TaskItem[]; dayKey?: string } | null>(LS_TASKS, null);
    if (storedTasks?.items?.length) {
      if (storedTasks.dayKey === day) setTasks(storedTasks.items);
      else setTasks(storedTasks.items.map((t) => ({ ...t, done: false })));
    } else {
      setTasks(DEFAULT_TASKS);
    }
    const storedCosts = loadJson<CostLine[] | null>(LS_COSTS, null);
    setCosts(storedCosts?.length ? storedCosts : DEFAULT_COSTS);
    setIdeas(loadJson<string>(LS_IDEAS, ''));
    const mod = loadJson<{ target?: number; note?: string; dayKey?: string }>(LS_MOD, {});
    if (mod.dayKey === day) {
      setModTarget(typeof mod.target === 'number' ? mod.target : 0);
      setModNote(typeof mod.note === 'string' ? mod.note : '');
    }
    const inc = loadJson<{ affiliate?: number; other?: number }>(LS_INCOME, {});
    setIncomeAffiliate(typeof inc.affiliate === 'number' ? inc.affiliate : 0);
    setIncomeOther(typeof inc.other === 'number' ? inc.other : 0);
    const storedPlans = loadJson<TaskItem[] | null>(LS_PLANS, null);
    if (storedPlans?.length) {
      const byId = new Map(DEFAULT_PLAN_ITEMS.map((p) => [p.id, p]));
      const merged = DEFAULT_PLAN_ITEMS.map((def) => {
        const s = storedPlans.find((x) => x.id === def.id);
        return s ? { ...def, done: s.done, text: s.text || def.text } : def;
      });
      const extras = storedPlans.filter((s) => !byId.has(s.id));
      setPlanItems([...merged, ...extras]);
    } else {
      setPlanItems(DEFAULT_PLAN_ITEMS);
    }
  }, [isOwner]);

  const persistTasks = useCallback((items: TaskItem[]) => {
    setTasks(items);
    try {
      localStorage.setItem(LS_TASKS, JSON.stringify({ items, dayKey: todayKey() }));
    } catch {
      /* ignore */
    }
  }, []);

  const persistCosts = useCallback((lines: CostLine[]) => {
    setCosts(lines);
    try {
      localStorage.setItem(LS_COSTS, JSON.stringify(lines));
    } catch {
      /* ignore */
    }
  }, []);

  const persistIdeas = useCallback((v: string) => {
    setIdeas(v);
    try {
      localStorage.setItem(LS_IDEAS, v);
    } catch {
      /* ignore */
    }
  }, []);

  const persistMod = useCallback((target: number, note: string) => {
    setModTarget(target);
    setModNote(note);
    try {
      localStorage.setItem(LS_MOD, JSON.stringify({ target, note, dayKey: todayKey() }));
    } catch {
      /* ignore */
    }
  }, []);

  const persistIncome = useCallback((a: number, b: number) => {
    setIncomeAffiliate(a);
    setIncomeOther(b);
    try {
      localStorage.setItem(LS_INCOME, JSON.stringify({ affiliate: a, other: b }));
    } catch {
      /* ignore */
    }
  }, []);

  const persistPlans = useCallback((items: TaskItem[]) => {
    setPlanItems(items);
    try {
      localStorage.setItem(LS_PLANS, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, []);

  const copyPrompt = useCallback((which: 'cursor' | 'gemini', text: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopyState(which);
      window.setTimeout(() => setCopyState(null), 2500);
    });
  }, []);

  const addTask = () => {
    persistTasks([...tasks, { id: crypto.randomUUID(), text: '', done: false }]);
  };

  const totalCosts = costs.reduce((s, c) => s + (Number.isFinite(c.amount) ? c.amount : 0), 0);
  const totalIncome = (Number.isFinite(incomeAffiliate) ? incomeAffiliate : 0) + (Number.isFinite(incomeOther) ? incomeOther : 0);

  if (isOwner === null) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Cargando…</p>
      </div>
    );
  }

  if (!isOwner) return null;

  return (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0a0a0a] -m-4 lg:-m-6 p-4 lg:p-6">
        <div className="max-w-3xl mx-auto px-4 py-8 md:py-10 pb-28 md:pb-10">
          <Link
            href="/admin/operaciones"
            className="inline-flex items-center gap-2 text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al centro de operaciones
          </Link>

          <header className="mb-8 flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400">
              <Briefcase className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Trabajo (owner)</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Agenda y números personales. Todo se guarda solo en este navegador (localStorage); no sustituye contabilidad
                ni facturación.
              </p>
            </div>
          </header>

          <div className="space-y-6">
            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-3">
                <ListTodo className="h-5 w-5 text-violet-500" />
                Tareas del día
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Día (CDMX): <strong>{todayKey()}</strong>. Puedes marcar hecho o editar el texto.
              </p>
              <ul className="space-y-2">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={() =>
                        persistTasks(tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))
                      }
                      className="mt-1 rounded border-gray-400 text-violet-600"
                    />
                    <input
                      type="text"
                      value={t.text}
                      onChange={(e) =>
                        persistTasks(tasks.map((x) => (x.id === t.id ? { ...x, text: e.target.value } : x)))
                      }
                      className="flex-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                    />
                    <button
                      type="button"
                      onClick={() => persistTasks(tasks.filter((x) => x.id !== t.id))}
                      className="p-2 text-gray-400 hover:text-red-500"
                      aria-label="Eliminar tarea"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={addTask}
                className="mt-3 text-sm font-semibold text-violet-600 dark:text-violet-400 hover:underline"
              >
                + Añadir tarea
              </button>
            </section>

            <section className="rounded-2xl border border-violet-200/80 dark:border-violet-800/50 bg-violet-50/40 dark:bg-violet-950/20 p-5 shadow-sm">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-2">
                <Rocket className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                Planes: apps en tiendas y formalizar el negocio
              </h2>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">
                Checklist de medio plazo (iOS App Store, Google Play, empresa e impuestos en México). Es una guía para
                que no se te pierda nada; <strong>no sustituye asesoría legal ni contable</strong>. Marca lo que ya
                investigaste o cerraste.
              </p>
              <ul className="space-y-2 mb-4">
                {planItems.map((p) => (
                  <li key={p.id} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={p.done}
                      onChange={() =>
                        persistPlans(planItems.map((x) => (x.id === p.id ? { ...x, done: !x.done } : x)))
                      }
                      className="mt-1 rounded border-gray-400 text-violet-600"
                    />
                    <input
                      type="text"
                      value={p.text}
                      onChange={(e) =>
                        persistPlans(planItems.map((x) => (x.id === p.id ? { ...x, text: e.target.value } : x)))
                      }
                      className="flex-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                    />
                    <button
                      type="button"
                      onClick={() => persistPlans(planItems.filter((x) => x.id !== p.id))}
                      className="p-2 text-gray-400 hover:text-red-500 shrink-0"
                      aria-label="Quitar ítem"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() =>
                  persistPlans([...planItems, { id: `plan-${crypto.randomUUID()}`, text: '', done: false }])
                }
                className="text-sm font-semibold text-violet-600 dark:text-violet-400 hover:underline mb-6"
              >
                + Añadir ítem al plan
              </button>

              <div className="border-t border-violet-200/80 dark:border-violet-800/50 pt-4 space-y-4">
                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                  Prompts listos para pegar (Cursor / Gemini)
                </p>

                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                      Para Cursor — auditoría total
                    </span>
                    <button
                      type="button"
                      onClick={() => copyPrompt('cursor', PROMPT_CURSOR_AUDITORIA)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-600 px-2.5 py-1 text-[11px] font-semibold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                    >
                      {copyState === 'cursor' ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copyState === 'cursor' ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                  <pre className="text-[10px] leading-relaxed text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-sans max-h-40 overflow-y-auto">
                    {PROMPT_CURSOR_AUDITORIA}
                  </pre>
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                      Para Gemini — contexto del proyecto
                    </span>
                    <button
                      type="button"
                      onClick={() => copyPrompt('gemini', PROMPT_GEMINI_CONTEXTO)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-600 px-2.5 py-1 text-[11px] font-semibold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                    >
                      {copyState === 'gemini' ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copyState === 'gemini' ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                  <pre className="text-[10px] leading-relaxed text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-sans max-h-40 overflow-y-auto">
                    {PROMPT_GEMINI_CONTEXTO}
                  </pre>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-3">
                <ShieldCheck className="h-5 w-5 text-violet-500" />
                Moderación (objetivo del día)
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Meta manual: cuántas revisiones quieres hacer hoy. La cola real está en{' '}
                <Link href="/admin/moderation" className="text-violet-600 dark:text-violet-400 font-medium hover:underline">
                  Moderación
                </Link>
                .
              </p>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Objetivo (número)
              </label>
              <input
                type="number"
                min={0}
                value={modTarget || ''}
                onChange={(e) => persistMod(Number(e.target.value) || 0, modNote)}
                className="w-full max-w-xs rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm mb-3"
              />
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nota</label>
              <textarea
                value={modNote}
                onChange={(e) => persistMod(modTarget, e.target.value)}
                rows={2}
                placeholder="Ej. priorizar ofertas con enlaces rotos"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              />
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-3">
                <Wallet className="h-5 w-5 text-violet-500" />
                Costos fijos (MXN / mes, aprox.)
              </h2>
              <ul className="space-y-2">
                {costs.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={c.label}
                      onChange={(e) =>
                        persistCosts(costs.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)))
                      }
                      className="flex-1 min-w-[140px] rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={c.amount || ''}
                      onChange={(e) =>
                        persistCosts(
                          costs.map((x) => (x.id === c.id ? { ...x, amount: Number(e.target.value) || 0 } : x))
                        )
                      }
                      className="w-28 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => persistCosts(costs.filter((x) => x.id !== c.id))}
                      className="p-2 text-gray-400 hover:text-red-500"
                      aria-label="Quitar línea"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    persistCosts([...costs, { id: crypto.randomUUID(), label: '', amount: 0 }])
                  }
                  className="text-sm font-semibold text-violet-600 dark:text-violet-400 hover:underline"
                >
                  + Línea de costo
                </button>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  Total mensual aprox.: {totalCosts.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-3">
                <Calculator className="h-5 w-5 text-violet-500" />
                Ingresos estimados (mensual, MXN)
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Campos libres para anotar lo que quieras (afiliados, otros). Solo suma local.
              </p>
              <div className="grid sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs text-gray-500">Afiliados / comisiones</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={incomeAffiliate || ''}
                    onChange={(e) => persistIncome(Number(e.target.value) || 0, incomeOther)}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Otros</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={incomeOther || ''}
                    onChange={(e) => persistIncome(incomeAffiliate, Number(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm mt-1"
                  />
                </div>
              </div>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                Total anotado: {totalIncome.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
              </p>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-3">
                <Lightbulb className="h-5 w-5 text-amber-500" />
                Ideas y backlog
              </h2>
              <textarea
                value={ideas}
                onChange={(e) => persistIdeas(e.target.value)}
                rows={8}
                placeholder="Roadmap mental, features fase 2, recordatorios…"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              />
            </section>

            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              Comunidad / solicitudes (fase 2): ver{' '}
              <code className="text-[10px] bg-gray-200 dark:bg-gray-800 px-1 rounded">docs/FASE2_COMUNIDAD_SOLICITUDES.md</code>
            </p>
          </div>
        </div>
    </div>
  );
}
