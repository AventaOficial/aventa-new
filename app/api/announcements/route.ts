import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

/** GET: lista de avisos activos (pública, para la campana) */
export async function GET() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, body, link, sort_order, created_at')
    .eq('active', true)
    .order('sort_order', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[announcements] GET', error.message);
    return NextResponse.json({ error: 'Error al cargar avisos' }, { status: 500 });
  }
  return NextResponse.json({ announcements: data ?? [] });
}
