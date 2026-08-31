import type { ExtensionConfig, ExtensionSession } from '../types/messages';

export async function refreshExtensionSession(
  session: ExtensionSession,
  config: ExtensionConfig,
): Promise<ExtensionSession | null> {
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;

  const res = await fetch(`${config.supabaseUrl.replace(/\/$/, '')}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.supabaseAnonKey,
    },
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  });

  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  if (!body?.access_token || !body?.refresh_token) return null;

  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3600;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + expiresIn * 1000,
    userId: body.user?.id ?? session.userId,
    email: body.user?.email ?? session.email,
  };
}

export async function getValidAccessToken(
  session: ExtensionSession,
  config: ExtensionConfig,
): Promise<{ accessToken: string; session: ExtensionSession } | null> {
  const skewMs = 60_000;
  if (Date.now() < session.expiresAt - skewMs) {
    return { accessToken: session.accessToken, session };
  }
  const refreshed = await refreshExtensionSession(session, config);
  if (!refreshed) return null;
  return { accessToken: refreshed.accessToken, session: refreshed };
}
