/**
 * Sonda de lectura sobre los endpoints que ya existen.
 * No crea proveedor nuevo ni escribe datos.
 *
 * Respuesta:
 * - health distinto de ok: revisar Supabase y la vista ofertas_ranked_general antes de otro despliegue.
 * - feed 5xx o latencia p95 > 2000 ms: revisar getHomeFeed y el cron system-integrity (feed.home.smoke).
 * - X-Feed-Cache ausente: el runtime no tiene Redis; en preview es esperado si AVENTA_REDIS_ENVIRONMENT no está definido.
 * - 401/403 en rutas públicas de lectura: revisar el aislamiento del despliegue, sin relajar RLS.
 * - fallos de moderación o publicación: revisar /api/admin/moderate-offer y /api/offers; la integridad ya cubre cola y locks.
 * - workers: supply.worker_recent y lifecycle.last_run salen en /api/cron/system-integrity.
 * - tracking: errores [product-event] en logs de Vercel; no reintentar clics como conversiones.
 * - dinero: los crons de payout deben seguir en no-op mientras el circuito esté congelado.
 */
import { assertIsolatedDeployment, assertIsolatedLoadTarget } from './load-read-profile.mjs';

const origin = assertIsolatedLoadTarget(process.env.BASE_URL);
const probes = [
  '/api/health/distribution-env',
  '/api/health',
  '/api/health/live',
  '/api/health/ready',
  '/api/feed/home?limit=5&view=top&period=month',
];

const rows = [];
for (const path of probes) {
  const started = Date.now();
  const res = await fetch(new URL(path, origin), { redirect: 'manual' });
  const body = path.endsWith('distribution-env') ? await res.json() : null;
  if (body) assertIsolatedDeployment(body);
  rows.push({
    path,
    status: res.status,
    ms: Date.now() - started,
    cache: res.headers.get('x-feed-cache'),
  });
  if (!body) await res.arrayBuffer();
}

const failed = rows.filter((row) => row.status < 200 || row.status >= 400);
console.log(JSON.stringify({
  host: origin.host,
  writes: 0,
  ok: failed.length === 0,
  rows,
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
