import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getCommissionEligibility } from '@/lib/server/commissionEligibility';
import { isFiscalProfileComplete } from '@/lib/commissions/fiscal';
import { getCommissionFiscalProfile } from '@/lib/server/commissionFiscal';
import { COMMISSION_TERMS_VERSION } from '@/lib/commissions/constants';
import { isCommissionProgramPubliclyActive } from '@/lib/commissions/programStatus';
import { enforceRateLimitCustom } from '@/lib/server/rateLimit';

/**
 * POST: registrar aceptación de términos del programa de comisiones.
 * Requiere: elegible + datos fiscales completos + programa activo (env).
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const rl = await enforceRateLimitCustom(`commission-accept:${token.slice(0, 16)}`, 'reports');
  if (!rl.success) {
    return NextResponse.json({ error: 'Demasiados intentos. Espera un momento.' }, { status: 429 });
  }

  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const accept = body?.accept === true;
  if (!accept) {
    return NextResponse.json({ error: 'Debes aceptar los términos para continuar' }, { status: 400 });
  }

  if (!isCommissionProgramPubliclyActive()) {
    return NextResponse.json(
      {
        error:
          'El programa de comisiones aún no está abierto públicamente. AVENTA lo anunciará por canales oficiales.',
        programPubliclyActive: false,
      },
      { status: 403 },
    );
  }

  const eligibility = await getCommissionEligibility(supabase, user.id);
  if (!eligibility.eligible) {
    return NextResponse.json(
      {
        error: 'Aún no cumples los requisitos: necesitas 15 ofertas aprobadas, cada una con al menos 120 votos positivos.',
        ...eligibility,
      },
      { status: 403 },
    );
  }

  const fiscal = await getCommissionFiscalProfile(supabase, user.id);
  if (!isFiscalProfileComplete(fiscal)) {
    return NextResponse.json(
      {
        ...eligibility,
        error: 'Completa tu nombre legal y RFC antes de activar el programa.',
        fiscalComplete: false,
      },
      { status: 400 },
    );
  }

  if (eligibility.termsCurrent) {
    const updated = await getCommissionEligibility(supabase, user.id);
    return NextResponse.json({ ok: true, alreadyAccepted: true, ...updated });
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      commissions_accepted_at: new Date().toISOString(),
      commissions_terms_version: COMMISSION_TERMS_VERSION,
    })
    .eq('id', user.id);

  if (error) {
    if (error.message?.includes('column') || error.code === 'PGRST204') {
      return NextResponse.json(
        {
          error: 'Falta aplicar la migración SQL en Supabase (commissions_program_profiles.sql).',
          needsMigration: true,
        },
        { status: 503 },
      );
    }
    console.error('[commissions-accept]', error.message);
    return NextResponse.json({ error: 'No se pudo guardar la aceptación' }, { status: 500 });
  }

  const updated = await getCommissionEligibility(supabase, user.id);
  return NextResponse.json({ ok: true, ...updated });
}
