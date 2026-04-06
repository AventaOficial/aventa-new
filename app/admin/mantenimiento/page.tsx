'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarClock,
  Check,
  ClipboardList,
  Copy,
  ExternalLink,
  NotebookPen,
  Wrench,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { canManageTeam, type Role } from '@/lib/admin/roles';

const LS_LOG = 'aventa_admin_mantenimiento_log_v1';
const LS_DONE_PREFIX = 'aventa_maint_done_';

const SCHEDULE_ROWS = [
  {
    slug: 'daily-moderation',
    freq: 'Diaria',
    area: 'Moderación',
    task: 'Cola bot (pending), spam evidente',
    where: 'Admin → Moderación',
  },
  {
    slug: 'weekly-bot',
    freq: 'Semanal',
    area: 'Bot ingest',
    task: 'Errores, duplicate/skipped, tope diario',
    where: 'Operaciones → Bot / logs Vercel',
  },
  {
    slug: 'weekly-pause',
    freq: 'Semanal',
    area: 'Pausa global',
    task: 'bot_ingest_paused coherente con operación',
    where: 'Supabase app_config o Trabajo',
  },
  {
    slug: 'monthly-vercel',
    freq: 'Mensual',
    area: 'Variables Vercel',
    task: 'BOT_*, tags afiliado, CRON_SECRET',
    where: 'Vercel → Environment',
  },
  {
    slug: 'monthly-affiliate',
    freq: 'Mensual',
    area: 'Afiliados',
    task: 'Tag Amazon vigente; tag ML según panel (param tag en URLs)',
    where: 'Associates + ML',
  },
  {
    slug: 'monthly-smoke',
    freq: 'Mensual',
    area: 'Enlaces de prueba',
    task: '1 oferta ML + 1 Amazon: offer_url con tag=',
    where: 'Crear prueba / DB',
  },
  {
    slug: 'quarterly-sources',
    freq: 'Trimestral',
    area: 'Fuentes bot',
    task: 'BOT_INGEST_URLS, ASINs, discover ML',
    where: 'Vercel env',
  },
  {
    slug: 'quarterly-supabase',
    freq: 'Trimestral',
    area: 'Supabase',
    task: 'Plan, backups, RLS',
    where: 'Panel Supabase',
  },
  {
    slug: 'quarterly-cron',
    freq: 'Trimestral',
    area: 'Crons',
    task: 'vercel.json ↔ /api/cron/*',
    where: 'Repo + Vercel Cron',
  },
  {
    slug: 'quarterly-npm',
    freq: 'Trimestral',
    area: 'Dependencias',
    task: 'npm audit, parches críticos Next',
    where: 'Repo local / CI',
  },
  {
    slug: 'annual-secrets',
    freq: 'Anual / incidente',
    area: 'Secretos',
    task: 'Rotar claves filtradas, CRON_SECRET, service role',
    where: 'Vercel + Supabase',
  },
] as const;

const PROMPTS: { id: string; title: string; body: string }[] = [
  {
    id: 'bot',
    title: 'Ronda mensual — estado del bot',
    body: `Contexto: AVENTA, Next.js, bot ingest en Vercel, modo solo moderación.
Tengo esta configuración y fragmentos de log (sin secretos):

[PEGAR AQUÍ]

Preguntas:
1. ¿Hay señales de rate limit, HTML bloqueado, o demasiados duplicate?
2. ¿Qué variable BOT_INGEST_* ajustarías primero y por qué?
3. ¿Algo que deba escalar a desarrollo (código)?`,
  },
  {
    id: 'affiliate',
    title: 'Afiliados ML + Amazon',
    body: `Stack: AVENTA aplica tag con query param "tag" en URLs mercadolibre.* y amazon.*.

Panel ML dice: [PEGAR etiqueta / captura en texto]
Variables actuales (valores parciales o nombres solamente): [PEGAR]

¿Hay contradicción con lo que hace el código? ¿Qué comprobar en una URL real antes/después de guardar oferta?`,
  },
  {
    id: 'env',
    title: 'Tras cambio de env en Vercel',
    body: `Cambié estas variables en Vercel: [LISTA DE NOMBRES, sin valores secretos]
Desplegué en producción.

Genera un checklist de smoke test en 5 pasos para validar bot + crear oferta + CTA "Ver oferta en tienda".`,
  },
  {
    id: 'security',
    title: 'Seguridad / secretos (post-incidente)',
    body: `Hubo posible exposición de: [QUÉ]. Stack: Supabase + Vercel + Next.

Lista ordenada de rotación (qué rotar primero) y qué NO hace falta rotar.`,
  },
];

const INDEX_ITEMS = [
  {
    title: 'Variables BOT_INGEST_*',
    why: 'Fuentes, límites y umbrales de calidad se desalinean con el mercado.',
  },
  {
    title: 'app_config / pausa bot',
    why: 'Operación manual vs automatización; evitar pausa olvidada.',
  },
  {
    title: 'Crons Vercel',
    why: 'Rutas o secretos que cambian en deploys.',
  },
  {
    title: 'Afiliados (ML, Amazon)',
    why: 'Reglas e IDs del programa; formato de enlaces.',
  },
  {
    title: 'BOT_INGEST_URLS / ASINs',
    why: 'Productos descontinuados y 404.',
  },
  {
    title: 'Supabase',
    why: 'Plan, backups, políticas RLS, índices.',
  },
  {
    title: 'Dependencias npm',
    why: 'CVEs y compatibilidad con Next.',
  },
  {
    title: 'Documentación',
    why: 'Deriva respecto al código (CONTEXTO_SISTEMA, agenda en docs).',
  },
];

const TOC = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'calendario', label: 'Calendario' },
  { id: 'prompts', label: 'Prompts IA' },
  { id: 'historial', label: 'Historial' },
  { id: 'indice', label: 'Qué mantener' },
] as const;

function loadDoneDates(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const out: Record<string, string> = {};
  for (const row of SCHEDULE_ROWS) {
    const v = localStorage.getItem(LS_DONE_PREFIX + row.slug);
    if (v) out[row.slug] = v;
  }
  return out;
}

function PromptCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [body]);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/40">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              Copiado
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copiar
            </>
          )}
        </button>
      </div>
      <pre className="p-4 text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
        {body}
      </pre>
    </div>
  );
}

export default function AdminMantenimientoPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [log, setLog] = useState('');
  const [doneDates, setDoneDates] = useState<Record<string, string>>({});

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/');
        setReady(true);
        return;
      }
      const { data: rows } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['owner', 'admin', 'moderator', 'analyst']);
      const roles = (rows ?? []) as { role: Role }[];
      const priority: Role[] = ['owner', 'admin', 'moderator', 'analyst'];
      const r = priority.find((p) => roles.some((x) => x.role === p)) ?? null;
      if (!canManageTeam(r)) {
        router.replace('/admin/moderation');
        setReady(true);
        return;
      }
      setAllowed(true);
      try {
        setLog(localStorage.getItem(LS_LOG) ?? '');
      } catch {
        setLog('');
      }
      setDoneDates(loadDoneDates());
      setReady(true);
    })();
  }, [router]);

  const persistLog = useCallback((v: string) => {
    setLog(v);
    try {
      localStorage.setItem(LS_LOG, v);
    } catch {
      /* ignore */
    }
  }, []);

  const markDone = useCallback((slug: string) => {
    const d = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Mexico_City' });
    try {
      localStorage.setItem(LS_DONE_PREFIX + slug, d);
    } catch {
      /* ignore */
    }
    setDoneDates((prev) => ({ ...prev, [slug]: d }));
  }, []);

  const clearDone = useCallback(() => {
    for (const row of SCHEDULE_ROWS) {
      try {
        localStorage.removeItem(LS_DONE_PREFIX + row.slug);
      } catch {
        /* ignore */
      }
    }
    setDoneDates({});
  }, []);

  const insertTemplate = useCallback(() => {
    const line = `\n### ${new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Mexico_City' })} — Mensual — \n\n- **Áreas tocadas:** \n- **Resultado:** OK / Ajustes / Pendiente\n- **Cambios concretos:** \n- **Notas:** \n\n---\n`;
    persistLog((log || '').trimEnd() + line);
  }, [log, persistLog]);

  const freqBadge = useMemo(() => {
    const map: Record<string, string> = {
      Diaria: 'bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200',
      Semanal: 'bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200',
      Mensual: 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200',
      Trimestral: 'bg-orange-100 dark:bg-orange-900/40 text-orange-900 dark:text-orange-200',
      'Anual / incidente': 'bg-rose-100 dark:bg-rose-900/40 text-rose-900 dark:text-rose-200',
    };
    return map;
  }, []);

  if (!ready) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-gray-500 dark:text-gray-400">
        Cargando…
      </div>
    );
  }

  if (!allowed) {
    return null;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-8 pb-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap items-start gap-4 justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
              <NotebookPen className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                Mantenimiento
              </h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 max-w-xl">
                Agenda tipo cuaderno: calendario, prompts para IA e historial local en este navegador.
                Alineado con <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">docs/AGENDA_MANTENIMIENTO_OPERACIONES.md</code>.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/operaciones/trabajo"
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              Trabajo
            </Link>
            <Link
              href="/admin/health"
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              Health
            </Link>
            <a
              href="https://vercel.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              Vercel
              <ExternalLink className="h-3.5 w-3.5 opacity-70" />
            </a>
          </div>
        </div>

        <nav className="mt-6 flex flex-wrap gap-2">
          {TOC.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              className="text-xs font-medium px-2.5 py-1 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              {label}
            </a>
          ))}
        </nav>
      </header>

      <section id="resumen" className="scroll-mt-24 mb-12">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-4">
          <Wrench className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          Resumen eficiente
        </h2>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] p-5 space-y-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          <p>
            <strong className="text-gray-900 dark:text-gray-100">Amazon:</strong>{' '}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">AMAZON_ASSOCIATE_TAG</code> y{' '}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG</code>{' '}
            iguales al ID en Associates. Prefiere URLs{' '}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">/dp/ASIN</code>;{' '}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">amzn.to</code> /{' '}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">a.co</code> el servidor intenta expandirlos antes del tag.
          </p>
          <p>
            <strong className="text-gray-900 dark:text-gray-100">Mercado Libre:</strong> si tienes{' '}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">ML_AFFILIATE_TAG</code>, la app añade{' '}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">?tag=</code> en fichas. Si eres{' '}
            <strong className="text-gray-900 dark:text-gray-100">colaborador</strong> y al compartir ML te da{' '}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">matt_word</code> +{' '}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">matt_tool</code> (sin{' '}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">tag</code>), configura{' '}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">ML_MATT_WORD</code> y{' '}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">ML_MATT_TOOL</code> (o{' '}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">NEXT_PUBLIC_*</code>): la app los inyecta en URLs ML al aprobar. No copies{' '}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">ref</code>,{' '}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">matt_tracing_id</code> ni timestamps; son por sesión.
          </p>
          <p>
            <strong className="text-gray-900 dark:text-gray-100">Bot:</strong>{' '}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">BOT_INGEST_AUTO_APPROVE=0</code> para todo en moderación.
            Revisa trimestralmente URLs y umbrales. Comprueba{' '}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">bot_ingest_paused</code> vs intención real.
          </p>
          <p>
            <strong className="text-gray-900 dark:text-gray-100">Tiempo:</strong> diario = moderar; semanal ≈ 15 min (bot + errores); mensual/trimestral = tabla + historial abajo.
          </p>
        </div>
      </section>

      <section id="calendario" className="scroll-mt-24 mb-12">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-4">
          <CalendarClock className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          Calendario sugerido
        </h2>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-[#1a1a1a]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 text-left">
                  <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300 w-28">Frecuencia</th>
                  <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">Área</th>
                  <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[200px]">Qué revisar</th>
                  <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">Dónde</th>
                  <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300 w-36">Seguimiento</th>
                </tr>
              </thead>
              <tbody>
                {SCHEDULE_ROWS.map((row) => (
                  <tr
                    key={row.slug}
                    className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50/80 dark:hover:bg-gray-900/30"
                  >
                    <td className="px-3 py-3 align-top">
                      <span
                        className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-md ${freqBadge[row.freq] ?? 'bg-gray-100 dark:bg-gray-800'}`}
                      >
                        {row.freq}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top font-medium text-gray-900 dark:text-gray-100">{row.area}</td>
                    <td className="px-3 py-3 align-top text-gray-600 dark:text-gray-400">{row.task}</td>
                    <td className="px-3 py-3 align-top text-gray-600 dark:text-gray-400">{row.where}</td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => markDone(row.slug)}
                          className="text-xs font-medium text-purple-700 dark:text-purple-300 hover:underline text-left"
                        >
                          Hecho hoy
                        </button>
                        {doneDates[row.slug] ? (
                          <span className="text-[11px] text-gray-500 dark:text-gray-500">
                            Último: {doneDates[row.slug]}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 flex justify-end">
            <button
              type="button"
              onClick={clearDone}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              Limpiar fechas “Hecho hoy”
            </button>
          </div>
        </div>
      </section>

      <section id="prompts" className="scroll-mt-24 mb-12">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-4">
          <ClipboardList className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          Prompts para IA
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Sustituye <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">[PEGAR AQUÍ]</code> y copia al chat.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {PROMPTS.map((p) => (
            <PromptCard key={p.id} title={p.title} body={p.body} />
          ))}
        </div>
      </section>

      <section id="historial" className="scroll-mt-24 mb-12">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-4">
          <NotebookPen className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          Historial de revisiones
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Se guarda solo en <strong className="text-gray-800 dark:text-gray-200">este navegador</strong> (localStorage). Exporta copiando el texto si cambias de equipo.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            type="button"
            onClick={insertTemplate}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200 hover:bg-purple-200 dark:hover:bg-purple-900/60"
          >
            Insertar plantilla (fecha CDMX)
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(log);
              } catch {
                /* ignore */
              }
            }}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Copiar todo
          </button>
        </div>
        <textarea
          value={log}
          onChange={(e) => persistLog(e.target.value)}
          rows={14}
          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] text-gray-900 dark:text-gray-100 text-sm font-mono p-4 leading-relaxed placeholder:text-gray-400 focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 outline-none resize-y min-h-[280px]"
          placeholder="### YYYY-MM-DD — Mensual — iniciales&#10;&#10;- **Áreas tocadas:**&#10;- **Resultado:**&#10;..."
          spellCheck={false}
        />
      </section>

      <section id="indice" className="scroll-mt-24 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Qué requiere mantenimiento</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {INDEX_ITEMS.map((item) => (
            <div
              key={item.title}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] p-4"
            >
              <h3 className="font-medium text-gray-900 dark:text-gray-100 text-sm">{item.title}</h3>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 leading-snug">{item.why}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
