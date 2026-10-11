import type { SupabaseClient } from '@supabase/supabase-js';
import { presentPublicProfile, type ProfileIdentityInput } from '@/lib/profile/visibility';

/** Campos que la ficha pública puede mostrar. No incluye correo, teléfono ni ids. */
export type PublicAuthorCardFields = {
  bio: string | null;
  location: string | null;
};

export function toPublicAuthorCardFields(input: ProfileIdentityInput): PublicAuthorCardFields {
  const pub = presentPublicProfile(input);
  return { bio: pub.bio, location: pub.location };
}

export async function loadPublicAuthorCard(
  supabase: SupabaseClient,
  userId: string,
): Promise<PublicAuthorCardFields> {
  const { data, error } = await supabase
    .from('profiles')
    .select('bio, city, state, show_location, profile_visibility')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return { bio: null, location: null };
  return toPublicAuthorCardFields(data as ProfileIdentityInput);
}
