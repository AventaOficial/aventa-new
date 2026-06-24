import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import {
  mergePreferredCategories,
  preferredCategoriesEqual,
  sanitizePreferredCategoriesInput,
} from '@/lib/preferences/userPreferences';

async function loadExistingPreferences(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('preferred_categories')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new Error('load_failed');
  const cats = (data as { preferred_categories?: string[] | null } | null)?.preferred_categories;
  return Array.isArray(cats) ? cats : [];
}

/**
 * POST: fusiona preferencias del onboarding (u otra fuente) con el perfil.
 * Idempotente: si el merge no cambia nada, no escribe en BD.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const rl = await enforceRateLimit(`prefs:${user.id}`);
  if (!rl.success) return NextResponse.json({ error: 'Rate limit' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const incoming = sanitizePreferredCategoriesInput(body?.selections);
  if (!incoming?.length) {
    return NextResponse.json({ error: 'selections requerido' }, { status: 400 });
  }

  try {
    const existing = await loadExistingPreferences(supabase, user.id);
    const merged = mergePreferredCategories(existing, incoming);

    if (preferredCategoriesEqual(existing, merged)) {
      return NextResponse.json({
        ok: true,
        merged: false,
        preferred_categories: mergePreferredCategories([], existing),
      });
    }

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ preferred_categories: merged })
      .eq('id', user.id);

    if (updateErr) {
      return NextResponse.json({ error: 'Error al guardar' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, merged: true, preferred_categories: merged });
  } catch {
    return NextResponse.json({ error: 'Error al cargar' }, { status: 500 });
  }
}
