/**
 * P0-5 — Allowlist de Chrome extension IDs para /extension/auth.
 * Fail-closed: ausente / vacía / inválida → ninguna extensión autorizada.
 */

/** Chrome extension IDs: exactamente 32 chars en a–p (minúsculas). */
const CHROME_EXTENSION_ID_RE = /^[a-p]{32}$/;

export function isValidChromeExtensionId(extensionId: string): boolean {
  return CHROME_EXTENSION_ID_RE.test(extensionId.trim());
}

/**
 * Parsea NEXT_PUBLIC_AVENTA_EXTENSION_IDS (CSV).
 * Descarta vacíos, wildcards y formatos inválidos.
 */
export function parseAllowedExtensionIds(raw: string | undefined | null): string[] {
  if (raw == null) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of trimmed.split(',')) {
    const id = part.trim().toLowerCase();
    if (!id) continue;
    if (id === '*' || id === 'all' || id === 'any') continue;
    if (!isValidChromeExtensionId(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function isExtensionIdAllowlisted(
  extensionId: string,
  allowedRaw: string | undefined | null = process.env.NEXT_PUBLIC_AVENTA_EXTENSION_IDS,
): boolean {
  const id = extensionId.trim().toLowerCase();
  if (!isValidChromeExtensionId(id)) return false;
  const allowed = parseAllowedExtensionIds(allowedRaw);
  if (allowed.length === 0) return false;
  return allowed.includes(id);
}

export type ExtensionAuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId?: string;
  email?: string;
};

export type ExtensionAuthConfig = {
  aventaBase: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
};

export type ExtensionAuthBridgeResult =
  | { status: 'blocked'; reason: 'missing_ext' | 'not_allowlisted' }
  | { status: 'login' }
  | { status: 'no_chrome' }
  | { status: 'send_failed' }
  | { status: 'rejected_by_extension' }
  | { status: 'success' };

/**
 * Orquesta el bridge: allowlist → sesión → sendMessage.
 * No construye/envía payload si el ID no está allowlisted.
 */
export async function runExtensionAuthBridge(input: {
  extensionId: string;
  allowedIdsEnv?: string | null;
  getSession: () => Promise<{
    access_token?: string;
    refresh_token?: string;
    expires_at?: number | null;
    user?: { id?: string; email?: string | null };
  } | null>;
  sendMessage: (
    extensionId: string,
    message: unknown,
  ) => Promise<{ ok?: boolean } | null>;
  config: ExtensionAuthConfig;
}): Promise<ExtensionAuthBridgeResult> {
  const extensionId = input.extensionId.trim();
  if (!extensionId) {
    return { status: 'blocked', reason: 'missing_ext' };
  }

  const envRaw =
    input.allowedIdsEnv !== undefined
      ? input.allowedIdsEnv
      : process.env.NEXT_PUBLIC_AVENTA_EXTENSION_IDS;

  if (!isExtensionIdAllowlisted(extensionId, envRaw)) {
    return { status: 'blocked', reason: 'not_allowlisted' };
  }

  const session = await input.getSession();
  if (!session?.access_token || !session.refresh_token) {
    return { status: 'login' };
  }

  const expiresAt =
    session.expires_at != null ? session.expires_at * 1000 : Date.now() + 3600 * 1000;

  const message = {
    type: 'AVENTA_EXTENSION_SESSION',
    session: {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt,
      userId: session.user?.id,
      email: session.user?.email ?? undefined,
    } satisfies ExtensionAuthSession,
    config: input.config,
  };

  try {
    const response = await input.sendMessage(extensionId, message);
    if (response == null) {
      return { status: 'send_failed' };
    }
    if (response.ok) {
      return { status: 'success' };
    }
    return { status: 'rejected_by_extension' };
  } catch {
    return { status: 'send_failed' };
  }
}
