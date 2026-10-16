import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireTeamManagement } from '@/lib/server/requireAdmin';
import {
  ASSIGNABLE_STAFF_ROLES,
  pickEffectiveRole,
  type Role,
} from '@/lib/admin/roles';
import { issueEquipoPasswordForOwner } from '@/lib/admin/equipoPassword';
import { effectiveRoleFromRows, loadAdminTeamRoster } from '@/lib/admin/teamRoster';

/** GET: roster unificado (roles de panel + membresías Team OS). */
export async function GET(request: NextRequest) {
  const auth = await requireTeamManagement(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createServerClient();
  try {
    const team = await loadAdminTeamRoster(supabase, {
      includePasswordLedger: auth.role === 'owner',
    });
    return NextResponse.json({ team, caller_role: auth.role });
  } catch (e) {
    console.error('[admin/team] roster:', e);
    return NextResponse.json({ error: 'Error al cargar equipo' }, { status: 500 });
  }
}

function canAssignRole(actor: Role, targetRole: Role): boolean {
  if (targetRole === 'owner') return false;
  if (targetRole === 'admin' || targetRole === 'gerente') return actor === 'owner';
  return actor === 'owner' || actor === 'admin';
}

/** POST: agregar usuario al equipo. Body: { user_id, role }. */
export async function POST(request: NextRequest) {
  const auth = await requireTeamManagement(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : null;
  const role =
    typeof body?.role === 'string' && ASSIGNABLE_STAFF_ROLES.includes(body.role as Role)
      ? (body.role as Role)
      : null;

  if (!userId || !role) {
    return NextResponse.json(
      {
        error:
          'Body debe incluir user_id y role (admin|gerente|finance|marketing|moderator|analyst)',
      },
      { status: 400 },
    );
  }

  if (!canAssignRole(auth.role, role)) {
    return NextResponse.json({ error: 'No tienes permiso para asignar ese rol' }, { status: 403 });
  }

  const supabase = createServerClient();

  const { data: existing } = await supabase.from('user_roles').select('user_id').eq('user_id', userId).maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: 'Ese usuario ya tiene un rol. Usa la tabla para cambiar su rol.' },
      { status: 400 },
    );
  }

  const { error: insertError } = await supabase.from('user_roles').insert({ user_id: userId, role });
  if (insertError) {
    console.error('[admin/team] POST insert:', insertError.message);
    return NextResponse.json({ error: 'Error al agregar al equipo' }, { status: 500 });
  }

  let temporary_password: string | undefined;
  if (auth.role === 'owner') {
    const issued = await issueEquipoPasswordForOwner(supabase, userId, auth.user.id);
    if (issued.ok) temporary_password = issued.temporaryPassword;
  }

  return NextResponse.json({
    ok: true,
    ...(temporary_password
      ? {
          temporary_password,
          message:
            'Rol asignado y contraseña Team OS generada. Compártela por un canal seguro; también aparece en la tabla.',
        }
      : {}),
  });
}

/** PATCH: actualizar rol. Body: { user_id, role }. */
export async function PATCH(request: NextRequest) {
  const auth = await requireTeamManagement(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : null;
  const role =
    typeof body?.role === 'string' && ASSIGNABLE_STAFF_ROLES.includes(body.role as Role)
      ? (body.role as Role)
      : null;

  if (!userId || !role) {
    return NextResponse.json(
      {
        error:
          'Body debe incluir user_id y role (admin|gerente|finance|marketing|moderator|analyst)',
      },
      { status: 400 },
    );
  }

  if (!canAssignRole(auth.role, role)) {
    return NextResponse.json({ error: 'No tienes permiso para asignar ese rol' }, { status: 403 });
  }

  const supabase = createServerClient();

  const { data: targetRows } = await supabase.from('user_roles').select('role').eq('user_id', userId);
  const targetEffective = effectiveRoleFromRows((targetRows ?? []) as { role: Role }[]);

  if (targetEffective === 'owner' && auth.role !== 'owner') {
    return NextResponse.json({ error: 'Solo el owner puede modificar la cuenta owner' }, { status: 403 });
  }

  if (targetEffective === 'admin' && auth.role !== 'owner' && userId !== auth.user.id) {
    return NextResponse.json({ error: 'Solo el owner puede modificar a otros admins' }, { status: 403 });
  }

  if (targetEffective === 'gerente' && auth.role !== 'owner' && role !== targetEffective) {
    return NextResponse.json({ error: 'Solo el owner puede cambiar el rol de un gerente' }, { status: 403 });
  }

  if (userId === auth.user.id && auth.role === 'owner' && role !== 'owner') {
    return NextResponse.json({ error: 'No puedes quitarte el rol owner a ti mismo' }, { status: 400 });
  }

  const { error: delError } = await supabase.from('user_roles').delete().eq('user_id', userId);
  if (delError) {
    return NextResponse.json({ error: 'Error al actualizar rol' }, { status: 500 });
  }

  const { error: insertError } = await supabase.from('user_roles').insert({ user_id: userId, role });
  if (insertError) {
    return NextResponse.json({ error: 'Error al guardar rol' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
