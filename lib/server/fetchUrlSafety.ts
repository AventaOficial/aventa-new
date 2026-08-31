import {
  isOfferAmazonHost,
  isOfferMercadoLibreHost,
} from '@/lib/offers/detectOfferStore';

const BLOCKED_HOSTNAMES = new Set(
  [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '169.254.169.254',
    'metadata.google.internal',
    'metadata.google',
    'kubernetes.default',
    'kubernetes.default.svc',
  ].map((h) => h.toLowerCase())
);

export const MAX_SAFE_REDIRECTS = 5;

function isIPv4Literal(host: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  const parts = host.split('.').map((x) => Number(x));
  return parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255);
}

function isIPv6Literal(host: string): boolean {
  return host.includes(':');
}

function ipv4PrivateOrReserved(parts: number[]): boolean {
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 255 && b === 255 && parts[2] === 255 && parts[3] === 255) return true;
  return false;
}

function isIpv6Blocked(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (h === '::1' || h === '0:0:0:0:0:0:0:1') return true;
  if (h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true;
  if (h.startsWith('::ffff:')) {
    const mapped = h.slice('::ffff:'.length);
    if (isIPv4Literal(mapped)) {
      return ipv4PrivateOrReserved(mapped.split('.').map((x) => Number(x)));
    }
  }
  return true;
}

/** Bloquea URLs que no deben ser feteadas desde el servidor (SSRF / red interna). */
export function isBlockedOfferParseUrl(url: URL): { blocked: boolean; reason?: string } {
  if (url.username || url.password) {
    return { blocked: true, reason: 'URL con credenciales no permitida' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { blocked: true, reason: 'Solo se permiten http y https' };
  }

  const host = url.hostname.toLowerCase();
  if (!host) {
    return { blocked: true, reason: 'Host inválido' };
  }

  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost') || host.endsWith('.local')) {
    return { blocked: true, reason: 'Host no permitido' };
  }

  const port = url.port;
  if (port) {
    const p = Number(port);
    const allowed = url.protocol === 'https:' ? p === 443 : p === 80;
    if (!allowed) {
      return { blocked: true, reason: 'Puerto no permitido' };
    }
  }

  if (isIPv4Literal(host)) {
    const parts = host.split('.').map((x) => Number(x));
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return { blocked: true, reason: 'IP inválida' };
    }
    if (ipv4PrivateOrReserved(parts)) {
      return { blocked: true, reason: 'IP privada o reservada no permitida' };
    }
    return { blocked: false };
  }

  if (isIPv6Literal(host)) {
    if (isIpv6Blocked(host)) {
      return { blocked: true, reason: 'URLs con IP literal IPv6 no están permitidas' };
    }
    return { blocked: true, reason: 'URLs con IP literal IPv6 no están permitidas' };
  }

  return { blocked: false };
}

/** Dominios de tienda que el parser puede fettear. */
export function isAllowedOfferParseHost(hostname: string): boolean {
  const d = hostname.replace(/^www\./, '').toLowerCase();
  if (isOfferMercadoLibreHost(hostname) || isOfferAmazonHost(hostname)) return true;
  return (
    d.includes('aliexpress.') ||
    d.includes('temu.') ||
    d.includes('walmart.') ||
    d.includes('shein.')
  );
}

export function assertSafeOfferFetchUrl(
  url: URL,
  options?: { requireHttps?: boolean; requireAllowlist?: boolean },
): { blocked: boolean; reason?: string } {
  if (options?.requireHttps !== false && url.protocol !== 'https:') {
    return { blocked: true, reason: 'Solo se permite HTTPS' };
  }
  const blocked = isBlockedOfferParseUrl(url);
  if (blocked.blocked) return blocked;
  if (options?.requireAllowlist !== false && !isAllowedOfferParseHost(url.hostname)) {
    return { blocked: true, reason: 'Dominio no soportado para el parser' };
  }
  return { blocked: false };
}

function resolveRedirectLocation(current: URL, location: string): URL | null {
  try {
    return new URL(location, current);
  } catch {
    return null;
  }
}

export type SafeFetchResult =
  | { ok: true; finalUrl: string; response: Response }
  | { ok: false; reason: string };

/**
 * Fetch que valida cada hop de redirect (SSRF).
 * No usa redirect:'follow': un 302 a 169.254.169.254 se rechaza antes de fettear.
 */
export async function fetchFollowingRedirectsSafely(
  startHref: string,
  options: {
    timeoutMs: number;
    headers?: Record<string, string>;
    method?: 'GET' | 'HEAD';
    maxRedirects?: number;
    requireHttps?: boolean;
    requireAllowlist?: boolean;
    signal?: AbortSignal;
  },
): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? MAX_SAFE_REDIRECTS;
  let currentHref = startHref.trim();
  if (!currentHref) return { ok: false, reason: 'URL vacía' };

  try {
    const initial = new URL(currentHref);
    if (initial.protocol === 'http:') {
      initial.protocol = 'https:';
      currentHref = initial.toString();
    }
  } catch {
    return { ok: false, reason: 'URL inválida' };
  }

  for (let hop = 0; hop <= maxRedirects; hop++) {
    let current: URL;
    try {
      current = new URL(currentHref);
    } catch {
      return { ok: false, reason: 'URL inválida' };
    }

    const gate = assertSafeOfferFetchUrl(current, {
      requireHttps: options.requireHttps,
      requireAllowlist: options.requireAllowlist,
    });
    if (gate.blocked) {
      return { ok: false, reason: gate.reason ?? 'URL bloqueada' };
    }

    const res = await fetch(currentHref, {
      method: options.method ?? 'GET',
      redirect: 'manual',
      signal: options.signal,
      headers: options.headers,
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return { ok: false, reason: 'Redirect sin Location' };
      const next = resolveRedirectLocation(current, location);
      if (!next) return { ok: false, reason: 'Location inválida' };
      currentHref = next.toString();
      continue;
    }

    return { ok: true, finalUrl: currentHref, response: res };
  }

  return { ok: false, reason: 'Demasiados redirects' };
}
