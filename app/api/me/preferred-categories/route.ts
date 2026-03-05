import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

/** GET: categorías preferidas del usuario (profiles.preferred_categories) */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await supabase
    .from('profiles')
    .select('preferred_categories')
    .eq('id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Error al cargar' }, { status: 500 });
  const cats = (data as { preferred_categories?: string[] | null } | null)?.preferred_categories;
  return NextResponse.json({ preferred_categories: Array.isArray(cats) ? cats : [] });
}

/** PATCH: actualizar categorías preferidas. Body: { preferred_categories: string[] } */
export async function PATCH(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const raw = body?.preferred_categories;
  const preferred_categories = Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim())
    : undefined;

  if (preferred_categories === undefined) return NextResponse.json({ error: 'preferred_categories requerido' }, { status: 400 });

  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ preferred_categories })
    .eq('id', user.id);

  if (updateErr) return NextResponse.json({ error: 'Error al guardar' }, { status: 500 });
  return NextResponse.json({ ok: true, preferred_categories });
}
