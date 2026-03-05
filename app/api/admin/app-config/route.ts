import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireOwner } from '@/lib/server/requireAdmin';

const ALLOWED_KEYS = ['show_tester_offers'] as const;

/** PATCH: solo owner. Body { key, value }. Actualiza app_config. */
export async function PATCH(request: Request) {
  const auth = await requireOwner(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = await request.json().catch(() => ({}));
  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  if (!key || !ALLOWED_KEYS.includes(key as (typeof ALLOWED_KEYS)[number])) {
    return NextResponse.json({ error: 'key inválido' }, { status: 400 });
  }
  let value: unknown = body?.value;
  if (key === 'show_tester_offers') {
    value = value === true || value === 'true';
  }
  const supabase = createServerClient();
  const { error } = await supabase
    .from('app_config')
    .upsert({ key, value }, { onConflict: 'key' });
  if (error) {
    console.error('[admin/app-config] upsert:', error.message);
    return NextResponse.json({ error: 'Error al guardar' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
