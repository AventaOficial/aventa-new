import type { User } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import type { Role } from '@/lib/admin/roles';

export async function isPlatformOwner(userId: string): Promise<boolean> {
  try {
    const { data, error } = await createServerClient()
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'owner')
      .limit(1);
    if (error) return false;
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

type OwnerOk = { user: User; role: Role };
type OwnerErr = { error: string; status: 401 | 403 };

/** Autoridad global del fundador. Único rol staff que permanece en `user_roles`. */
export async function requirePlatformOwnerBearer(request: Request): Promise<OwnerOk | OwnerErr> {
  const token = bearerToken(request);
  if (!token) return { error: 'Unauthorized', status: 401 };

  const supabase = createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: 'Unauthorized', status: 401 };

  if (!(await isPlatformOwner(user.id))) return { error: 'Forbidden', status: 403 };
  return { user, role: 'owner' };
}
