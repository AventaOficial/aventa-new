import { createServerClient } from '@/lib/supabase/server';
import {
  ML_OAUTH_PROVIDER,
  isMlOAuthEnabled,
  type MlOAuthTokenResponse,
} from '@/lib/integrations/mercadolibre/oauth';

export type MercadoLibreOAuthTokenRow = {
  provider: string;
  ml_user_id: number | null;
  access_token: string;
  refresh_token: string;
  token_type: string;
  scope: string | null;
  expires_at: string;
  connected_by: string | null;
  last_refresh_at: string | null;
  last_refresh_error: string | null;
  created_at: string;
  updated_at: string;
};

export type MercadoLibreOAuthStatus = {
  connected: boolean;
  enabled: boolean;
  ml_user_id: string | null;
  expires_at: string | null;
  scope: string | null;
  last_refresh_at: string | null;
  last_refresh_error: string | null;
};

const DEFAULT_REFRESH_SKEW_SECONDS = 300;

export function getRefreshSkewSeconds(): number {
  const raw = process.env.ML_OAUTH_REFRESH_SKEW_SECONDS?.trim();
  if (!raw) return DEFAULT_REFRESH_SKEW_SECONDS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_REFRESH_SKEW_SECONDS;
  return Math.floor(n);
}

export function isAccessTokenExpired(
  expiresAtIso: string,
  skewSeconds: number = getRefreshSkewSeconds(),
  now: Date = new Date(),
): boolean {
  const expiresMs = Date.parse(expiresAtIso);
  if (!Number.isFinite(expiresMs)) return true;
  return expiresMs <= now.getTime() + skewSeconds * 1000;
}

export function computeExpiresAt(expiresInSeconds: number, now: Date = new Date()): string {
  return new Date(now.getTime() + expiresInSeconds * 1000).toISOString();
}

export async function upsertMercadoLibreTokens(params: {
  tokenResponse: MlOAuthTokenResponse;
  connectedByUserId: string | null;
}): Promise<void> {
  const supabase = createServerClient();
  const nowIso = new Date().toISOString();
  const expiresAt = computeExpiresAt(params.tokenResponse.expires_in);

  const row = {
    provider: ML_OAUTH_PROVIDER,
    ml_user_id:
      typeof params.tokenResponse.user_id === 'number' ? params.tokenResponse.user_id : null,
    access_token: params.tokenResponse.access_token,
    refresh_token: params.tokenResponse.refresh_token!,
    token_type: params.tokenResponse.token_type?.trim() || 'bearer',
    scope: params.tokenResponse.scope?.trim() || null,
    expires_at: expiresAt,
    connected_by: params.connectedByUserId,
    last_refresh_at: null,
    last_refresh_error: null,
    updated_at: nowIso,
  };

  const { error } = await supabase.from('mercadolibre_oauth_tokens').upsert(row, {
    onConflict: 'provider',
  });

  if (error) {
    console.error('[ml-oauth] token upsert failed', { code: error.code, message: error.message });
    throw new Error('ML_OAUTH_TOKEN_STORE_FAILED');
  }
}

export async function getMercadoLibreTokenRow(): Promise<MercadoLibreOAuthTokenRow | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('mercadolibre_oauth_tokens')
    .select(
      'provider, ml_user_id, access_token, refresh_token, token_type, scope, expires_at, connected_by, last_refresh_at, last_refresh_error, created_at, updated_at',
    )
    .eq('provider', ML_OAUTH_PROVIDER)
    .maybeSingle();

  if (error) {
    console.error('[ml-oauth] token read failed', { code: error.code, message: error.message });
    throw new Error('ML_OAUTH_TOKEN_READ_FAILED');
  }

  return (data as MercadoLibreOAuthTokenRow | null) ?? null;
}

/**
 * Devuelve access token si existe y no está expirado (con skew).
 * FASE 4 añadirá refresh automático cuando expire.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const row = await getMercadoLibreTokenRow();
  if (!row?.access_token?.trim()) return null;
  if (isAccessTokenExpired(row.expires_at)) return null;
  return row.access_token;
}

export async function getMercadoLibreOAuthStatus(): Promise<MercadoLibreOAuthStatus> {
  const enabled = isMlOAuthEnabled();

  if (!enabled) {
    return {
      connected: false,
      enabled: false,
      ml_user_id: null,
      expires_at: null,
      scope: null,
      last_refresh_at: null,
      last_refresh_error: null,
    };
  }

  let row: MercadoLibreOAuthTokenRow | null = null;
  try {
    row = await getMercadoLibreTokenRow();
  } catch {
    return {
      connected: false,
      enabled: true,
      ml_user_id: null,
      expires_at: null,
      scope: null,
      last_refresh_at: null,
      last_refresh_error: 'read_failed',
    };
  }

  if (!row) {
    return {
      connected: false,
      enabled: true,
      ml_user_id: null,
      expires_at: null,
      scope: null,
      last_refresh_at: null,
      last_refresh_error: null,
    };
  }

  return {
    connected: true,
    enabled: true,
    ml_user_id: row.ml_user_id != null ? String(row.ml_user_id) : null,
    expires_at: row.expires_at,
    scope: row.scope,
    last_refresh_at: row.last_refresh_at,
    last_refresh_error: row.last_refresh_error,
  };
}

/** Indica si el token necesitará refresh (FASE 4). */
export async function accessTokenNeedsRefresh(): Promise<boolean> {
  const row = await getMercadoLibreTokenRow();
  if (!row) return false;
  return isAccessTokenExpired(row.expires_at);
}

/** Expone refresh_token solo server-side para FASE 4 — no usar en respuestas HTTP. */
export async function getRefreshTokenForServerUse(): Promise<string | null> {
  const row = await getMercadoLibreTokenRow();
  return row?.refresh_token?.trim() || null;
}

export async function markRefreshError(message: string): Promise<void> {
  const supabase = createServerClient();
  const safeMessage = message.slice(0, 240);
  const { error } = await supabase
    .from('mercadolibre_oauth_tokens')
    .update({
      last_refresh_error: safeMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('provider', ML_OAUTH_PROVIDER);

  if (error) {
    console.error('[ml-oauth] mark refresh error failed', { code: error.code });
  }
}
