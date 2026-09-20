import { NextResponse } from 'next/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import { createServerClient } from '@/lib/supabase/server';
import {
  HUNTER_INTELLIGENCE_RUNS_TABLE,
  HUNTER_OFFER_CANDIDATES_TABLE,
} from '@/lib/hunter/candidateIntelligence';

/** GET — recent Hunter Intelligence runs + optional candidates for a run_id. */
export async function GET(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let supabase;
  try {
    supabase = createServerClient();
  } catch {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const runId = searchParams.get('run_id')?.trim() || null;
  const decision = searchParams.get('decision')?.trim() || null;
  const reasonCode = searchParams.get('reason_code')?.trim() || null;
  const retailer = searchParams.get('retailer')?.trim() || null;
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? 50) || 50));

  if (!runId) {
    const { data: runs, error } = await supabase
      .from(HUNTER_INTELLIGENCE_RUNS_TABLE)
      .select('*')
      .order('started_at', { ascending: false })
      .limit(40);
    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          runs: [],
          note: 'Aplica migraciones 20260920_hunter_candidate_intelligence*.sql en staging si la tabla no existe.',
        },
        { status: 200 },
      );
    }
    return NextResponse.json({ ok: true, runs: runs ?? [] });
  }

  let q = supabase
    .from(HUNTER_OFFER_CANDIDATES_TABLE)
    .select(
      'id,run_id,candidate_key,source,retailer,title,canonical_url,source_url,sale_price,original_price,discount_percentage,hunter_score,decision,reason_code,reason_detail,rejection_stage,image_url,image_validation_status,image_validation_reason,diversity_cut,negative_memory_level,score_explanation,discovered_at',
    )
    .eq('run_id', runId)
    .order('discovered_at', { ascending: false })
    .limit(limit);

  if (decision) q = q.eq('decision', decision);
  if (reasonCode) q = q.eq('reason_code', reasonCode);
  if (retailer) q = q.eq('retailer', retailer);

  const [{ data: candidates, error: cErr }, { data: run }] = await Promise.all([
    q,
    supabase.from(HUNTER_INTELLIGENCE_RUNS_TABLE).select('*').eq('run_id', runId).maybeSingle(),
  ]);

  if (cErr) {
    return NextResponse.json({ ok: false, error: cErr.message, run: run ?? null, candidates: [] });
  }

  return NextResponse.json({
    ok: true,
    run: run ?? null,
    candidates: candidates ?? [],
  });
}
