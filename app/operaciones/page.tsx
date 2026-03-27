'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ClientLayout from '@/app/ClientLayout';
import {
  ClipboardCheck,
  Gauge,
  Users,
  Sparkles,
  LayoutDashboard,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Database,
  Layers,
  Radio,
  Bug,
  Eye,
  Bell,
  ExternalLink,
  BookOpen,
  TrendingUp,
  Wrench,
  Target,
  FlaskConical,
} from 'lucide-react';
import {
  applyAlertConfigToAreas,
  deriveAreaStatusesFromIntegrity,
  type AreaId,
  type AreaStatus,
  type PulseAlerts,
} from '@/lib/operations/areaHealth';

type IntegrityCheck = { name: string; ok: boolean; detail: string };
type IntegrityResult = {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  checks: IntegrityCheck[];
  summary: { total: number; failed: number; passed: number };
};

const AREA_META: Record<
  AreaId,
  { title: string; description: string; icon: typeof Database }
> = {
  datos: {
    title: 'Datos y catálogo',
    description: 'Categorías canónicas, cupones bancarios y coherencia en `offers`.',
    icon: Database,
  },
  vista: {
    title: 'Vista y ranking',
    description: 'La vista `ofertas_ranked_general` responde con las columnas esperadas.',
    icon: Layers,
  },
  feed: {
    title: 'Feed y home',
    description: 'El feed principal carga ofertas (smoke test en servidor).',
    icon: Radio,
  },
  runtime: {
    title: 'Runtime',
    description: 'Sin excepciones durante el chequeo automático.',
    icon: Bug,
  },
  observabilidad: {
    title: 'Observabilidad',
    description: 'Resumen global del último chequeo de integridad.',
    icon: Eye,
  },
  alertas: {
    title: 'Alertas ante fallos',
    description: 'Webhook y/o correo cuando falle el cron de integridad (variables en Vercel).',
    icon: Bell,
  },
};

function statusLabel(s: AreaStatus): string {
  switch (s) {
    case 'ok':
      return 'Bien';
    case 'warn':
      return 'Revisar';
    case 'fail':
      return 'Crítico';
    default:
      return 'Sin datos';
  }
}

function statusClasses(s: AreaStatus): string {
  switch (s) {
    case 'ok':
      return 'bg-emerald-500';
    case 'warn':
      return 'bg-amber-500';
    case 'fail':
      return 'bg-red-500';
    default:
      return 'bg-gray-400 dark:bg-gray-500';
  }
}

function OperacionesPageInner() {
  const router = useRouter();
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null);
  const [integrityLoading, setIntegrityLoading] = useState(true);
  const [integrityRunning, setIntegrityRunning] = useState(false);
  const [integrityError, setIntegrityError] = useState<string | null>(null);
  const [pulse, setPulse] = useState<PulseAlerts | null>(null);
  const [pulseError, setPulseError] = useState<string | null>(null);
  const [showTesterOffers, setShowTesterOffers] = useState(false);
  const [testerOffersSaving, setTesterOffersSaving] = useState(false);

  const areaStatuses = useMemo(() => {
    const base = deriveAreaStatusesFromIntegrity(integrity);
    return applyAlertConfigToAreas(base, pulse);
  }, [integrity, pulse]);

  useEffect(() => {
    const supabase = createClient();

    const loadPanel = async (runIntegrityNow = false) => {
      setIntegrityError(null);
      setPulseError(null);
      if (runIntegrityNow) setIntegrityRunning(true);
      else setIntegrityLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          setIntegrityError('Sin sesión para consultar el panel');
          return;
        }

        const [pulseRes, intRes, testerRes] = await Promise.all([
          fetch('/api/admin/operations-pulse', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/admin/system-integrity${runIntegrityNow ? '?run=1' : ''}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/app-config?key=show_tester_offers'),
        ]);

        const pulseBody = await pulseRes.json().catch(() => ({}));
        if (!pulseRes.ok) {
          setPulseError(pulseBody?.error ?? 'No se pudo leer el pulso operativo');
        } else {
          setPulse((pulseBody?.alerts ?? null) as PulseAlerts | null);
        }

        const intBody = await intRes.json().catch(() => ({}));
        if (!intRes.ok) {
          setIntegrityError(intBody?.error ?? 'No se pudo obtener estado de integridad');
          return;
        }
        setIntegrity((intBody?.result ?? null) as IntegrityResult | null);
        const testerBody = await testerRes.json().catch(() => ({}));
        setShowTesterOffers(testerBody?.value === true);
      } catch {
        setIntegrityError('Error de red al cargar el panel');
        setPulseError('Error de red al cargar alertas');
      } finally {
        setIntegrityLoading(false);
        setIntegrityRunning(false);
      }
    };

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
          if (!data) {
            router.replace('/');
            return;
          }
          loadPanel(false).catch(() => {});
        });
    });

    const refreshTimer = window.setInterval(() => {
      loadPanel(false).catch(() => {});
    }, 60_000);

    return () => window.clearInterval(refreshTimer);
  }, [router]);

  const runIntegrityManual = async () => {
    const supabase = createClient();
    setIntegrityError(null);
    setPulseError(null);
    setIntegrityRunning(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setIntegrityError('Sin sesión para ejecutar chequeo');
        return;
      }
      const [pulseRes, intRes] = await Promise.all([
        fetch('/api/admin/operations-pulse', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/admin/system-integrity?run=1', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const pulseBody = await pulseRes.json().catch(() => ({}));
      if (pulseRes.ok) setPulse((pulseBody?.alerts ?? null) as PulseAlerts | null);
      const intBody = await intRes.json().catch(() => ({}));
      if (!intRes.ok) {
        setIntegrityError(intBody?.error ?? 'No se pudo ejecutar chequeo');
        return;
      }
      setIntegrity((intBody?.result ?? null) as IntegrityResult | null);
    } catch {
      setIntegrityError('Error de red al ejecutar chequeo');
    } finally {
      setIntegrityRunning(false);
      setIntegrityLoading(false);
    }
  };

  const setTesterOffersEnabled = async (enabled: boolean) => {
    const supabase = createClient();
    setTesterOffersSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch('/api/admin/app-config', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key: 'show_tester_offers', value: enabled }),
      });
      if (res.ok) setShowTesterOffers(enabled);
    } finally {
      setTesterOffersSaving(false);
    }
  };

  if (isOwner === null) {
    return (
      <ClientLayout>
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-500 dark:text-gray-400">Cargando…</p>
        </div>
      </ClientLayout>
    );
  }

  if (!isOwner) return null;

  const healthOk = Boolean(integrity?.ok);
  const alertsOptionalMissing = areaStatuses.alertas === 'warn';

  return (
    <ClientLayout>
      <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0a0a0a]">
        <div className="max-w-5xl mx-auto px-4 py-8 md:py-10 pb-28 md:pb-10">
          <header className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400">
                <ClipboardCheck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
                  Centro de operaciones
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Mapa por áreas, pulso del producto y guía para escalar sin ir a ciegas.
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mt-4 pl-0 md:pl-14">
              Documentación viva:{' '}
              <Link href="/contexto" className="font-medium text-violet-600 dark:text-violet-400 hover:underline">
                Contexto
              </Link>
              , checklist técnico en el repo (<code className="text-xs text-gray-500">docs/CHECKLIST_SISTEMA_VIVO.md</code>
              ) y documento maestro (<code className="text-xs text-gray-500">docs/DOCUMENTO_MAESTRO_AVENTA.md</code>).
            </p>
          </header>

          <div className="space-y-6">
            <section className="rounded-2xl border border-violet-200/80 dark:border-violet-800/50 bg-violet-50/50 dark:bg-violet-950/25 p-5 md:p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Target className="h-5 w-5 text-violet-600 dark:text-violet-400 shrink-0" />
                    Dónde estamos hoy
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">
                    Tienes categorías unificadas en código, pruebas de contrato en CI, chequeo diario de integridad (plan
                    Hobby: una vez al día) y este panel para ver el estado por zonas. Eso es una base seria para
                    lanzar; lo que falta suele ser configuración (alertas, revisión humana de moderación) y tráfico real.
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1 text-right">
                  <div
                    className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                      healthOk
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200'
                        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100'
                    }`}
                  >
                    {healthOk ? 'Chequeo automático OK' : 'Revisar integridad abajo'}
                  </div>
                  {healthOk && alertsOptionalMissing ? (
                    <span className="text-[10px] text-amber-700 dark:text-amber-300 max-w-56">
                      Opcional: configura alertas en Vercel para avisos sin entrar aquí
                    </span>
                  ) : null}
                </div>
              </div>
              <ul className="mt-4 text-sm text-gray-600 dark:text-gray-400 space-y-2 list-disc list-inside">
                <li>
                  <strong className="text-gray-800 dark:text-gray-200">Producto:</strong> feed, categorías, cupón
                  bancario y formulario alineados con la API y la BD (si migraste SQL en Supabase).
                </li>
                <li>
                  <strong className="text-gray-800 dark:text-gray-200">Calidad:</strong> GitHub Actions ejecuta
                  contratos + build en cada push a <code className="text-xs">master</code>.
                </li>
                <li>
                  <strong className="text-gray-800 dark:text-gray-200">Confianza:</strong> el bloque de integridad abajo
                  confirma datos + vista + feed en el servidor.
                </li>
                <li>
                  <strong className="text-gray-800 dark:text-gray-200">Antes de un lanzamiento fuerte:</strong>{' '}
                  <Link href="/admin/moderation" className="text-violet-600 dark:text-violet-400 font-medium hover:underline">
                    cola de moderación
                  </Link>
                  , políticas legales enlazadas en el footer, y alertas configuradas en Vercel (sección siguiente).
                </li>
              </ul>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <Gauge className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-gray-100">Mapa por áreas (semáforos)</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Resumen visual. Los datos salen del último chequeo de integridad y del entorno en Vercel (sin ver
                    secretos).
                  </p>
                </div>
              </div>
              {pulseError ? (
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">{pulseError}</p>
              ) : null}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(Object.keys(AREA_META) as AreaId[]).map((id) => {
                  const meta = AREA_META[id];
                  const Icon = meta.icon;
                  const st = areaStatuses[id];
                  return (
                    <div
                      key={id}
                      className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-3 flex gap-3 items-start"
                    >
                      <span
                        className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${statusClasses(st)}`}
                        title={statusLabel(st)}
                      />
                      <div>
                        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                          {meta.title}
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-snug">{meta.description}</p>
                        <p className="text-[10px] font-medium text-gray-600 dark:text-gray-300 mt-1.5">{statusLabel(st)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
                  <FlaskConical className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-gray-100">Control owner: ofertas tester</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Solo para pruebas visuales internas. No usar durante campañas reales.
                  </p>
                </div>
              </div>
              <label className="inline-flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/15 px-3 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTesterOffers}
                  disabled={testerOffersSaving}
                  onChange={(e) => setTesterOffersEnabled(e.target.checked)}
                  className="rounded border-gray-400 text-amber-500 focus:ring-amber-500 disabled:opacity-50"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {showTesterOffers ? 'Tester activado en home' : 'Tester desactivado en home'}
                </span>
              </label>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <Bell className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-gray-100">Alertas automáticas (Vercel)</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Cuando el cron <code className="text-[10px]">/api/cron/system-integrity</code> detecta fallos, el
                    servidor puede avisar por webhook (Slack, Discord, etc.) y/o correo. Configúralo en el proyecto de
                    Vercel, no en el código.
                  </p>
                </div>
              </div>
              <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-2 list-decimal list-inside mb-4">
                <li>
                  En Vercel: tu proyecto → <strong>Settings</strong> → <strong>Environment Variables</strong>.
                </li>
                <li>
                  Añade para <strong>Production</strong> (y Preview si quieres pruebas):
                </li>
              </ol>
              <ul className="text-sm space-y-2 mb-4 pl-2 border-l-2 border-violet-200 dark:border-violet-800">
                <li className="flex flex-wrap items-center gap-2">
                  <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">SYSTEM_ALERT_EMAIL_TO</code>
                  <span className="text-gray-600 dark:text-gray-400">= tu correo</span>
                  {pulse ? (
                    pulse.emailToConfigured ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="Configurado" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-500" aria-label="No configurado" />
                    )
                  ) : null}
                </li>
                <li className="flex flex-wrap items-center gap-2">
                  <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">SYSTEM_ALERT_WEBHOOK_URL</code>
                  <span className="text-gray-600 dark:text-gray-400">= URL del webhook (opcional)</span>
                  {pulse ? (
                    pulse.webhookConfigured ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="Configurado" />
                    ) : (
                      <span className="text-[10px] text-gray-500">(opcional)</span>
                    )
                  ) : null}
                </li>
                <li className="flex flex-wrap items-center gap-2">
                  <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">RESEND_API_KEY</code>
                  <span className="text-gray-600 dark:text-gray-400">= necesario para que el correo de alerta se envíe</span>
                  {pulse ? (
                    pulse.resendConfigured ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="Configurado" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-500" aria-label="Falta para email" />
                    )
                  ) : null}
                </li>
              </ul>
              <p className="text-xs text-gray-500 dark:text-gray-500 mb-2">
                Tras guardar variables, redepliega. Los iconos arriba solo indican si el entorno de producción tiene esas
                variables (no muestran valores).
              </p>
              <a
                href="https://vercel.com/docs/environment-variables"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline"
              >
                Documentación de variables en Vercel
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <TrendingUp className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-gray-100">Capacidad y cuándo invertir más</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Orientación práctica; los números exactos están en cada proveedor.
                  </p>
                </div>
              </div>
              <div className="space-y-4 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                <div>
                  <p className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <Database className="h-4 w-4 text-violet-500" />
                    Supabase (base de datos)
                  </p>
                  <p className="mt-1">
                    En el dashboard de Supabase revisa <strong>Usage</strong>: tamaño de base de datos, transferencia,
                    usuarios de Auth (MAU) y conexiones. Si ves uso alto de forma sostenida (&gt;~80%) o errores de “too
                    many connections”, considera subir de plan o optimizar consultas/índices. Los backups y el pooler
                    (Supavisor) importan cuando crece el tráfico.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-800 dark:text-gray-200">Vercel</p>
                  <p className="mt-1">
                    En <strong>Hobby</strong>, los crons son como máximo <strong>una vez al día</strong> por cron; para
                    más frecuencia o más crons simultáneos hace falta <strong>Pro</strong>. Revisa límites de ancho de
                    banda y tiempo de función si el sitio crece.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-800 dark:text-gray-200">Redis / rate limiting</p>
                  <p className="mt-1">
                    Si usas Upstash u otro Redis para límites de peticiones, revisa allí las peticiones y memoria cuando
                    el tráfico suba.
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <Wrench className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-gray-100">Mantenimiento y qué revisar</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Rutina sugerida para no perder el control.</p>
                </div>
              </div>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2 list-disc list-inside">
                <li>
                  <strong className="text-gray-800 dark:text-gray-200">Semanal:</strong> checklist en{' '}
                  <code className="text-xs">docs/CHECKLIST_SISTEMA_VIVO.md</code>, moderación, y un vistazo a métricas en{' '}
                  <Link href="/admin/metrics" className="text-violet-600 dark:text-violet-400 font-medium hover:underline">
                    /admin/metrics
                  </Link>
                  .
                </li>
                <li>
                  <strong className="text-gray-800 dark:text-gray-200">Antes de campañas:</strong> ejecutar integridad
                  manual aquí abajo y confirmar que las alertas en Vercel están en verde.
                </li>
                <li>
                  <strong className="text-gray-800 dark:text-gray-200">Cuando cambies reglas de negocio:</strong>{' '}
                  actualizar contratos en <code className="text-xs">tests/contracts</code> para que CI las proteja.
                </li>
              </ul>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Lanzamiento y checklist</h2>
              </div>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2 list-disc list-inside mb-4">
                <li>Cola de moderación sin ofertas críticas pendientes demasiado tiempo.</li>
                <li>Integridad y alertas configuradas antes de picos de tráfico.</li>
                <li>Avisos del sitio actualizados si hay promo o cambio de reglas.</li>
              </ul>
              <p className="text-xs text-gray-500 dark:text-gray-500 flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 shrink-0" />
                En el repo: <code className="text-gray-600 dark:text-gray-400">docs/LAUNCH_CHECKLIST_BETA.md</code>,{' '}
                <code className="text-gray-600 dark:text-gray-400">docs/AUDITORIA_PRE_LANZAMIENTO.md</code> (si existen).
              </p>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                    <Gauge className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-gray-900 dark:text-gray-100">Estado automático del sistema</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Chequeo diario por cron + refresco visual cada minuto + ejecución manual cuando quieras.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => runIntegrityManual()}
                  disabled={integrityRunning}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-violet-50/60 dark:hover:bg-violet-900/20 disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${integrityRunning ? 'animate-spin' : ''}`} />
                  {integrityRunning ? 'Ejecutando…' : 'Ejecutar ahora'}
                </button>
              </div>

              {integrityLoading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Cargando estado…</p>
              ) : integrityError ? (
                <p className="text-sm text-amber-600 dark:text-amber-400">{integrityError}</p>
              ) : integrity ? (
                <div className="space-y-3">
                  <div
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      integrity.ok
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                    }`}
                  >
                    {integrity.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    {integrity.ok ? 'Integridad OK' : `Integridad con fallos (${integrity.summary.failed})`}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Última ejecución: {new Date(integrity.finishedAt).toLocaleString('es-MX')}
                  </p>
                  <div className="grid gap-2">
                    {integrity.checks.map((check) => (
                      <div key={check.name} className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs">
                        <p
                          className={`font-semibold ${
                            check.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'
                          }`}
                        >
                          {check.ok ? 'OK' : 'FALLO'} · {check.name}
                        </p>
                        <p className="mt-1 text-gray-600 dark:text-gray-400">{check.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">Sin datos previos de integridad.</p>
              )}
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <Gauge className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Atajos críticos</h2>
              </div>
              <div className="grid gap-2">
                <Link
                  href="/admin/moderation"
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-violet-50/60 dark:hover:bg-violet-900/15 transition-colors"
                >
                  <span className="flex items-center gap-2">Moderación pendientes</span>
                  <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
                </Link>
                <Link
                  href="/admin/metrics"
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-violet-50/60 dark:hover:bg-violet-900/15 transition-colors"
                >
                  <span className="flex items-center gap-2">Métricas</span>
                  <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
                </Link>
                <Link
                  href="/admin/users"
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-violet-50/60 dark:hover:bg-violet-900/15 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    Usuarios
                  </span>
                  <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
                </Link>
                <Link
                  href="/contexto"
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-violet-50/60 dark:hover:bg-violet-900/15 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <LayoutDashboard className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    Contexto (mapa completo)
                  </span>
                  <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
                </Link>
              </div>
            </section>

            <section className="rounded-2xl border border-violet-200/80 dark:border-violet-800/50 bg-violet-50/50 dark:bg-violet-950/25 p-5 md:p-6">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Crecimiento y “marea”</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-3">
                Ajusta cuánto pesa el like de cuentas concretas en el ranking (útil al inicio). Ejecuta en Supabase la
                migración SQL y luego usa el panel admin.
              </p>
              <Link
                href="/admin/vote-weights"
                className="inline-flex items-center gap-2 text-sm font-semibold text-violet-600 dark:text-violet-400 hover:underline"
              >
                Ir a Peso de voto
                <ArrowRight className="h-4 w-4" />
              </Link>
            </section>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}

export default function OperacionesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] dark:bg-[#0a0a0a]">
          <p className="text-gray-500 dark:text-gray-400">Cargando…</p>
        </div>
      }
    >
      <OperacionesPageInner />
    </Suspense>
  );
}
