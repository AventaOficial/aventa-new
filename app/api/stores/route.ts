import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

/** GET: lista de tiendas distintas (ofertas aprobadas/publicadas) para filtros. */
export async function GET() {
  try {
    const supabase = createServerClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('ofertas_ranked_general')
      .select('store')
      .or('status.eq.approved,status.eq.published')
      .or(`expires_at.is.null,expires_at.gte.${now}`)
      .limit(2000);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const stores = [...new Set((data ?? []).map((r) => r?.store).filter((s): s is string => Boolean(s?.trim())))].sort(
      (a, b) => a.localeCompare(b, 'es')
    );
    return NextResponse.json({ stores });
  } catch (e) {
    return NextResponse.json({ error: 'Error al cargar tiendas' }, { status: 500 });
  }
}
