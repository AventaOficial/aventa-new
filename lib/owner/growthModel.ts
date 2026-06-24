/**
 * Modelo de etapas de crecimiento AVENTA — referencia para panel owner.
 * Costos: orientativos (USD/MXN aprox.); validar en paneles de cada proveedor.
 */

export type GrowthStageId = 'seed' | 'beta' | 'growth' | 'scale' | 'expansion' | 'million';

export type GrowthStage = {
  id: GrowthStageId;
  label: string;
  mauMin: number;
  mauMax: number | null;
  headline: string;
  focus: string;
};

export const GROWTH_STAGES: GrowthStage[] = [
  {
    id: 'seed',
    label: 'Semilla',
    mauMin: 0,
    mauMax: 999,
    headline: 'Validar producto y contenido',
    focus: 'Ofertas reales, moderación rápida, primeros cazadores.',
  },
  {
    id: 'beta',
    label: 'Beta',
    mauMin: 1_000,
    mauMax: 9_999,
    headline: 'Retención y comunidad',
    focus: 'Feed estable, guías, métricas semanales, afiliados verificados.',
  },
  {
    id: 'growth',
    label: 'Crecimiento',
    mauMin: 10_000,
    mauMax: 49_999,
    headline: 'Escalar lectura del feed',
    focus: 'Cache Redis, stress test, unificar APIs, cola de eventos en prod.',
  },
  {
    id: 'scale',
    label: 'Escala',
    mauMin: 50_000,
    mauMax: 199_999,
    headline: 'Infra de pago y ranking precomputado',
    focus: 'Supabase Pro, Upstash pago, read replica, optimizar Postgres.',
  },
  {
    id: 'expansion',
    label: 'Expansión',
    mauMin: 200_000,
    mauMax: 999_999,
    headline: 'Alta concurrencia y equipo',
    focus: 'Vercel Pro/Team, CDN agresivo, cola de votos, observabilidad 24/7.',
  },
  {
    id: 'million',
    label: 'Camino al millón',
    mauMin: 1_000_000,
    mauMax: null,
    headline: 'Plataforma madura',
    focus: 'Microservicios selectivos, data pipeline, SLA comercial.',
  },
];

export type InfraCostTier = {
  id: string;
  name: string;
  currentPlanHint: string;
  freeLimitNote: string;
  upgradeWhen: string[];
  costReferenceMxn: { min: number; max: number; note: string };
  panelUrl: string;
  envKeys: string[];
};

export const INFRA_COST_TIERS: InfraCostTier[] = [
  {
    id: 'vercel',
    name: 'Vercel (hosting)',
    currentPlanHint: 'Hobby / Pro según tu cuenta',
    freeLimitNote: 'Hobby: crons limitados, funciones serverless con techo de concurrencia.',
    upgradeWhen: [
      'Crons cada 15 min (bot) sin depender de cron externo',
      'Picos >400 usuarios concurrentes',
      'Necesitas más maxDuration o equipo',
    ],
    costReferenceMxn: { min: 0, max: 400, note: 'Hobby $0 · Pro ~$20 USD/mes (~$340 MXN)' },
    panelUrl: 'https://vercel.com/dashboard',
    envKeys: [],
  },
  {
    id: 'supabase',
    name: 'Supabase (BD + Auth + Storage)',
    currentPlanHint: 'Free / Pro según panel Supabase',
    freeLimitNote: 'Free: límites de conexiones, storage ~500MB, pausa por inactividad.',
    upgradeWhen: [
      'Más de ~10k MAU con picos de lectura',
      'Storage de imágenes >1 GB',
      'Conexiones agotadas (errores 503/timeout en APIs)',
    ],
    costReferenceMxn: { min: 0, max: 500, note: 'Pro ~$25 USD/mes (~$430 MXN) + uso' },
    panelUrl: 'https://supabase.com/dashboard',
    envKeys: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
  },
  {
    id: 'upstash',
    name: 'Upstash Redis (rate limit)',
    currentPlanHint: 'Free — plan AVENTA',
    freeLimitNote: 'Free: ~500k comandos/mes. Sin Redis en prod → límites incoherentes por instancia.',
    upgradeWhen: [
      'Comandos Redis >400k/mes (revisar panel Upstash → Usage)',
      'Tráfico multi-región',
      'Muchos 429 legítimos en feed/votos',
    ],
    costReferenceMxn: { min: 0, max: 200, note: 'Pay-as-you-go desde ~$10 USD/mes según uso' },
    panelUrl: 'https://console.upstash.com',
    envKeys: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
  },
  {
    id: 'resend',
    name: 'Resend (correos)',
    currentPlanHint: 'Free tier / plan según envíos',
    freeLimitNote: 'Límite diario de envíos en free; digest y notificaciones consumen cuota.',
    upgradeWhen: ['Digest diario a miles de usuarios', 'Bounces altos o cola de correo'],
    costReferenceMxn: { min: 0, max: 350, note: 'Según volumen de emails/mes' },
    panelUrl: 'https://resend.com/overview',
    envKeys: ['RESEND_API_KEY'],
  },
  {
    id: 'domain',
    name: 'Dominio aventaofertas.com',
    currentPlanHint: 'Registro anual',
    freeLimitNote: 'Renovación anual aparte de Vercel.',
    upgradeWhen: ['Renovación próxima — calendarizar'],
    costReferenceMxn: { min: 300, max: 600, note: 'Registro .com ~$15–30 USD/año' },
    panelUrl: '',
    envKeys: ['NEXT_PUBLIC_APP_URL'],
  },
];

export type RoadmapPhase = {
  id: string;
  userRange: string;
  title: string;
  codeStatus: 'done' | 'partial' | 'pending';
  items: string[];
};

export const GROWTH_ROADMAP: RoadmapPhase[] = [
  {
    id: 'r1',
    userRange: '0 – 10k MAU',
    title: 'Base lanzable',
    codeStatus: 'done',
    items: [
      'Feed Día a día / Top / Recientes / Para ti',
      'Moderación + owner dashboard',
      'Rate limit Upstash + cola write_queue',
      'Onboarding + guías Descubre',
    ],
  },
  {
    id: 'r2',
    userRange: '10k – 50k MAU',
    title: 'Escala lectura',
    codeStatus: 'partial',
    items: [
      'Feed solo vía /api/feed/home (sin Supabase en browser) ✓',
      'Cache Redis del feed 30–60 s',
      'Stress test escenario D (400–700 concurrentes)',
      'EVENT_WRITE_MODE=queue + cron process-write-queue',
    ],
  },
  {
    id: 'r3',
    userRange: '50k – 200k MAU',
    title: 'Escala escritura y BD',
    codeStatus: 'pending',
    items: [
      'Ranking precomputado (REFRESH vista / job cron)',
      'Supabase Pro + connection pooling',
      'Read replica para feeds públicos',
      'Índices optimizados (EXPLAIN en queries calientes)',
    ],
  },
  {
    id: 'r4',
    userRange: '200k – 1M MAU',
    title: 'Plataforma madura',
    codeStatus: 'pending',
    items: [
      'Cola de votos bajo pico viral',
      'CDN + edge cache agresivo en assets',
      'Observabilidad (SLO, alertas p95)',
      'Equipo moderación + runbooks',
    ],
  },
];

export function resolveGrowthStage(totalUsers: number): {
  current: GrowthStage;
  next: GrowthStage | null;
  progressToNextPct: number | null;
  progressToMillionPct: number;
} {
  const current =
    GROWTH_STAGES.find((s) => totalUsers >= s.mauMin && (s.mauMax == null || totalUsers <= s.mauMax)) ??
    GROWTH_STAGES[0];
  const idx = GROWTH_STAGES.indexOf(current);
  const next = idx < GROWTH_STAGES.length - 1 ? GROWTH_STAGES[idx + 1] : null;
  let progressToNextPct: number | null = null;
  if (next && current.mauMax != null) {
    const span = next.mauMin - current.mauMin;
    progressToNextPct = span > 0 ? Math.min(100, Math.round(((totalUsers - current.mauMin) / span) * 100)) : 0;
  }
  const progressToMillionPct = Math.min(100, Math.round((totalUsers / 1_000_000) * 10000) / 100);
  return { current, next, progressToNextPct, progressToMillionPct };
}
