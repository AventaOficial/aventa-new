import { createServerClient } from '@/lib/supabase/server';

export const BOT_INGEST_PAUSED_CONFIG_KEY = 'bot_ingest_paused';

/**
 * Si es true en app_config, el cron y "Ejecutar ahora" no procesan ofertas
 * (aunque BOT_INGEST_ENABLED=1 en Vercel). Por defecto sin fila = no pausado.
 */
export async function getBotIngestPausedFromDb(): Promise<boolean> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', BOT_INGEST_PAUSED_CONFIG_KEY)
    .maybeSingle();
  if (error || !data) return false;
  const raw = (data as { value: unknown }).value;
  return raw === true || raw === 'true';
}
