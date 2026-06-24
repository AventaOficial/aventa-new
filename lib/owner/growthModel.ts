/**
 * Catálogo de costos AVENTA — precios públicos (USD) verificados jun 2026.
 * Fuentes: vercel.com/pricing, supabase.com/pricing, upstash.com/pricing/redis, resend.com/pricing
 */

/** Tipo de cambio orientativo para mostrar MXN (actualizar si lo necesitas). */
export const BILLING_USD_MXN = 17.2;

export const BILLING_PRICING_AS_OF = '2026-06-24';

/** Pago real registrado por el owner. */
export const AVENTA_DOMAIN_PAYMENT = {
  paidAt: '2026-02-27',
  amountUsd: 11.25,
  renewsApprox: '2027-02-27',
  registrarNote: 'Registro anual del dominio',
} as const;

export type InfraCostTier = {
  id: string;
  name: string;
  /** Plan que usa AVENTA hoy */
  aventaPlan: string;
  /** Uso actual conocido (panel del proveedor) */
  usageSnapshot: string;
  /** Precio público del plan actual (texto) */
  listPriceLabel: string;
  /** Costo mensual equivalente en USD para AVENTA hoy */
  currentMonthlyUsd: number;
  /** Próximo plan recomendado y su precio */
  nextTierLabel: string;
  nextTierMonthlyUsd: number;
  freeLimitNote: string;
  upgradeWhen: string[];
  panelUrl: string;
  pricingUrl: string;
  envKeys: string[];
  /** Nota de pago real (dominio, etc.) */
  billingNote?: string;
};

export const INFRA_COST_TIERS: InfraCostTier[] = [
  {
    id: 'vercel',
    name: 'Vercel (hosting)',
    aventaPlan: 'Hobby',
    usageSnapshot: 'Proyecto aventa-new en producción',
    listPriceLabel: '$0 USD/mes (Hobby, uso personal/comercial limitado)',
    currentMonthlyUsd: 0,
    nextTierLabel: 'Pro — $20 USD/mes por asiento + $20 crédito de uso',
    nextTierMonthlyUsd: 20,
    freeLimitNote:
      'Hobby: crons máx. 1×/día por job en vercel.json, límites de ancho de banda y funciones serverless.',
    upgradeWhen: [
      'Crons del bot cada ~15 min sin cron externo',
      'Picos >400 usuarios concurrentes',
      'Equipo con más de 1 desarrollador desplegando',
    ],
    panelUrl: 'https://vercel.com/dashboard',
    pricingUrl: 'https://vercel.com/pricing',
    envKeys: [],
  },
  {
    id: 'supabase',
    name: 'Supabase (BD + Auth + Storage)',
    aventaPlan: 'Free',
    usageSnapshot: '1 proyecto · revisar Storage → offer-images',
    listPriceLabel: '$0 USD/mes (Free: 500 MB BD, 1 GB archivos, 50k MAU)',
    currentMonthlyUsd: 0,
    nextTierLabel: 'Pro — $25 USD/mes por organización (+ $10 crédito compute)',
    nextTierMonthlyUsd: 25,
    freeLimitNote:
      'Free: pausa por inactividad, 5 GB egress/mes, límites de conexiones. Pro incluye 100k MAU, 8 GB BD, 100 GB storage.',
    upgradeWhen: [
      'Más de ~10k MAU o picos de lectura',
      'Storage de imágenes >1 GB',
      'Erroces 503 / timeouts por conexiones agotadas',
    ],
    panelUrl: 'https://supabase.com/dashboard',
    pricingUrl: 'https://supabase.com/pricing',
    envKeys: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
  },
  {
    id: 'upstash',
    name: 'Upstash Redis (rate limit)',
    aventaPlan: 'Free',
    usageSnapshot: 'Revisar Usage en consola (ej. ~6k comandos acumulados)',
    listPriceLabel: '$0 USD/mes (Free: 500k comandos/mes, 256 MB)',
    currentMonthlyUsd: 0,
    nextTierLabel: 'Pay-as-you-go — $0.20 USD por 100k comandos · Fixed 250MB — $10 USD/mes',
    nextTierMonthlyUsd: 10,
    freeLimitNote:
      'Sin UPSTASH_* en Vercel el rate limit cae a memoria por instancia (no escala). Pay-as-you-go: primer 1 GB storage gratis.',
    upgradeWhen: [
      'Usage >400k comandos/mes',
      'Tráfico multi-región estable',
      'Muchos 429 legítimos en feed/votos',
    ],
    panelUrl: 'https://console.upstash.com',
    pricingUrl: 'https://upstash.com/pricing/redis',
    envKeys: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
  },
  {
    id: 'resend',
    name: 'Resend (correos transaccionales)',
    aventaPlan: 'Free',
    usageSnapshot: '52 / 3,000 emails mes · 3 / 100 emails día (jun 2026)',
    listPriceLabel: '$0 USD/mes (Free: 3,000 emails/mes, máx. 100/día)',
    currentMonthlyUsd: 0,
    nextTierLabel: 'Pro — $20 USD/mes (50,000 emails, sin límite diario)',
    nextTierMonthlyUsd: 20,
    freeLimitNote:
      'Digest diario/semanal y notificaciones consumen cuota. Overage Pro: $0.90 USD por 1,000 emails extra.',
    upgradeWhen: [
      'Superas 100 emails/día de forma habitual',
      'Digest a miles de usuarios (>3,000/mes)',
      'Necesitas más dominios verificados (Free: 1)',
    ],
    panelUrl: 'https://resend.com/settings/usage',
    pricingUrl: 'https://resend.com/pricing',
    envKeys: ['RESEND_API_KEY'],
  },
  {
    id: 'domain',
    name: 'Dominio aventaofertas.com',
    aventaPlan: 'Registro anual',
    usageSnapshot: 'Activo · enlazado en NEXT_PUBLIC_APP_URL',
    listPriceLabel: '$11.25 USD/año (pagado 27 feb 2026)',
    currentMonthlyUsd: Math.round((AVENTA_DOMAIN_PAYMENT.amountUsd / 12) * 100) / 100,
    nextTierLabel: 'Renovación ~feb 2027 (precio similar según registrador)',
    nextTierMonthlyUsd: Math.round((AVENTA_DOMAIN_PAYMENT.amountUsd / 12) * 100) / 100,
    freeLimitNote: 'Renovación anual aparte de Vercel. Precio .com típico: $11–15 USD/año.',
    upgradeWhen: ['Renovación próxima — calendarizar antes de feb 2027'],
    panelUrl: '',
    pricingUrl: '',
    envKeys: ['NEXT_PUBLIC_APP_URL'],
    billingNote: `Pagado ${AVENTA_DOMAIN_PAYMENT.paidAt}: $${AVENTA_DOMAIN_PAYMENT.amountUsd} USD. Próxima renovación ~${AVENTA_DOMAIN_PAYMENT.renewsApprox}.`,
  },
];

export type BillingTotals = {
  fxUsdMxn: number;
  pricingAsOf: string;
  /** Suma mensual equivalente de lo que AVENTA paga hoy */
  currentMonthlyUsd: number;
  currentMonthlyMxn: number;
  /** Solo dominio anual (USD) */
  domainAnnualUsd: number;
  domainAnnualMxn: number;
  /** Si activaras planes de pago mínimos de producción */
  prodStackMonthlyUsd: number;
  prodStackMonthlyMxn: number;
  prodStackNote: string;
};

export function computeBillingTotals(tiers: InfraCostTier[] = INFRA_COST_TIERS): BillingTotals {
  const currentMonthlyUsd =
    Math.round(tiers.reduce((sum, t) => sum + t.currentMonthlyUsd, 0) * 100) / 100;
  const prodStackMonthlyUsd = tiers.reduce((sum, t) => {
    if (t.id === 'domain') return sum + t.currentMonthlyUsd;
    return sum + t.nextTierMonthlyUsd;
  }, 0);
  return {
    fxUsdMxn: BILLING_USD_MXN,
    pricingAsOf: BILLING_PRICING_AS_OF,
    currentMonthlyUsd,
    currentMonthlyMxn: Math.round(currentMonthlyUsd * BILLING_USD_MXN),
    domainAnnualUsd: AVENTA_DOMAIN_PAYMENT.amountUsd,
    domainAnnualMxn: Math.round(AVENTA_DOMAIN_PAYMENT.amountUsd * BILLING_USD_MXN),
    prodStackMonthlyUsd,
    prodStackMonthlyMxn: Math.round(prodStackMonthlyUsd * BILLING_USD_MXN),
    prodStackNote:
      'Estimado si subes a Vercel Pro + Supabase Pro + Upstash Fixed $10 + Resend Pro $20 (dominio igual).',
  };
}

export type PrelaunchItem = {
  id: string;
  title: string;
  detail: string;
  status: 'done' | 'partial' | 'pending';
  href?: string;
};

export const PRELAUNCH_CHECKLIST_TEMPLATE: Omit<PrelaunchItem, 'status'>[] = [
  {
    id: 'feed-api',
    title: 'Feed home solo vía API',
    detail: 'El browser no consulta Supabase directo; todo pasa por /api/feed/home.',
    href: '/',
  },
  {
    id: 'feed-cache',
    title: 'Cache Redis del feed (45 s)',
    detail: 'Upstash guarda la primera página por tab; se invalida al publicar oferta.',
  },
  {
    id: 'upstash',
    title: 'Upstash Redis en producción',
    detail: 'Rate limit global + cache. Variables UPSTASH_* en Vercel.',
    href: '/admin/infraestructura',
  },
  {
    id: 'trusted-hunters',
    title: 'Cazadores de confianza configurados',
    detail: 'Whitelist del equipo de subida para publicar sin cola.',
    href: '/admin/owner/cazadores',
  },
  {
    id: 'moderation',
    title: 'Cola de moderación operativa',
    detail: 'Revisar pendientes y SLA antes de abrir tráfico.',
    href: '/admin/moderation',
  },
  {
    id: 'stress',
    title: 'Stress test documentado',
    detail: 'Ejecutar escenario D antes de campañas grandes (400–700 concurrentes).',
    href: '/admin/owner/crecimiento',
  },
  {
    id: 'write-queue',
    title: 'Cola de escritura en prod',
    detail: 'EVENT_WRITE_MODE=queue + cron process-write-queue si hay picos de votos/eventos.',
    href: '/admin/operaciones',
  },
];

export function buildPrelaunchChecklist(flags: {
  feedCacheRedis: boolean;
  upstashConfigured: boolean;
}): PrelaunchItem[] {
  return PRELAUNCH_CHECKLIST_TEMPLATE.map((item) => {
    let status: PrelaunchItem['status'] = 'pending';
    if (item.id === 'feed-api') status = 'done';
    else if (item.id === 'feed-cache') status = flags.feedCacheRedis ? 'done' : 'partial';
    else if (item.id === 'upstash') status = flags.upstashConfigured ? 'done' : 'pending';
    else if (item.id === 'trusted-hunters') status = 'partial';
    else if (item.id === 'moderation') status = 'partial';
    return { ...item, status };
  });
}


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
    focus: 'Cache Redis, stress test, cola de eventos en prod.',
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
      'Cache Redis del feed 30–60 s ✓',
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
