import { createServerClient } from '@/lib/supabase/server';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readName(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const displayName = value.display_name;
  if (typeof displayName === 'string' && displayName.trim().length > 0) return displayName.trim();
  const username = value.username;
  if (typeof username === 'string' && username.trim().length > 0) return username.trim();
  return null;
}

/** Nombre visible. No lee columnas sensibles del perfil. */
export async function readTeamPersonName(userId: string): Promise<string> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, username')
      .eq('id', userId)
      .maybeSingle();
    if (error) return 'compañero';
    return readName(data) ?? 'compañero';
  } catch {
    return 'compañero';
  }
}
