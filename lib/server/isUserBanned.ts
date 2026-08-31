import type { SupabaseClient } from '@supabase/supabase-js';

/** Usuario con ban activo (sin expirar o permanente). */
export async function isUserBanned(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  try {
    const { data: ban } = await supabase
      .from('user_bans')
      .select('id')
      .eq('user_id', userId)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .maybeSingle();
    return Boolean(ban);
  } catch {
    return false;
  }
}
