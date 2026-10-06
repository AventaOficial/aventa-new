import { NextRequest, NextResponse } from 'next/server';
import { requireBearerMeUser, meAuthFailureResponse } from '@/lib/server/requireMeUser';
import { enforceRateLimit } from '@/lib/server/rateLimit';

const MAX_BIO = 280;
const MAX_PLACE = 80;

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length > max) return undefined;
  return trimmed || null;
}

/** PATCH: bio, ubicación y privacidad. El rol authenticated no tiene UPDATE sobre profiles. */
export async function PATCH(request: NextRequest) {
  const auth = await requireBearerMeUser(request, { mutate: true });
  if ('error' in auth) return meAuthFailureResponse(auth);
  const { user, supabase } = auth;

  const rl = await enforceRateLimit(`profile-identity:${user.id}`);
  if (!rl.success) return NextResponse.json({ error: 'Demasiados intentos' }, { status: 429 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  const bio = optionalText(body.bio, MAX_BIO);
  const city = optionalText(body.city, MAX_PLACE);
  const state = optionalText(body.state, MAX_PLACE);
  if (bio === undefined || city === undefined || state === undefined) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }
  if (typeof body.show_location !== 'boolean' || typeof body.show_activity !== 'boolean') {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }
  if (body.profile_visibility !== 'public' && body.profile_visibility !== 'private') {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      bio,
      city,
      state,
      show_location: body.show_location,
      show_activity: body.show_activity,
      profile_visibility: body.profile_visibility,
    })
    .eq('id', user.id);

  if (error) return NextResponse.json({ error: 'No se pudo guardar el perfil.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
