import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { LEGAL_CONSENT_VERSION } from '@/lib/legal/constants';
import { enforceRateLimit } from '@/lib/server/rateLimit';

/** POST: registrar aceptación de Términos y Privacidad (registro u OAuth). */
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

  const rl = await enforceRateLimit(`legal-consent:${user.id}`);
  if (!rl.success) {
    return NextResponse.json({ error: 'Rate limit' }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const version =
    typeof body?.version === 'string' && body.version.trim()
      ? body.version.trim()
      : LEGAL_CONSENT_VERSION;

  if (version !== LEGAL_CONSENT_VERSION) {
    return NextResponse.json({ error: 'Versión legal no reconocida' }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { data: existing, error: readError } = await supabase
    .from('profiles')
    .select('terms_accepted_at, privacy_accepted_at, legal_consent_version')
    .eq('id', user.id)
    .maybeSingle();

  if (readError) {
    const missingColumns =
      readError.message?.includes('terms_accepted_at') ||
      readError.message?.includes('legal_consent_version') ||
      readError.code === 'PGRST204';
    if (missingColumns) {
      return NextResponse.json(
        {
          error: 'Migración pendiente',
          hint: 'Ejecuta docs/supabase-migrations/profiles_legal_consent.sql en Supabase.',
        },
        { status: 503 },
      );
    }
    console.error('[legal-consent] read failed:', readError.message);
    return NextResponse.json({ error: 'Error al leer perfil' }, { status: 500 });
  }

  const row = existing as {
    terms_accepted_at?: string | null;
    privacy_accepted_at?: string | null;
    legal_consent_version?: string | null;
  } | null;

  if (
    row?.terms_accepted_at &&
    row?.privacy_accepted_at &&
    row?.legal_consent_version === version
  ) {
    return NextResponse.json({ ok: true, alreadyRecorded: true });
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      terms_accepted_at: row?.terms_accepted_at ?? now,
      privacy_accepted_at: row?.privacy_accepted_at ?? now,
      legal_consent_version: version,
    })
    .eq('id', user.id);

  if (updateError) {
    console.error('[legal-consent] update failed:', updateError.message);
    return NextResponse.json({ error: 'Error al guardar consentimiento' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, recordedAt: now, version });
}
