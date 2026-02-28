import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

/** Misma lógica que el frontend (slugFromUsername): minúsculas, espacios→-, solo a-z0-9- */
function toSlug(name: string | null): string | null {
  if (typeof name !== 'string' || !name.trim()) return null;
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

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

    // Temporal: confirmar que el sync se ejecuta (ver consola del servidor)
    console.log('SYNC PROFILE EXECUTED FOR:', user.id);

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

    if (!existing) {
      const nameToSet = displayName || fallbackName || 'Usuario';
      const slug = toSlug(nameToSet) || `user-${user.id.slice(0, 8)}`;
      const { error: insertError } = await supabase.from('profiles').insert({
        id: user.id,
        display_name: nameToSet,
        avatar_url: avatarUrlVal,
        ...(slug && { slug }),
      });
      if (insertError) {
        console.error('[sync-profile] insert failed:', insertError.message, insertError.details, insertError.code);
        const devMessage = process.env.NODE_ENV === 'development' ? insertError.message : undefined;
        return NextResponse.json(
          { error: 'Error al crear perfil', ...(devMessage && { details: devMessage }) },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true });
    }

    // Siempre actualizar display_name desde Auth (y slug para perfil público /u/[slug])
    const displayNameToSet =
      (user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email?.split('@')[0] ?? 'Usuario') as string;
    const finalDisplayName = typeof displayNameToSet === 'string' && displayNameToSet.trim() ? displayNameToSet.trim() : (user.email?.split('@')[0] || 'Usuario');
    const slug = toSlug(finalDisplayName) || `user-${user.id.slice(0, 8)}`;
    const updates: { avatar_url: string | null; display_name: string; slug?: string } = {
      avatar_url: avatarUrlVal,
      display_name: finalDisplayName,
      ...(slug && { slug }),
    };

    const { error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);

    if (updateError) {
      console.error('[sync-profile] update failed:', updateError.message, updateError.details, updateError.code);
      const devMessage = process.env.NODE_ENV === 'development' ? updateError.message : undefined;
      return NextResponse.json(
        { error: 'Error al actualizar perfil', ...(devMessage && { details: devMessage }) },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error('[sync-profile] error:', err.message, err);
    const devMessage = process.env.NODE_ENV === 'development' ? err.message : undefined;
    return NextResponse.json(
      { error: 'Error interno', ...(devMessage && { details: devMessage }) },
      { status: 500 }
    );
  }
}
