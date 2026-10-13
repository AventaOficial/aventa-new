import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { enforceRateLimit, getClientIp } from '@/lib/server/rateLimit';

const ALLOWED_KEYS = ['show_tester_offers'] as const;

/** GET: ?key=show_tester_offers. Público. Devuelve { value: boolean }. */
export async function GET(request: Request) {
  const rl = await enforceRateLimit(`cfg:${getClientIp(request)}`);
  if (!rl.success) return NextResponse.json({ value: false });

  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key')?.trim();
  if (!key || !ALLOWED_KEYS.includes(key as (typeof ALLOWED_KEYS)[number])) {
    return NextResponse.json({ value: false });
  }
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error('[app-config] read failed; ofertas de prueba apagadas', error.message);
      return NextResponse.json({ value: false });
    }
    const raw = (data as { value: unknown }).value;
    const value = key === 'show_tester_offers' ? (raw === true || raw === 'true') : false;
    return NextResponse.json({ value });
  } catch (error) {
    console.error('[app-config] read threw; ofertas de prueba apagadas', error instanceof Error ? error.message : error);
    return NextResponse.json({ value: false });
  }
}
