/**
 * Staging Telegram provisioning helpers — never logs token values.
 */
import fs from 'fs';
import path from 'path';

export function loadEnvLocal() {
  const raw = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && out[m[1]] === undefined) {
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      out[m[1]] = v;
    }
  }
  return out;
}

export function assertStagingTarget(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const ref = url ? new URL(url).hostname.split('.')[0] : null;
  const target = env.AVENTA_SUPABASE_TARGET;
  const expected = env.AVENTA_EXPECTED_SUPABASE_REF;
  const ok =
    ref === 'oojshofrpbfwsiypcecr' &&
    expected === 'oojshofrpbfwsiypcecr' &&
    target === 'staging' &&
    ref !== 'mkgsrpsuvedwwlzmzmzh';
  return { ok, ref, target, expected };
}

export function tokenMeta(token) {
  const parts = (token || '').split(':');
  return {
    present: Boolean(token),
    len: (token || '').length,
    hasColon: (token || '').includes(':'),
    leftIsDigits: parts[0] ? /^\d+$/.test(parts[0]) : false,
    leftLen: parts[0]?.length ?? 0,
    rightLen: parts[1]?.length ?? 0,
    formatOk: /^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token || ''),
  };
}

export async function telegramGetMe(token) {
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
    method: 'GET',
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json().catch(() => ({}));
  return { httpStatus: res.status, json };
}

export async function telegramGetUpdates(token, offset) {
  const url = new URL(`https://api.telegram.org/bot${token}/getUpdates`);
  url.searchParams.set('timeout', '0');
  url.searchParams.set('limit', '50');
  if (offset != null) url.searchParams.set('offset', String(offset));
  const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(15_000) });
  const json = await res.json().catch(() => ({}));
  return { httpStatus: res.status, json };
}
