import { revalidateTag, unstable_cache } from 'next/cache';
import { createInteractiveServerClient } from '@/lib/supabase/server';
import { EMPTY_SOCIAL, parseSocialConfig, type SocialConfig } from '@/lib/social/config';

/** Solo servidor. `config.ts` se queda sin `next/cache` porque también lo importa el admin en cliente. */

export const SOCIAL_LINKS_CACHE_TAG = 'app-config:social_links';
export const SOCIAL_LINKS_REVALIDATE_SECONDS = 300;
const SOCIAL_LINKS_TIMEOUT_MS = 2_000;

async function readSocialLinks(): Promise<SocialConfig> {
  const { data, error } = await createInteractiveServerClient(SOCIAL_LINKS_TIMEOUT_MS)
    .from('app_config')
    .select('value')
    .eq('key', 'social_links')
    .maybeSingle();
  // Un fallo no se guarda en caché: el siguiente render vuelve a intentarlo.
  if (error) throw new Error(`social_links: ${error.message}`);
  return parseSocialConfig((data as { value?: unknown } | null)?.value);
}

const readCachedSocialLinks = unstable_cache(readSocialLinks, ['app-config', 'social_links'], {
  revalidate: SOCIAL_LINKS_REVALIDATE_SECONDS,
  tags: [SOCIAL_LINKS_CACHE_TAG],
});

/** Enlaces del footer. Una lectura por ventana de caché en lugar de una por render. */
export async function getSocialLinks(): Promise<SocialConfig> {
  try {
    return await readCachedSocialLinks();
  } catch {
    return EMPTY_SOCIAL;
  }
}

/** Tras escribir `app_config.social_links`. Fuera de una request no hay caché que invalidar. */
export function invalidateSocialLinks(): void {
  try {
    revalidateTag(SOCIAL_LINKS_CACHE_TAG, { expire: 0 });
  } catch (error) {
    console.error('[social] cache invalidation skipped', error instanceof Error ? error.name : 'error');
  }
}
