import {
  computeExpiresAt,
  getMercadoLibreTokenRow,
  getRefreshSkewSeconds,
  isAccessTokenExpired,
  markRefreshError,
  type MercadoLibreOAuthTokenRow,
} from '@/lib/integrations/mercadolibre/tokenStore';
import {
  getMlOAuthConfig,
  isMlOAuthEnabled,
  ML_OAUTH_PROVIDER,
  refreshAccessToken,
  sanitizeMlOAuthLogMessage,
  type MlOAuthTokenResponse,
} from '@/lib/integrations/mercadolibre/oauth';
import { createServerClient } from '@/lib/supabase/server';

let refreshInFlight: Promise<string | null> | null = null;

async function persistRefreshedTokens(
  previous: MercadoLibreOAuthTokenRow,
  tokenResponse: MlOAuthTokenResponse,
): Promise<void> {
  const supabase = createServerClient();
  const nowIso = new Date().toISOString();
  const expiresAt = computeExpiresAt(tokenResponse.expires_in);

  const { error } = await supabase
    .from('mercadolibre_oauth_tokens')
    .update({
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token!,
      token_type: tokenResponse.token_type?.trim() || 'bearer',
      scope: tokenResponse.scope?.trim() || previous.scope,
      ml_user_id:
        typeof tokenResponse.user_id === 'number' ? tokenResponse.user_id : previous.ml_user_id,
      expires_at: expiresAt,
      last_refresh_at: nowIso,
      last_refresh_error: null,
      updated_at: nowIso,
    })
    .eq('provider', ML_OAUTH_PROVIDER);

  if (error) {
    console.error('[ml-oauth] refresh persist failed', { code: error.code, message: error.message });
    throw new Error('ML_OAUTH_TOKEN_STORE_FAILED');
  }
}

/**
 * Renueva access_token con refresh_token rotativo (single-flight en la instancia).
 */
export async function refreshMercadoLibreAccessToken(): Promise<string | null> {
  if (!isMlOAuthEnabled()) return null;

  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const config = getMlOAuthConfig();
      if (!config) return null;

      const row = await getMercadoLibreTokenRow();
      if (!row?.refresh_token?.trim()) return null;

      const tokenResponse = await refreshAccessToken({
        config,
        refreshToken: row.refresh_token,
      });

      await persistRefreshedTokens(row, tokenResponse);
      return tokenResponse.access_token;
    } catch (error) {
      await markRefreshError(sanitizeMlOAuthLogMessage(error));
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/**
 * Access token listo para llamadas API: refresh lazy si expira pronto.
 */
export async function getValidAccessToken(): Promise<string | null> {
  if (!isMlOAuthEnabled()) return null;

  const row = await getMercadoLibreTokenRow();
  if (!row?.access_token?.trim()) return null;

  if (!isAccessTokenExpired(row.expires_at, getRefreshSkewSeconds())) {
    return row.access_token;
  }

  return refreshMercadoLibreAccessToken();
}

/** Cron / mantenimiento proactivo — refresca si falta margen antes de expirar. */
export async function proactiveRefreshMercadoLibreToken(): Promise<{
  ok: boolean;
  refreshed: boolean;
  reason?: string;
}> {
  if (!isMlOAuthEnabled()) {
    return { ok: false, refreshed: false, reason: 'disabled' };
  }

  const row = await getMercadoLibreTokenRow();
  if (!row) {
    return { ok: false, refreshed: false, reason: 'not_connected' };
  }

  if (!isAccessTokenExpired(row.expires_at, getRefreshSkewSeconds())) {
    return { ok: true, refreshed: false };
  }

  const token = await refreshMercadoLibreAccessToken();
  if (!token) {
    return { ok: false, refreshed: false, reason: 'refresh_failed' };
  }

  return { ok: true, refreshed: true };
}
