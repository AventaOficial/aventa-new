import type { User } from '@supabase/supabase-js';
import type { Role } from '@/lib/admin/roles';
import { createServerClient } from '@/lib/supabase/server';
import { requireModeration } from '@/lib/server/requireAdmin';
import { requireTeamPermission } from '@/lib/team/gate/require';
import { planModerationAccess } from './plan';

type ActorOk = { user: User; role: Role };
type ActorError = { error: string; status: 401 | 403 };

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Autoridad de las acciones de la cola existente.
 * Primero el camino de staff (`user_roles`) para no romper /equipo.
 * Si ese camino no autoriza, exige gate + membresía ACTIVE de moderation
 * + `moderation.offers.decide`. El usuario sale de la sesión, nunca del body.
 */
export async function requireModerationActor(request: Request): Promise<ActorOk | ActorError> {
  const legacy = await requireModeration(request);
  if (!('error' in legacy)) return legacy;

  const token = bearerToken(request);
  let bearerUser: User | null = null;
  if (token) {
    const supabase = createServerClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return { error: 'Unauthorized', status: 401 };
    bearerUser = data.user;
  }

  const team = await requireTeamPermission('moderation', 'moderation.offers.decide');
  const plan = planModerationAccess({
    legacy: { ok: false, status: legacy.status },
    team: team.ok
      ? { ok: true, userId: team.actor.userId, canDecide: true }
      : { ok: false, status: team.status === 401 ? 401 : 403 },
    bearerUserId: bearerUser?.id ?? null,
  });

  if (!plan.ok) {
    return {
      error: plan.status === 401 ? 'Unauthorized' : 'Forbidden',
      status: plan.status,
    };
  }

  if (bearerUser && bearerUser.id === plan.userId) {
    return { user: bearerUser, role: 'moderator' };
  }

  const supabase = createServerClient();
  const { data, error } = await supabase.auth.admin.getUserById(plan.userId);
  if (error || !data.user) return { error: 'Unauthorized', status: 401 };
  return { user: data.user, role: 'moderator' };
}
