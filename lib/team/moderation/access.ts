import type { User } from '@supabase/supabase-js';
import type { Role } from '@/lib/admin/roles';
import { createServerClient } from '@/lib/supabase/server';
import { requireCollaboratorPermission, bearerToken } from '@/lib/server/collaboratorAuth';
import { planModerationAccess } from './plan';

type ActorOk = { user: User; role: Role };
type ActorError = { error: string; status: 401 | 403 };

/**
 * Autoridad de las acciones de la cola de moderación.
 * Solo Team OS (`moderation.offers.decide`) + owner; ya no usa roles staff en `user_roles`.
 */
export async function requireModerationActor(request: Request): Promise<ActorOk | ActorError> {
  const token = bearerToken(request);
  let bearerUser: User | null = null;
  if (token) {
    const supabase = createServerClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return { error: 'Unauthorized', status: 401 };
    bearerUser = data.user;
  }

  const team = await requireCollaboratorPermission(request, 'moderation.offers.decide');
  const plan = planModerationAccess({
    legacy: { ok: false, status: 403 },
    team: !('error' in team)
      ? { ok: true, userId: team.user.id, canDecide: true }
      : { ok: false, status: team.status === 401 ? 401 : 403 },
    bearerUserId: bearerUser?.id ?? null,
  });

  if (!plan.ok) {
    return {
      error: plan.status === 401 ? 'Unauthorized' : 'Forbidden',
      status: plan.status,
    };
  }

  const actorRole: Role =
    !('error' in team) && team.via === 'owner' ? 'owner' : plan.domainRole;

  if (bearerUser && bearerUser.id === plan.userId) {
    return { user: bearerUser, role: actorRole };
  }

  const supabase = createServerClient();
  const { data, error } = await supabase.auth.admin.getUserById(plan.userId);
  if (error || !data.user) return { error: 'Unauthorized', status: 401 };
  return { user: data.user, role: actorRole };
}
