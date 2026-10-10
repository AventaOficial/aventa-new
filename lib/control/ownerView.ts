import { listOperationalControls } from '@/lib/control/store';
import { createServerClient } from '@/lib/supabase/server';

/** Lectura de servidor del centro de control. La página del owner no abre el cliente. */
export async function readOwnerControlStorage(): Promise<'ready' | 'missing' | 'unknown'> {
  try {
    return (await listOperationalControls(createServerClient())).storage;
  } catch {
    return 'unknown';
  }
}
