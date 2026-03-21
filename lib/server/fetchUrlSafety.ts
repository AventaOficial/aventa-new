import { isIPv4, isIPv6 } from 'node:net';

const BLOCKED_HOSTNAMES = new Set(
  [
    'localhost',
    'metadata.google.internal',
    'metadata.google',
    'kubernetes.default',
    'kubernetes.default.svc',
  ].map((h) => h.toLowerCase())
);

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

  if (isIPv4(host)) {
    const parts = host.split('.').map((x) => Number(x));
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return { blocked: true, reason: 'IP inválida' };
    }
    if (ipv4PrivateOrReserved(parts)) {
      return { blocked: true, reason: 'IP privada o reservada no permitida' };
    }
    return { blocked: false };
  }

  if (isIPv6(host)) {
    return { blocked: true, reason: 'URLs con IP literal IPv6 no están permitidas' };
  }

  return { blocked: false };
}
