import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

/**
 * GET: métricas agregadas para /me — votos positivos totales, comentarios en tus ofertas,
 * y cazadores ayudados (usuarios distintos que votaron arriba o hicieron clic "cazar" en tus ofertas).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const uid = user.id;

  const { data: offerRows, error: offerErr } = await supabase
    .from('offers')
    .select('id, upvotes_count')
    .eq('created_by', uid);

  if (offerErr) {
    console.error('[impact-stats] offers:', offerErr.message);
    return NextResponse.json({ error: 'Error al cargar ofertas' }, { status: 500 });
  }

  const offers = (offerRows ?? []) as { id: string; upvotes_count: number | null }[];
  const offerIds = offers.map((o) => o.id);

  const positiveVotesTotal = offers.reduce((s, o) => s + (o.upvotes_count ?? 0), 0);

  if (offerIds.length === 0) {
    return NextResponse.json({
      positiveVotesTotal: 0,
      commentsCount: 0,
      cazadoresAyudados: 0,
    });
  }

  const { count: commentsCount, error: comErr } = await supabase
    .from('comments')
    .select('id', { count: 'exact', head: true })
    .in('offer_id', offerIds)
    .eq('status', 'approved');

  if (comErr) {
    console.error('[impact-stats] comments:', comErr.message);
  }

  const { data: voteRows, error: voteErr } = await supabase
    .from('offer_votes')
    .select('user_id')
    .in('offer_id', offerIds)
    .in('value', [1, 2]);

  if (voteErr) {
    console.error('[impact-stats] votes:', voteErr.message);
  }

  const { data: outboundRows, error: outErr } = await supabase
    .from('offer_events')
    .select('user_id')
    .in('offer_id', offerIds)
    .eq('event_type', 'outbound')
    .not('user_id', 'is', null);

  if (outErr) {
    console.error('[impact-stats] outbound:', outErr.message);
  }

  const helpers = new Set<string>();
  for (const row of (voteRows ?? []) as { user_id: string }[]) {
    if (row.user_id && row.user_id !== uid) helpers.add(row.user_id);
  }
  for (const row of (outboundRows ?? []) as { user_id: string | null }[]) {
    if (row.user_id && row.user_id !== uid) helpers.add(row.user_id);
  }

  return NextResponse.json({
    positiveVotesTotal,
    commentsCount: commentsCount ?? 0,
    cazadoresAyudados: helpers.size,
  });
}
