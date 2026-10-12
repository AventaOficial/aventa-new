import { NextResponse } from 'next/server';
import { ANONYMOUS_ID_COOKIE, readAnonymousId } from '@/lib/analytics/anonymousIdentity';
import { observePageView } from '@/lib/analytics/observeProductBehavior';
import { isPublicProductPath, normalizeProductPath } from '@/lib/analytics/productEventContract';
import { incrementLaunchMetric } from '@/lib/observability/launchMetrics';
import { enforceRateLimitCustom, getClientIp } from '@/lib/server/rateLimit';

const NO_STORE = { 'Cache-Control': 'no-store' };
const MAX_SEARCH_LENGTH = 512;

/** Solo el propio sitio envía page views; otro origen no puede inflar el funnel. */
function isCrossSite(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return !host || new URL(origin).host !== host;
  } catch {
    return true;
  }
}

function anonymousIdFromCookieHeader(request: Request): string | null {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === ANONYMOUS_ID_COOKIE) return readAnonymousId(rest.join('='));
  }
  return null;
}

function rateLimited(status: number, scope: 'actor' | 'ip') {
  incrementLaunchMetric('analytics_rate_limited');
  return new NextResponse(null, { status, headers: { ...NO_STORE, 'x-rate-limit-scope': scope } });
}

/**
 * Dos límites. El de la identidad anónima frena a un navegador desbocado, pero la cookie se puede
 * inventar; el de IP es el que no se puede falsificar y por eso se aplica siempre.
 * La deduplicación (actor, ruta, 10 s) en `product_events` hace idempotentes los reintentos.
 */
export async function POST(request: Request) {
  if (isCrossSite(request)) return new NextResponse(null, { status: 204, headers: NO_STORE });

  const anonymousId = anonymousIdFromCookieHeader(request);
  if (anonymousId) {
    const actor = await enforceRateLimitCustom(`page_view:anon:${anonymousId}`, 'pageViewActor');
    if (!actor.success) return rateLimited(actor.status, 'actor');
  }
  const ip = await enforceRateLimitCustom(`page_view:${getClientIp(request)}`, 'pageView');
  if (!ip.success) return rateLimited(ip.status, 'ip');

  const body = (await request.json().catch(() => null)) as { path?: unknown; search?: unknown } | null;
  const path = normalizeProductPath(typeof body?.path === 'string' ? body.path : null);
  if (!path || !isPublicProductPath(path)) return new NextResponse(null, { status: 204, headers: NO_STORE });
  const search =
    typeof body?.search === 'string' && body.search.startsWith('?') ? body.search.slice(0, MAX_SEARCH_LENGTH) : '';

  await observePageView(request, { path, search });
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
