/**
 * SSRF / open-redirect guards for Distribution media + hop destinations.
 * Fail-closed: reject unless HTTPS and host is not private/link-local/metadata.
 */

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
]);

function isPrivateIpv4(host: string): boolean {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/**
 * Validate a URL for use as Telegram photo or hop redirect target.
 * Does not fetch the URL (avoids SSRF via server-side GET).
 */
export function assertSafeHttpsUrl(
  raw: string | null | undefined,
  opts?: { allowlistHosts?: string[] },
): { ok: true; url: string } | { ok: false; reason: string } {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: false, reason: 'empty' };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'https_required' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'userinfo_forbidden' };
  }

  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.localhost') || host.endsWith('.local')) {
    return { ok: false, reason: 'blocked_host' };
  }
  // IPv6 literal or private IPv4 — reject (Telegram + open redirect safety)
  if (host.includes(':') || isPrivateIpv4(host)) {
    return { ok: false, reason: 'private_or_ipv6_host' };
  }

  if (opts?.allowlistHosts && opts.allowlistHosts.length > 0) {
    const allowed = opts.allowlistHosts.some(
      (h) => host === h.toLowerCase() || host.endsWith(`.${h.toLowerCase()}`),
    );
    if (!allowed) return { ok: false, reason: 'host_not_allowlisted' };
  }

  return { ok: true, url: parsed.toString() };
}

/** Safe offer_url for 302 Location — https (or http retailer) only, no javascript:. */
export function assertSafeRedirectUrl(
  raw: string | null | undefined,
): { ok: true; url: string } | { ok: false; reason: string } {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, reason: 'http_https_only' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'userinfo_forbidden' };
  }
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || isPrivateIpv4(host) || host === '::1') {
    return { ok: false, reason: 'blocked_host' };
  }
  return { ok: true, url: parsed.toString() };
}
