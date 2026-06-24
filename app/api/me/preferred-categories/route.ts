import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import {
  mergePreferredCategories,
  sanitizePreferredCategoriesInput,
} from '@/lib/preferences/userPreferences';

/** GET: categorías preferidas del usuario (profiles.preferred_categories) */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const rl = await enforceRateLimit(`prefs:${user.id}`);
  if (!rl.success) return NextResponse.json({ error: 'Rate limit' }, { status: 429 });

  const { data, error } = await supabase
    .from('profiles')
    .select('preferred_categories')
    .eq('id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Error al cargar' }, { status: 500 });
  const cats = (data as { preferred_categories?: string[] | null } | null)?.preferred_categories;
  const normalized = mergePreferredCategories([], Array.isArray(cats) ? cats : []);
  return NextResponse.json({ preferred_categories: normalized });
}

/** PATCH: reemplaza categorías preferidas (normalizadas, sin duplicados). */
export async function PATCH(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const rl2 = await enforceRateLimit(`prefs:${user.id}`);
  if (!rl2.success) return NextResponse.json({ error: 'Rate limit' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const raw = sanitizePreferredCategoriesInput(body?.preferred_categories);
  if (raw === undefined) {
    return NextResponse.json({ error: 'preferred_categories requerido' }, { status: 400 });
  }

  const preferred_categories = mergePreferredCategories([], raw);

  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ preferred_categories })
    .eq('id', user.id);

  if (updateErr) return NextResponse.json({ error: 'Error al guardar' }, { status: 500 });
  return NextResponse.json({ ok: true, preferred_categories });
}
