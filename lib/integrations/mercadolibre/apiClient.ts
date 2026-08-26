import { isMlOAuthEnabled } from '@/lib/integrations/mercadolibre/oauth';
import { getValidAccessToken, refreshMercadoLibreAccessToken } from '@/lib/integrations/mercadolibre/tokenRefresh';

const ML_API_BASE = (process.env.ML_OAUTH_API_BASE?.trim() || 'https://api.mercadolibre.com').replace(
  /\/+$/,
  '',
);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export type FetchMlApiResult =
  | { ok: true; data: unknown; authenticated: boolean; status: number }
  | { ok: false; status: number; authenticated: boolean };

function buildUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${ML_API_BASE}${normalized}`;
}

async function fetchWithToken(
  url: string,
  accessToken: string | null,
): Promise<{ res: Response; authenticated: boolean }> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Language': 'es-MX,es;q=0.9',
    'User-Agent': UA,
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const res = await fetch(url, { headers, cache: 'no-store' });
  return { res, authenticated: Boolean(accessToken) };
}

/**
 * GET autenticado a la API ML. Si OAuth está activo usa Bearer + refresh lazy.
 * 401 → un refresh + un retry. Sin loops.
 */
export async function fetchMlApi(path: string): Promise<FetchMlApiResult> {
  const url = buildUrl(path);
  const oauthOn = isMlOAuthEnabled();

  let accessToken: string | null = null;
  if (oauthOn) {
    accessToken = await getValidAccessToken();
  }

  try {
    let { res, authenticated } = await fetchWithToken(url, accessToken);

    if (oauthOn && res.status === 401 && accessToken) {
      const refreshed = await refreshMercadoLibreAccessToken();
      if (refreshed) {
        ({ res, authenticated } = await fetchWithToken(url, refreshed));
      }
    }

    if (!res.ok) {
      return { ok: false, status: res.status, authenticated };
    }

    const data = await res.json();
    return { ok: true, data, authenticated, status: res.status };
  } catch {
    return { ok: false, status: 0, authenticated: Boolean(accessToken) };
  }
}

export { ML_API_BASE };
