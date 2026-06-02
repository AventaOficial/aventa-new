import { getAffiliateProgramsRuntimeStatus } from '@/lib/affiliate/programCatalog';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { getBotIngestPausedFromDb } from '@/lib/bots/ingest/botIngestPaused';
import { getWriteQueueBacklog } from '@/lib/server/writeQueue';
import {
  INFRA_GROUPS,
  INFRASTRUCTURE_CATALOG,
  type InfraCatalogEntry,
  type InfraDependencyView,
  type InfraRuntimeStatus,
  type InfrastructurePayload,
} from '@/lib/owner/infrastructureCatalog';
import { OWNER_DASHBOARD_TZ } from '@/lib/owner/mxTime';

function hasEnv(key: string): boolean {
  const v = process.env[key];
  return typeof v === 'string' && v.trim().length > 0;
}

function statusPresentation(status: InfraRuntimeStatus): { label: string; emoji: string } {
  switch (status) {
    case 'active':
      return { label: 'Activo', emoji: '🟢' };
    case 'configured':
      return { label: 'Configurado', emoji: '🟢' };
    case 'partial':
      return { label: 'Parcial / degradado', emoji: '🟡' };
    case 'inactive':
      return { label: 'Inactivo / falta config', emoji: '🔴' };
    case 'optional':
      return { label: 'Opcional (off)', emoji: '⚪' };
    case 'not_integrated':
      return { label: 'No integrado', emoji: '⚫' };
    default:
      return { label: 'Desconocido', emoji: '⚪' };
  }
}

type RuntimeResolver = () => { status: InfraRuntimeStatus; detail: string | null };

function buildResolvers(botPaused: boolean): Record<string, RuntimeResolver> {
  const supabaseCore =
    hasEnv('NEXT_PUBLIC_SUPABASE_URL') &&
    hasEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') &&
    hasEnv('SUPABASE_SERVICE_ROLE_KEY');

  const upstashOk = hasEnv('UPSTASH_REDIS_REST_URL') && hasEnv('UPSTASH_REDIS_REST_TOKEN');
  const resendOk = hasEnv('RESEND_API_KEY');
  const cronSecretOk = hasEnv('CRON_SECRET');
  const vercelDeploy = Boolean(process.env.VERCEL);
  const affiliates = getAffiliateProgramsRuntimeStatus();

  let botCfg: ReturnType<typeof loadBotIngestConfig> | null = null;
  try {
    botCfg = loadBotIngestConfig();
  } catch {
    botCfg = null;
  }

  const affiliateResolver = (id: string): RuntimeResolver => {
    const prog = affiliates.find((p) => p.id === id);
    return () => {
      if (!prog) return { status: 'inactive', detail: 'No en catálogo' };
      if (prog.active) {
        return {
          status: 'active',
          detail: `Claves: ${prog.configuredKeys.join(', ') || '—'}`,
        };
      }
      return {
        status: 'inactive',
        detail: prog.onboardingHint,
      };
    };
  };

  return {
    vercel: () => ({
      status: vercelDeploy ? 'active' : 'partial',
      detail: vercelDeploy
        ? `NODE_ENV=${process.env.NODE_ENV ?? '—'}`
        : 'Sin VERCEL en runtime (¿local?)',
    }),
    supabase: () => ({
      status: supabaseCore ? 'active' : 'inactive',
      detail: supabaseCore ? 'URL + anon + service role presentes' : 'Faltan variables Supabase',
    }),
    upstash: () => ({
      status: upstashOk ? 'active' : process.env.NODE_ENV === 'production' ? 'partial' : 'optional',
      detail: upstashOk
        ? 'Rate limit global con Redis'
        : 'Fallback en memoria por instancia (lib/server/rateLimit.ts)',
    }),
    appUrl: () => ({
      status: hasEnv('NEXT_PUBLIC_APP_URL') ? 'configured' : 'partial',
      detail: process.env.NEXT_PUBLIC_APP_URL?.trim() ?? 'Default en layout: aventaofertas.com',
    }),
    'affiliate:mercadolibre': affiliateResolver('mercadolibre'),
    'affiliate:amazon': affiliateResolver('amazon'),
    'affiliate:aliexpress': affiliateResolver('aliexpress'),
    'affiliate:temu': affiliateResolver('temu'),
    'affiliate:walmart': affiliateResolver('walmart'),
    'affiliate:shein': affiliateResolver('shein'),
    mlPublicApi: () => ({
      status: 'active',
      detail: 'API pública sin clave en repo; uso en bot si discover ML activo',
    }),
    amazonPaapi: () => {
      const enabled =
        process.env.BOT_INGEST_AMAZON_PAAPI_ENABLED === '1' ||
        process.env.BOT_INGEST_AMAZON_PAAPI_ENABLED === 'true';
      const keys =
        hasEnv('AMAZON_PAAPI_ACCESS_KEY') &&
        hasEnv('AMAZON_PAAPI_SECRET_KEY') &&
        (hasEnv('AMAZON_PAAPI_PARTNER_TAG') || hasEnv('AMAZON_ASSOCIATE_TAG'));
      if (enabled && keys) return { status: 'active', detail: 'PA-API habilitado en bot' };
      if (enabled) return { status: 'partial', detail: 'PA-API flag on pero faltan claves' };
      return { status: 'optional', detail: 'Bot usa scrape/HTML por defecto' };
    },
    keepa: () => {
      const enabled =
        process.env.BOT_INGEST_KEEPA_ENABLED === '1' ||
        process.env.BOT_INGEST_KEEPA_ENABLED === 'true';
      if (enabled && hasEnv('KEEPA_API_KEY')) return { status: 'active', detail: 'Keepa en bot' };
      if (enabled) return { status: 'partial', detail: 'KEEPA enabled sin API key' };
      return { status: 'optional', detail: 'Desactivado' };
    },
    cronSecret: () => ({
      status: cronSecretOk ? 'configured' : process.env.NODE_ENV === 'production' ? 'inactive' : 'partial',
      detail: cronSecretOk ? 'Crons protegidos' : 'CRON_SECRET no definido',
    }),
    cronVercelDigests: () => ({
      status: vercelDeploy ? 'active' : 'configured',
      detail:
        'vercel.json: daily-digest, system-integrity, weekly-digest (bot-ingest NO está en el archivo)',
    }),
    botIngest: () => {
      if (!botCfg) return { status: 'inactive', detail: 'No se pudo cargar config del bot' };
      const enabled = botCfg.enabled && !botPaused;
      const sources =
        botCfg.urlsFromEnv.length > 0 ||
        botCfg.amazonAsins.length > 0 ||
        (botCfg.discoverMlEnabled &&
          (botCfg.mlQueries.length > 0 ||
            botCfg.mlCategoryIds.length > 0 ||
            botCfg.mlUseDefaultQueries)) ||
        process.env.BOT_INGEST_EXTERNAL_WORKER === '1' ||
        process.env.BOT_INGEST_EXTERNAL_WORKER === 'true';
      if (enabled && sources) {
        return {
          status: 'active',
          detail: `Perfil ${botCfg.profile}; pausa owner: ${botPaused ? 'sí' : 'no'}`,
        };
      }
      if (botCfg.enabled && !sources) {
        return { status: 'partial', detail: 'BOT_INGEST_ENABLED sin fuentes (URLs/ML/Amazon/worker)' };
      }
      return {
        status: 'inactive',
        detail: !botCfg.enabled ? 'BOT_INGEST_ENABLED off' : 'Pausado en app_config',
      };
    },
    writeQueue: () => {
      const mode = (process.env.EVENT_WRITE_MODE ?? 'adaptive').trim().toLowerCase();
      return {
        status: 'configured',
        detail: `EVENT_WRITE_MODE=${mode}`,
      };
    },
    externalWorker: () => {
      const on =
        process.env.BOT_INGEST_EXTERNAL_WORKER === '1' ||
        process.env.BOT_INGEST_EXTERNAL_WORKER === 'true';
      return {
        status: on ? 'active' : 'optional',
        detail: on ? 'Worker → POST bot-ingest-candidates' : 'No declarado en env',
      };
    },
    playwrightWorker: () => ({
      status: 'optional',
      detail: 'Código en workers/mercadolibre-worker; despliegue no detectable desde Vercel',
    }),
    rssIngest: () => ({
      status: 'not_integrated',
      detail: 'BOT_INGEST_RSS sin implementación activa',
    }),
    supabaseAuth: () => ({
      status: supabaseCore ? 'active' : 'inactive',
      detail: supabaseCore ? 'Mismas credenciales que Supabase core' : 'Auth no operativo',
    }),
    resend: () => ({
      status: resendOk ? 'active' : 'inactive',
      detail: resendOk ? 'Digests y alertas pueden enviarse' : 'RESEND_API_KEY ausente',
    }),
    emailFrom: () => ({
      status: hasEnv('EMAIL_FROM') ? 'configured' : 'partial',
      detail: process.env.EMAIL_FROM?.trim() ?? 'Default en cron: onboarding@resend.dev',
    }),
    systemAlerts: () => {
      const email = hasEnv('SYSTEM_ALERT_EMAIL_TO');
      const webhook = hasEnv('SYSTEM_ALERT_WEBHOOK_URL');
      if ((email && resendOk) || webhook) {
        return {
          status: email && webhook ? 'active' : 'partial',
          detail: [
            email ? 'email configurado' : 'sin SYSTEM_ALERT_EMAIL_TO',
            webhook ? 'webhook configurado' : 'sin webhook',
            !resendOk && email ? '(sin Resend no hay correo)' : '',
          ]
            .filter(Boolean)
            .join(' · '),
        };
      }
      return { status: 'inactive', detail: 'Sin destino de alerta configurado' };
    },
    offerEvents: () => ({
      status: supabaseCore ? 'active' : 'inactive',
      detail: 'Tabla offer_events + cola write_jobs_queue',
    }),
    productMetrics: () => ({
      status: supabaseCore ? 'active' : 'inactive',
      detail: 'Requiere Supabase y rol admin para API',
    }),
    monitoringWebhook: () => ({
      status: hasEnv('MONITORING_ALERT_WEBHOOK_URL') ? 'configured' : 'optional',
      detail: hasEnv('MONITORING_ALERT_WEBHOOK_URL')
        ? 'Webhook en errores log-client-event'
        : 'Solo consola / logs',
    }),
    thirdPartyAnalytics: () => ({
      status: 'not_integrated',
      detail: 'Sin SDK de analytics de terceros en app/',
    }),
  };
}

function resolveEntry(
  entry: InfraCatalogEntry,
  resolvers: Record<string, RuntimeResolver>
): InfraDependencyView {
  const resolver = entry.runtimeKey ? resolvers[entry.runtimeKey] : undefined;
  const { status, detail } = resolver
    ? resolver()
    : { status: 'optional' as InfraRuntimeStatus, detail: null };
  const { label, emoji } = statusPresentation(status);
  return {
    ...entry,
    status,
    statusLabel: label,
    statusEmoji: emoji,
    runtimeDetail: detail,
  };
}

const CRITICAL_IDS = new Set(['vercel', 'supabase', 'supabase-auth', 'offer-events']);

export async function buildInfrastructureStatus(): Promise<InfrastructurePayload> {
  let botPaused = false;
  try {
    botPaused = await getBotIngestPausedFromDb();
  } catch {
    botPaused = false;
  }

  const resolvers = buildResolvers(botPaused);
  const dependencies = INFRASTRUCTURE_CATALOG.map((e) => resolveEntry(e, resolvers));

  try {
    const backlog = await getWriteQueueBacklog();
    const wq = dependencies.find((d) => d.id === 'cron-write-queue');
    if (wq) {
      wq.runtimeDetail = `${wq.runtimeDetail ?? ''} · Cola: ${backlog.pending} pendientes, ${backlog.failed} fallidos`.trim();
      if (backlog.failed > 20) wq.status = 'partial';
      const { label, emoji } = statusPresentation(wq.status);
      wq.statusLabel = label;
      wq.statusEmoji = emoji;
    }
  } catch {
    /* cola no disponible */
  }

  const active = dependencies.filter((d) => d.status === 'active' || d.status === 'configured').length;
  const partial = dependencies.filter((d) => d.status === 'partial').length;
  const inactive = dependencies.filter((d) => d.status === 'inactive').length;
  const criticalInactive = dependencies
    .filter((d) => CRITICAL_IDS.has(d.id) && (d.status === 'inactive' || d.status === 'partial'))
    .map((d) => d.name);

  return {
    generatedAt: new Date().toISOString(),
    timezone: OWNER_DASHBOARD_TZ,
    groups: INFRA_GROUPS,
    dependencies,
    summary: {
      total: dependencies.length,
      active,
      partial,
      inactive,
      criticalInactive,
    },
  };
}
