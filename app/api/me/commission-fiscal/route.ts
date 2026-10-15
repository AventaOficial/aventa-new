import { NextResponse } from 'next/server';
import { requireBearerMeUser, meAuthFailureResponse } from '@/lib/server/requireMeUser';
import { getCommissionEligibility } from '@/lib/server/commissionEligibility';
import { saveCommissionFiscalProfile } from '@/lib/server/commissionFiscal';
import { enforceRateLimitCustom } from '@/lib/server/rateLimit';
import { isCommissionProgramPubliclyActive } from '@/lib/commissions/programStatus';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';
import { isMoneyPathFrozen, moneyPathFrozenHttpBody } from '@/lib/server/moneyPathFreeze';

/** GET: datos fiscales del usuario para comisiones. POST/PATCH: guardar (solo si elegible o ya activo). */
export async function GET(request: Request) {
  const auth = await requireBearerMeUser(request);
  if ('error' in auth) return meAuthFailureResponse(auth);
  const { user, supabase } = auth;

  const status = await getCommissionEligibility(supabase, user.id);
  return NextResponse.json({
    fiscal: status.fiscal,
    fiscalComplete: status.fiscalComplete,
    eligible: status.eligible,
    acceptedAt: status.acceptedAt,
  });
}

export async function POST(request: Request) {
  const auth = await requireBearerMeUser(request, { mutate: true });
  if ('error' in auth) return meAuthFailureResponse(auth);
  const { user, supabase } = auth;

  const rl = await enforceRateLimitCustom(`commission-fiscal:${user.id}`, 'reports');
  if (!rl.success) {
    return NextResponse.json({ error: 'Demasiados intentos. Espera un momento.' }, { status: 429 });
  }

  const programOn = isRewardsProgramActive() || isCommissionProgramPubliclyActive();
  if (!programOn) {
    return NextResponse.json(
      { error: 'El programa de recompensas o comisiones no está activo.', code: 'program_inactive' },
      { status: 403 },
    );
  }
  if (isMoneyPathFrozen()) {
    return NextResponse.json(moneyPathFrozenHttpBody(), { status: 503 });
  }

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
