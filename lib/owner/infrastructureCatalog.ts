/**
 * Catálogo de dependencias externas documentadas en el repositorio.
 * No incluye precios facturados reales (no existen en código); solo notas explícitas del repo.
 */

export type InfraGroupId =
  | 'infraestructura'
  | 'afiliacion'
  | 'automatizacion'
  | 'autenticacion'
  | 'correos'
  | 'analitica';

export type InfraGroupMeta = {
  id: InfraGroupId;
  title: string;
  subtitle: string;
};

export const INFRA_GROUPS: InfraGroupMeta[] = [
  {
    id: 'infraestructura',
    title: 'Infraestructura',
    subtitle: 'Hosting, base de datos, límites y almacenamiento',
  },
  {
    id: 'afiliacion',
    title: 'Afiliación',
    subtitle: 'Programas y APIs que monetizan clics salientes',
  },
  {
    id: 'automatizacion',
    title: 'Automatización',
    subtitle: 'Crons, bot de ingesta y colas de escritura',
  },
  {
    id: 'autenticacion',
    title: 'Autenticación',
    subtitle: 'Sesiones y acceso de usuarios y admin',
  },
  {
    id: 'correos',
    title: 'Correos',
    subtitle: 'Resúmenes y alertas operativas',
  },
  {
    id: 'analitica',
    title: 'Analítica',
    subtitle: 'Métricas de producto y monitoreo en el código',
  },
];

export type InfraCatalogEntry = {
  id: string;
  group: InfraGroupId;
  name: string;
  usage: string;
  /** Solo texto presente en repo/docs; si no hay cifra, indicar que no está en código. */
  costCurrent: string;
  scaleWhen: string[];
  failureImpact: string;
  repoRefs: string[];
  /** Si true, el estado en runtime se calcula en buildInfrastructureStatus. */
  runtimeKey?: string;
};

export const INFRASTRUCTURE_CATALOG: InfraCatalogEntry[] = [
  // —— Infraestructura ——
  {
    id: 'vercel',
    group: 'infraestructura',
    name: 'Vercel',
    usage: 'Hosting Next.js (App Router), despliegue, edge y crons declarados en vercel.json.',
    costCurrent:
      'No facturado en la app. Checklist interno (Operaciones → Trabajo) registra «Vercel Hobby / otros fijos» en $0 MXN.',
    scaleWhen: [
      'Crons del bot cada ~15 min (Hobby: máx. 1×/día por job en vercel.json)',
      'Más funciones serverless / mayor maxDuration',
      'Múltiples regiones o equipo',
    ],
    failureImpact: 'El sitio y las APIs dejan de responder; AVENTA no es accesible.',
    repoRefs: ['vercel.json', 'app/layout.tsx', '.env.example'],
    runtimeKey: 'vercel',
  },
  {
    id: 'supabase',
    group: 'infraestructura',
    name: 'Supabase',
    usage: 'Postgres, Auth, RLS, Storage (bucket offer-images), realtime opcional.',
    costCurrent: 'No expuesto en el repositorio — consultar panel de Supabase.',
    scaleWhen: [
      'Almacenamiento de imágenes alto (offer-images)',
      'Conexiones / ancho de banda elevados',
      'Muchos usuarios concurrentes o consultas pesadas',
    ],
    failureImpact: 'AVENTA deja de funcionar: sin BD, auth, storage ni moderación.',
    repoRefs: ['.env.example', 'lib/supabase/server.ts', 'app/api/upload-offer-image/route.ts'],
    runtimeKey: 'supabase',
  },
  {
    id: 'upstash',
    group: 'infraestructura',
    name: 'Upstash Redis',
    usage: 'Rate limiting global (@upstash/ratelimit) en APIs públicas.',
    costCurrent: 'No expuesto en el repositorio — consultar panel de Upstash.',
    scaleWhen: [
      'Tráfico multi-región (sin Redis, fallback en memoria por instancia)',
      'Más presets de límite (RATE_LIMIT_* en .env)',
    ],
    failureImpact:
      'Sin UPSTASH_* en producción: límites solo en memoria por instancia (incoherentes entre regiones). Abuso de API más probable.',
    repoRefs: ['.env.example', 'lib/server/rateLimit.ts', 'app/privacy/page.tsx'],
    runtimeKey: 'upstash',
  },
  {
    id: 'domain',
    group: 'infraestructura',
    name: 'Dominio / URL pública',
    usage: 'NEXT_PUBLIC_APP_URL en SEO, emails, metadata y enlaces absolutos.',
    costCurrent: 'No expuesto en el repositorio (registro de dominio aparte).',
    scaleWhen: ['Cambio de dominio de producción', 'Entornos preview vs producción'],
    failureImpact: 'Enlaces rotos en correos/OG si la variable no coincide con el dominio real.',
    repoRefs: ['.env.example', 'app/layout.tsx', 'lib/sitemap.ts'],
    runtimeKey: 'appUrl',
  },

  // —— Afiliación ——
  {
    id: 'affiliate-mercadolibre',
    group: 'afiliacion',
    name: 'Mercado Libre Afiliados',
    usage: 'Tags ?tag= y/o matt_word + matt_tool en enlaces ML/meli.la al guardar y en cliente.',
    costCurrent: 'Comisión por venta atribuida (red ML) — no medida en AVENTA.',
    scaleWhen: ['Activar cuando tengas tag o perfil colaborador aprobado'],
    failureImpact: 'Clics sin comisión atribuida a AVENTA; el producto sigue operando.',
    repoRefs: ['lib/affiliate/programCatalog.ts', '.env.example'],
    runtimeKey: 'affiliate:mercadolibre',
  },
  {
    id: 'affiliate-amazon',
    group: 'afiliacion',
    name: 'Amazon Associates',
    usage: 'Parámetro ?tag= en enlaces Amazon (servidor y NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG).',
    costCurrent: 'Comisión por venta atribuida (Amazon) — no medida en AVENTA.',
    scaleWhen: ['Tracking ID aprobado en Associates Central'],
    failureImpact: 'Clics a Amazon sin comisión; producto operativo.',
    repoRefs: ['lib/affiliate/programCatalog.ts', '.env.example'],
    runtimeKey: 'affiliate:amazon',
  },
  {
    id: 'affiliate-aliexpress',
    group: 'afiliacion',
    name: 'AliExpress Portals',
    usage: 'aff_fcid en enlaces si ALIEXPRESS_AFF_FCID está definido.',
    costCurrent: 'Comisión de red — no medida en AVENTA.',
    scaleWhen: ['Solo si el programa entrega aff_fcid válido'],
    failureImpact: 'Sin tracking AliExpress; resto del sitio normal.',
    repoRefs: ['lib/affiliate/programCatalog.ts'],
    runtimeKey: 'affiliate:aliexpress',
  },
  {
    id: 'affiliate-temu',
    group: 'afiliacion',
    name: 'Temu Partners',
    usage: 'rp_pid en enlaces Temu cuando TEMU_AFFILIATE_RP_PID está configurado.',
    costCurrent: 'Comisión de red — no medida en AVENTA.',
    scaleWhen: ['Canal web aprobado en panel Temu'],
    failureImpact: 'Sin tracking Temu; resto del sitio normal.',
    repoRefs: ['lib/affiliate/programCatalog.ts'],
    runtimeKey: 'affiliate:temu',
  },
  {
    id: 'affiliate-walmart',
    group: 'afiliacion',
    name: 'Walmart Affiliates',
    usage: 'Query afiliada WALMART_AFFILIATE_QUERY en dominios Walmart.',
    costCurrent: 'Comisión de red — no medida en AVENTA.',
    scaleWhen: ['Parámetros entregados por el programa'],
    failureImpact: 'Sin tracking Walmart; resto del sitio normal.',
    repoRefs: ['lib/affiliate/programCatalog.ts'],
    runtimeKey: 'affiliate:walmart',
  },
  {
    id: 'affiliate-shein',
    group: 'afiliacion',
    name: 'Shein Affiliates',
    usage: 'aff_id en enlaces Shein cuando SHEIN_AFF_ID está configurado.',
    costCurrent: 'Comisión de red — no medida en AVENTA.',
    scaleWhen: ['Programa activo para tu cuenta'],
    failureImpact: 'Sin tracking Shein; resto del sitio normal.',
    repoRefs: ['lib/affiliate/programCatalog.ts'],
    runtimeKey: 'affiliate:shein',
  },
  {
    id: 'api-mercadolibre-public',
    group: 'afiliacion',
    name: 'API pública Mercado Libre',
    usage: 'Bot: búsqueda sites/MLM/search e items?ids= (api.mercadolibre.com).',
    costCurrent: 'API pública documentada por ML — sin API key en el repo.',
    scaleWhen: ['Mucho volumen de búsqueda/reviews desde el bot'],
    failureImpact: 'El bot no descubre ofertas ML; ingesta manual u otras fuentes siguen.',
    repoRefs: ['lib/bots/ingest/discoverMercadoLibre.ts', 'lib/bots/ingest/mlItemDetails.ts'],
    runtimeKey: 'mlPublicApi',
  },
  {
    id: 'amazon-paapi',
    group: 'afiliacion',
    name: 'Amazon Product Advertising API',
    usage: 'Opcional en bot (BOT_INGEST_AMAZON_PAAPI_ENABLED + claves PA-API).',
    costCurrent: 'No expuesto en el repositorio — requisitos y límites en documentación Amazon.',
    scaleWhen: ['Sustituir scrape HTML por PA-API en ingesta Amazon'],
    failureImpact: 'Bot usa fallback scrape/HTML si PA-API no está activo.',
    repoRefs: ['.env.example', 'lib/bots/ingest/config.ts'],
    runtimeKey: 'amazonPaapi',
  },
  {
    id: 'keepa',
    group: 'afiliacion',
    name: 'Keepa API',
    usage: 'Opcional: intel de precios en bot (KEEPA_API_KEY).',
    costCurrent: 'No expuesto en el repositorio — plan según Keepa.',
    scaleWhen: ['BOT_INGEST_KEEPA_ENABLED=1 y clave válida'],
    failureImpact: 'Sin histórico Keepa en scoring; bot sigue sin esa señal.',
    repoRefs: ['.env.example', 'lib/bots/ingest/config.ts'],
    runtimeKey: 'keepa',
  },

  // —— Automatización ——
  {
    id: 'cron-secret',
    group: 'automatizacion',
    name: 'CRON_SECRET',
    usage: 'Protege GET/POST de /api/cron/* y disparos externos (cron-job.org, etc.).',
    costCurrent: 'Sin costo de proveedor (secreto en Vercel).',
    scaleWhen: ['Rotar secreto si se filtra', 'Obligatorio en producción (.env.example)'],
    failureImpact: 'Crons rechazados o inseguros si falta o es débil.',
    repoRefs: ['.env.example', 'app/api/cron/bot-ingest/route.ts'],
    runtimeKey: 'cronSecret',
  },
  {
    id: 'cron-vercel-digests',
    group: 'automatizacion',
    name: 'Crons Vercel (digests + integridad)',
    usage: 'vercel.json: daily-digest 01:00 UTC, system-integrity 02:30 UTC, weekly-digest lunes 00:00 UTC.',
    costCurrent: 'Incluido en plan Vercel (límites según plan).',
    scaleWhen: ['Hobby: máx. 1 ejecución/día por cron declarado'],
    failureImpact: 'Sin digest automático o chequeo de integridad programado.',
    repoRefs: ['vercel.json', 'app/api/cron/daily-digest/route.ts', 'app/api/cron/system-integrity/route.ts'],
    runtimeKey: 'cronVercelDigests',
  },
  {
    id: 'cron-bot-ingest',
    group: 'automatizacion',
    name: 'Bot de ingesta (/api/cron/bot-ingest)',
    usage: 'Inserta ofertas desde ML/Amazon/URLs; 202 + after() para evitar timeout de cron externo.',
    costCurrent: 'Sin línea en repo; cron externo (ej. cron-job.org) suele ser gratis en tier básico.',
    scaleWhen: [
      'Vercel Pro + entrada en vercel.json cada 15 min, o cron externo documentado',
      'BOT_INGEST_* y usuario bot en Supabase Auth',
    ],
    failureImpact: 'Menos ofertas nuevas automáticas; moderación y feed manual siguen.',
    repoRefs: ['app/api/cron/bot-ingest/route.ts', 'docs/CRON_EXTERNO_BOT.md', '.env.example'],
    runtimeKey: 'botIngest',
  },
  {
    id: 'cron-write-queue',
    group: 'automatizacion',
    name: 'Cola de escritura (write_jobs_queue)',
    usage: 'EVENT_WRITE_MODE adaptive/queue; procesamiento vía /api/cron/process-write-queue.',
    costCurrent: 'Sin proveedor extra (usa Supabase).',
    scaleWhen: ['Muchos eventos view/outbound fallidos en pico', 'WRITE_QUEUE_CRON_BATCH'],
    failureImpact: 'Pérdida o retraso de métricas de clics/vistas si la cola crece.',
    repoRefs: ['lib/server/writeQueue.ts', '.env.example', 'app/api/cron/process-write-queue/route.ts'],
    runtimeKey: 'writeQueue',
  },
  {
    id: 'worker-railway',
    group: 'automatizacion',
    name: 'Worker externo (Railway)',
    usage: 'BOT_INGEST_EXTERNAL_WORKER=1 → POST /api/cron/bot-ingest-candidates con CRON_SECRET.',
    costCurrent: 'No expuesto en el repositorio — coste del proveedor del worker (ej. Railway).',
    scaleWhen: ['Descubrimiento ML fuera de Vercel (Playwright u otro)'],
    failureImpact: 'Sin worker: depende de cron Vercel/manual para candidatos.',
    repoRefs: ['.env.example', 'app/api/cron/bot-ingest-candidates/route.ts'],
    runtimeKey: 'externalWorker',
  },
  {
    id: 'worker-playwright-local',
    group: 'automatizacion',
    name: 'Worker Mercado Libre (Playwright)',
    usage: 'Paquete workers/mercadolibre-worker (Node + Playwright); despliegue separado del app.',
    costCurrent: 'No expuesto en el repositorio.',
    scaleWhen: ['Automatizar navegación ML no cubierta por API pública'],
    failureImpact: 'Solo afecta flujos que dependan de ese worker; no bloquea la web.',
    repoRefs: ['workers/mercadolibre-worker/package.json'],
    runtimeKey: 'playwrightWorker',
  },
  {
    id: 'bot-rss',
    group: 'automatizacion',
    name: 'Ingesta RSS (reservado)',
    usage: 'BOT_INGEST_RSS_* en .env.example — sin parser implementado aún.',
    costCurrent: 'N/A',
    scaleWhen: ['Cuando exista implementación en collectIngestItems'],
    failureImpact: 'Ninguno hoy (no activo en código).',
    repoRefs: ['lib/bots/ingest/collectIngestItems.ts', '.env.example'],
    runtimeKey: 'rssIngest',
  },

  // —— Autenticación ——
  {
    id: 'supabase-auth',
    group: 'autenticacion',
    name: 'Supabase Auth',
    usage: 'Login, sesión JWT, callback /auth/callback, roles en user_roles.',
    costCurrent: 'Incluido en proyecto Supabase (límites según plan).',
    scaleWhen: ['MAU alto', 'proveedores OAuth adicionales'],
    failureImpact: 'No hay login ni paneles admin/owner; usuarios anónimos limitados.',
    repoRefs: ['app/auth/callback/route.ts', 'app/providers/AuthProvider.tsx', '.env.example'],
    runtimeKey: 'supabaseAuth',
  },

  // —— Correos ——
  {
    id: 'resend',
    group: 'correos',
    name: 'Resend',
    usage: 'Digest diario/semanal y envío vía api.resend.com (RESEND_API_KEY).',
    costCurrent: 'No expuesto en el repositorio — panel Resend.',
    scaleWhen: ['Más usuarios con email digest activo', 'más volumen de alertas'],
    failureImpact: 'No se envían resúmenes ni correos de alerta de integridad.',
    repoRefs: ['app/api/cron/weekly-digest/route.ts', 'app/api/cron/daily-digest/route.ts', '.env.example'],
    runtimeKey: 'resend',
  },
  {
    id: 'email-from',
    group: 'correos',
    name: 'EMAIL_FROM / EMAIL_LOGO_URL',
    usage: 'Remitente y logo en plantillas de correo.',
    costCurrent: 'Sin costo aparte (dominio verificado en Resend).',
    scaleWhen: ['Cambio de dominio de envío', 'reputación de entregabilidad'],
    failureImpact: 'Correos rechazados o sin branding si mal configurado.',
    repoRefs: ['.env.example'],
    runtimeKey: 'emailFrom',
  },
  {
    id: 'system-alerts',
    group: 'correos',
    name: 'Alertas de integridad',
    usage: 'SYSTEM_ALERT_EMAIL_TO + Resend; SYSTEM_ALERT_WEBHOOK_URL (Slack/Discord/Make).',
    costCurrent: 'Webhook: sin costo en AVENTA; correo depende de Resend.',
    scaleWhen: ['Fallos de /api/cron/system-integrity'],
    failureImpact: 'No te enteras automáticamente de chequeos fallidos.',
    repoRefs: ['app/api/admin/operations-pulse/route.ts', '.env.example'],
    runtimeKey: 'systemAlerts',
  },

  // —— Analítica ——
  {
    id: 'offer-events',
    group: 'analitica',
    name: 'offer_events (first-party)',
    usage: 'Vistas, outbound, share, cazar_cta — track-view, track-outbound, /api/events.',
    costCurrent: 'Almacenado en Supabase (sin proveedor analytics tercero).',
    scaleWhen: ['Volumen alto de eventos', 'particionado o retención'],
    failureImpact: 'Owner Dashboard y métricas sin clics/CTR reales.',
    repoRefs: ['app/api/track-view/route.ts', 'lib/owner/buildOwnerDashboard.ts'],
    runtimeKey: 'offerEvents',
  },
  {
    id: 'admin-product-metrics',
    group: 'analitica',
    name: 'Métricas admin (/api/admin/product-metrics)',
    usage: 'Panel admin: agregados de producto y actividad.',
    costCurrent: 'Sin costo extra (consultas Supabase).',
    scaleWhen: ['Consultas lentas en tablas grandes'],
    failureImpact: 'Paneles admin con datos incompletos o lentos.',
    repoRefs: ['app/api/admin/product-metrics/route.ts', 'app/admin/metrics/page.tsx'],
    runtimeKey: 'productMetrics',
  },
  {
    id: 'client-log-webhook',
    group: 'analitica',
    name: 'log-client-event + webhook',
    usage: 'POST /api/log-client-event; MONITORING_ALERT_WEBHOOK_URL opcional.',
    costCurrent: 'Webhook: costo del destino (Slack/Discord/etc.), no en repo.',
    scaleWhen: ['Errores críticos de cliente que requieran alerta'],
    failureImpact: 'Errores solo en consola/logs Vercel sin webhook.',
    repoRefs: ['app/api/log-client-event/route.ts', 'lib/monitoring/clientLogger.ts'],
    runtimeKey: 'monitoringWebhook',
  },
  {
    id: 'third-party-analytics',
    group: 'analitica',
    name: 'Google Analytics / Plausible / etc.',
    usage: 'No hay integración en el código del repositorio.',
    costCurrent: 'N/A — no integrado',
    scaleWhen: ['Si añades SDK o script en layout'],
    failureImpact: 'Ninguno hoy (no depende el producto).',
    repoRefs: ['(búsqueda en repo: sin gtag/plausible/posthog en app/)'],
    runtimeKey: 'thirdPartyAnalytics',
  },
];

export type InfraRuntimeStatus = 'active' | 'configured' | 'partial' | 'inactive' | 'optional' | 'not_integrated';

export type InfraDependencyView = InfraCatalogEntry & {
  status: InfraRuntimeStatus;
  statusLabel: string;
  statusEmoji: string;
  runtimeDetail: string | null;
};

export type InfrastructurePayload = {
  generatedAt: string;
  timezone: string;
  groups: InfraGroupMeta[];
  dependencies: InfraDependencyView[];
  summary: {
    total: number;
    active: number;
    partial: number;
    inactive: number;
    criticalInactive: string[];
  };
};
