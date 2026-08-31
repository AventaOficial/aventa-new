export interface ExtensionSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId?: string;
  email?: string;
}

export interface ExtensionConfig {
  aventaBase: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export const SESSION_STORAGE_KEY = 'aventa_extension_session_v1';
export const CONFIG_STORAGE_KEY = 'aventa_extension_config_v1';
export const LOCAL_COOLDOWN_KEY = 'aventa_extension_cooldown_until_v1';

/** Mensaje desde la página de auth bridge de Aventa. */
export type AuthBridgeMessage = {
  type: 'AVENTA_EXTENSION_SESSION';
  session: ExtensionSession;
  config: ExtensionConfig;
};

export type ContentExtractResponse =
  | { ok: true; data: import('./product').ExtractedProduct }
  | { ok: false; error: string };

export type ContentMessage =
  | { action: 'extractProduct' }
  | { action: 'ping' };
