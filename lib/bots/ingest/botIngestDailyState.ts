import { createServerClient } from '@/lib/supabase/server';
import { formatYmdInTz, startOfZonedDayUtc } from './ingestZonedTime';

export const BOT_INGEST_LAST_BOOST_YMD_KEY = 'bot_ingest_last_boost_ymd';

export async function getBotIngestLastBoostYmd(): Promise<string | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', BOT_INGEST_LAST_BOOST_YMD_KEY)
    .maybeSingle();
  if (error || !data) return null;
  const raw = (data as { value: unknown }).value;
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

export async function setBotIngestLastBoostYmd(ymd: string): Promise<void> {
  const supabase = createServerClient();
  await supabase.from('app_config').upsert({ key: BOT_INGEST_LAST_BOOST_YMD_KEY, value: ymd }, { onConflict: 'key' });
}

export async function countBotOffersCreatedSince(botUserId: string, sinceUtc: Date): Promise<number> {
  const supabase = createServerClient();
  const { count, error } = await supabase
    .from('offers')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', botUserId)
    .gte('created_at', sinceUtc.toISOString());
  if (error) return 0;
  return count ?? 0;
}

export function getBotOfferCountStartUtc(timeZone: string, ref: Date = new Date()): Date {
  const ymd = formatYmdInTz(ref, timeZone);
  return startOfZonedDayUtc(ymd, timeZone);
}
