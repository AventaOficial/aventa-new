import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { profileSlugFromDisplayName } from '@/lib/profileSlug';

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

    const rl = await enforceRateLimit(`sync:${user.id}`);
    if (!rl.success) return NextResponse.json({ error: 'Rate limit' }, { status: 429 });

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
      .select('id, display_name, avatar_url, display_name_updated_at')
      .eq('id', user.id)
      .maybeSingle();

    if (!existing) {
      const nameToSet = displayName || fallbackName || 'Usuario';
      const slug = profileSlugFromDisplayName(nameToSet, user.id);
      const { error: insertError } = await supabase.from('profiles').insert({
        id: user.id,
        display_name: nameToSet,
        avatar_url: avatarUrlVal,
        slug,
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

    // Si el usuario ya guardó nombre desde Configuración, no sobrescribir display_name/slug con OAuth
    const customNameAt = (existing as { display_name_updated_at?: string | null }).display_name_updated_at;
    if (customNameAt) {
      const { error: avatarOnlyError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrlVal })
        .eq('id', user.id);
      if (avatarOnlyError) {
        console.error('[sync-profile] avatar-only update failed:', avatarOnlyError.message);
        return NextResponse.json(
          { error: 'Error al actualizar perfil' },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true });
    }

    const displayNameToSet =
      (user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email?.split('@')[0] ?? 'Usuario') as string;
    const finalDisplayName = typeof displayNameToSet === 'string' && displayNameToSet.trim() ? displayNameToSet.trim() : (user.email?.split('@')[0] || 'Usuario');
    const slug = profileSlugFromDisplayName(finalDisplayName, user.id);
    const updates: { avatar_url: string | null; display_name: string; slug?: string } = {
      avatar_url: avatarUrlVal,
      display_name: finalDisplayName,
      slug,
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
