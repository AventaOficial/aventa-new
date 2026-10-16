import type { SupabaseClient } from '@supabase/supabase-js';

export type StaffEquipoCredentialRow = {
  user_id: string;
  temporary_password: string;
  generated_at: string;
};

export async function saveStaffEquipoCredential(
  supabase: SupabaseClient,
  userId: string,
  temporaryPassword: string,
  generatedBy: string,
): Promise<void> {
  const { error } = await supabase.from('staff_equipo_credentials').upsert(
    {
      user_id: userId,
      temporary_password: temporaryPassword,
      generated_at: new Date().toISOString(),
      generated_by: generatedBy,
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    console.warn('[staff_equipo_credentials] save failed', error.message);
  }
}

export async function loadStaffEquipoCredentials(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, { password: string; generated_at: string }>> {
  const out = new Map<string, { password: string; generated_at: string }>();
  if (userIds.length === 0) return out;
  const { data, error } = await supabase
    .from('staff_equipo_credentials')
    .select('user_id, temporary_password, generated_at')
    .in('user_id', userIds);
  if (error) {
    console.warn('[staff_equipo_credentials] load failed', error.message);
    return out;
  }
  for (const row of (data ?? []) as StaffEquipoCredentialRow[]) {
    if (!row.user_id || !row.temporary_password) continue;
    out.set(row.user_id, {
      password: row.temporary_password,
      generated_at: row.generated_at,
    });
  }
  return out;
}
