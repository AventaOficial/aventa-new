import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

/**
 * Sincroniza el perfil público (profiles) con los datos de Supabase Auth.
 * Solo se usa desde el cliente tras login; los datos vienen del servidor (getUser con token).
 * No se confía en el body; no se permite sobrescribir un display_name personalizado.
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user?.id) {
      return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });
    }

    const displayNameFromMeta =
      (user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.user_metadata?.display_name) as string | undefined;
    const displayName = typeof displayNameFromMeta === 'string' && displayNameFromMeta.trim()
      ? displayNameFromMeta.trim()
      : null;
    const fallbackName = user.email?.split('@')[0]?.trim() || null;
    const avatarUrl = (user.user_metadata?.avatar_url ?? user.user_metadata?.picture) as string | undefined;
    const avatarUrlVal = typeof avatarUrl === 'string' && avatarUrl.trim() ? avatarUrl.trim() : null;

    const { data: existing } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    const now = new Date().toISOString();

    if (!existing) {
      const nameToSet = displayName || fallbackName || 'Usuario';
      const { error: insertError } = await supabase.from('profiles').insert({
        id: user.id,
        display_name: nameToSet,
        avatar_url: avatarUrlVal,
        updated_at: now,
      });
      if (insertError) {
        console.error('[sync-profile] insert failed:', insertError.message);
        return NextResponse.json({ error: 'Error al crear perfil' }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    const currentName = existing.display_name?.trim() || null;
    const emailPart = user.email?.split('@')[0]?.trim() || null;
    const isGenericOrEmpty =
      !currentName ||
      currentName === 'Usuario' ||
      currentName === emailPart;

    const updates: { avatar_url: string | null; updated_at: string; display_name?: string } = {
      avatar_url: avatarUrlVal,
      updated_at: now,
    };
    if (isGenericOrEmpty && (displayName || fallbackName)) {
      updates.display_name = displayName || fallbackName || 'Usuario';
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);

    if (updateError) {
      console.error('[sync-profile] update failed:', updateError.message);
      return NextResponse.json({ error: 'Error al actualizar perfil' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[sync-profile] error:', e);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
