import { cookies } from 'next/headers';
import { createServerAuthClient } from '@/lib/supabase/server-auth';
import { sessionIdFromAccessToken } from './token';

export type TeamActor = {
  userId: string;
  sessionId: string;
  email: string | null;
};

/**
 * La identidad sale de la sesión de Supabase ya validada con `getUser()`.
 * El `session_id` se lee del access token de esa misma sesión.
 */
export async function readTeamActor(): Promise<TeamActor | null> {
  const cookieStore = await cookies();
  const supabase = createServerAuthClient({
    getAll: async () => cookieStore.getAll(),
    set: () => {},
    delete: () => {},
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user) return null;

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  const accessToken = session?.access_token;
  if (!session || !accessToken || session.user.id !== user.id) return null;

  const sessionId = sessionIdFromAccessToken(accessToken);
  if (!sessionId) return null;

  return {
    userId: user.id,
    sessionId,
    email: user.email ?? null,
  };
}
