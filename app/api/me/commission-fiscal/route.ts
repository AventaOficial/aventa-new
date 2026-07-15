import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getCommissionEligibility } from '@/lib/server/commissionEligibility';
import { saveCommissionFiscalProfile } from '@/lib/server/commissionFiscal';
import { enforceRateLimitCustom } from '@/lib/server/rateLimit';

/** GET: datos fiscales del usuario para comisiones. POST/PATCH: guardar (solo si elegible o ya activo). */
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

  const status = await getCommissionEligibility(supabase, user.id);
  return NextResponse.json({
    fiscal: status.fiscal,
    fiscalComplete: status.fiscalComplete,
    eligible: status.eligible,
    acceptedAt: status.acceptedAt,
  });
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const rl = await enforceRateLimitCustom(`commission-fiscal:${token.slice(0, 16)}`, 'reports');
  if (!rl.success) {
    return NextResponse.json({ error: 'Demasiados intentos. Espera un momento.' }, { status: 429 });
  }

  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const eligibility = await getCommissionEligibility(supabase, user.id);
  if (!eligibility.eligible && !eligibility.acceptedAt) {
    return NextResponse.json(
      { error: 'Aún no cumples los requisitos para registrar datos fiscales de comisiones.' },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const result = await saveCommissionFiscalProfile(supabase, user.id, {
    legal_name: typeof body?.legal_name === 'string' ? body.legal_name : '',
    rfc: typeof body?.rfc === 'string' ? body.rfc : '',
    clabe: typeof body?.clabe === 'string' ? body.clabe : null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, needsMigration: result.needsMigration ?? false },
      { status: result.needsMigration ? 503 : 400 },
    );
  }

  const updated = await getCommissionEligibility(supabase, user.id);
  return NextResponse.json({ ok: true, ...updated });
}
