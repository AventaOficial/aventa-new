import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireOwner } from '@/lib/server/requireAdmin';
import {
  EquipoPasswordAction,
  loadAuthUserForEquipoPassword,
  sendEquipoPasswordRecoveryEmail,
  setTemporaryEquipoPassword,
} from '@/lib/admin/equipoPassword';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseAction(body: unknown): EquipoPasswordAction | null {
  if (!body || typeof body !== 'object' || !('action' in body)) return 'recovery_email';
  const action = (body as { action?: unknown }).action;
  if (action === 'recovery_email' || action === 'generate_temporary') return action;
  return null;
}

/** POST: enviar recuperación o (solo owner) contraseña temporal para acceso a Team OS. */
export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  const auth = await requireOwner(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { userId } = await context.params;
  const targetId = userId?.trim();
  if (!targetId) {
    return NextResponse.json({ error: 'userId requerido' }, { status: 400 });
  }
  if (targetId === auth.user.id) {
    return NextResponse.json(
      { error: 'No puedes cambiar tu propia contraseña desde la ficha de otro usuario.' },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const action = parseAction(body);
  if (!action) {
    return NextResponse.json({ error: 'action inválida' }, { status: 400 });
  }

  const supabase = createServerClient();
  const loaded = await loadAuthUserForEquipoPassword(supabase, targetId);
  if (!loaded.ok) {
    const status = loaded.code === 'not_found' ? 404 : 400;
    return NextResponse.json({ error: loaded.code }, { status });
  }

  if (action === 'generate_temporary') {
    const set = await setTemporaryEquipoPassword(supabase, targetId);
    if (!set.ok) {
      return NextResponse.json({ error: set.message }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      action,
      has_email_password: true,
      temporary_password: set.temporaryPassword,
      message: 'Esto cambia la contraseña global de Supabase Auth para toda Aventa, no una credencial independiente de Team OS. Compártela por un canal seguro y coordina su rotación con la persona.'
    });
  }

  const sent = await sendEquipoPasswordRecoveryEmail(supabase, loaded.email);
  if (!sent.ok) {
    return NextResponse.json({ error: sent.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    action,
    has_email_password: loaded.hasEmailPassword,
    message: `Enlace de contraseña enviado a ${loaded.email}.`,
  });
}
