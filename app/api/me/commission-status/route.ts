import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getCommissionEligibility } from '@/lib/server/commissionEligibility';

/** GET: elegibilidad para activar comisiones (15 ofertas con ≥120 votos positivos cada una). */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const eligibility = await getCommissionEligibility(supabase, user.id);
  return NextResponse.json(eligibility);
}
