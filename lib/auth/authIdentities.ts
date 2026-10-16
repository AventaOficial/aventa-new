import type { User } from '@supabase/supabase-js';

/** True si la cuenta puede iniciar sesión con email + contraseña (incluye quien ya definió clave tras Google). */
export function userHasEmailPasswordIdentity(user: User | null | undefined): boolean {
  const identities = user?.identities ?? [];
  return identities.some((identity) => identity.provider === 'email');
}

export function primaryAuthProviders(user: User | null | undefined): string[] {
  const identities = user?.identities ?? [];
  const providers = identities.map((i) => i.provider).filter(Boolean);
  return [...new Set(providers)];
}
