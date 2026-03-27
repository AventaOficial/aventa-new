import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getCommissionEligibility } from '@/lib/server/commissionEligibility';
import { COMMISSION_TERMS_VERSION } from '@/lib/commissions/constants';

/**
 * POST: registrar aceptación de términos del programa de comisiones.
 * Solo si el usuario ya es elegible (15 ofertas con votos positivos suficientes).
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

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
