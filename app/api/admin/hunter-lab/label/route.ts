import { NextResponse } from 'next/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import { createServerClient } from '@/lib/supabase/server';
import {
  HUNTER_CANDIDATE_LABELS_TABLE,
  HUNTER_HUMAN_DECISIONS,
  classifyLabelOutcome,
  type HunterHumanDecision,
} from '@/lib/hunter/candidateIntelligence';

/** POST — human label on a hunter candidate (never publishes). */
export async function POST(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const candidateId = typeof body.candidate_id === 'string' ? body.candidate_id.trim() : '';
  const hunterDecision =
    typeof body.hunter_decision === 'string' ? body.hunter_decision.trim() : '';
  const humanDecision =
    typeof body.human_decision === 'string' ? body.human_decision.trim() : '';
  const reasonCode = typeof body.reason_code === 'string' ? body.reason_code.trim() : null;
  const reasonDetail = typeof body.reason_detail === 'string' ? body.reason_detail.trim() : null;

  if (!candidateId || !hunterDecision || !humanDecision) {
    return NextResponse.json(
      { error: 'candidate_id, hunter_decision y human_decision son obligatorios' },
      { status: 400 },
    );
  }
  if (!(HUNTER_HUMAN_DECISIONS as readonly string[]).includes(humanDecision)) {
    return NextResponse.json({ error: 'human_decision inválido' }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createServerClient();
  } catch {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 });
  }

  const outcome = classifyLabelOutcome({
    hunterDecision,
    humanDecision: humanDecision as HunterHumanDecision,
  });

  const { data, error } = await supabase
    .from(HUNTER_CANDIDATE_LABELS_TABLE)
    .insert({
      candidate_id: candidateId,
      hunter_decision: hunterDecision,
      human_decision: humanDecision,
      reason_code: reasonCode,
      reason_detail: reasonDetail,
      reviewer: auth.user?.email ?? auth.user?.id ?? 'admin',
    })
    .select('id, reviewed_at')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    label: data,
    outcome,
    note: 'Label registrado. No publica ofertas.',
  });
}
