import type { ExtensionConfig } from './types/messages';

/** Base de Aventa — actualizable vía auth bridge. */
export const DEFAULT_AVENTA_BASE = 'https://aventaofertas.com';

export const DEFAULT_CONFIG: ExtensionConfig = {
  aventaBase: DEFAULT_AVENTA_BASE,
  supabaseUrl: '',
  supabaseAnonKey: '',
};

export const AUTH_PATH = '/extension/auth';
