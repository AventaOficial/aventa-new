import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/server/rateLimit';

/**
 * POST: solicitar eliminación de cuenta desde Configuración.
 * Registra la solicitud en el perfil; la eliminación definitiva puede requerir
 * revisión manual por retenciones legales/fiscales (ver Política de Privacidad).
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user?.id) {
    return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });
  }

  const rl = await enforceRateLimit(`account-deletion:${user.id}`);
  if (!rl.success) {
    return NextResponse.json({ error: 'Demasiados intentos. Intenta más tarde.' }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const confirm = body?.confirm === true;
  if (!confirm) {
    return NextResponse.json({ error: 'Confirmación requerida' }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { data: existing, error: readError } = await supabase
    .from('profiles')
    .select('account_deletion_requested_at')
    .eq('id', user.id)
    .maybeSingle();

  if (readError) {
    const missingColumn =
      readError.message?.includes('account_deletion_requested_at') ||
      readError.code === 'PGRST204';
    if (missingColumn) {
      return NextResponse.json(
        {
          error: 'Migración pendiente',
          hint: 'Ejecuta docs/supabase-migrations/profiles_legal_consent.sql en Supabase.',
        },
        { status: 503 },
      );
    }
    console.error('[request-account-deletion] read failed:', readError.message);
    return NextResponse.json({ error: 'Error al leer perfil' }, { status: 500 });
  }

  const row = existing as { account_deletion_requested_at?: string | null } | null;
  if (row?.account_deletion_requested_at) {
    return NextResponse.json({
      ok: true,
      alreadyRequested: true,
      requestedAt: row.account_deletion_requested_at,
    });
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ account_deletion_requested_at: now })
    .eq('id', user.id);

  if (updateError) {
    console.error('[request-account-deletion] update failed:', updateError.message);
    return NextResponse.json({ error: 'No se pudo registrar la solicitud' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    requestedAt: now,
    message:
      'Solicitud registrada. Procesaremos la eliminación conforme a la Política de Privacidad. ' +
      'Puedes escribir a aventasoportelegal@gmail.com si necesitas seguimiento.',
  });
}
