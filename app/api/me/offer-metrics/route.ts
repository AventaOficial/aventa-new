import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/server/rateLimit';

export type OfferOwnerMetrics = {
  cazarClicks: number;
  views: number;
  shares: number;
};

type RpcRow = { offer_id: string; event_type: string; ct: number | string };

async function countsViaHeadQueries(
  supabase: ReturnType<typeof createServerClient>,
  offerIds: string[]
): Promise<Record<string, OfferOwnerMetrics>> {
  const out: Record<string, OfferOwnerMetrics> = {};
  for (const id of offerIds) {
    out[id] = { cazarClicks: 0, views: 0, shares: 0 };
  }
  const types: Array<{ key: keyof OfferOwnerMetrics; event: string }> = [
    { key: 'cazarClicks', event: 'cazar_cta' },
    { key: 'views', event: 'view' },
    { key: 'shares', event: 'share' },
  ];
  await Promise.all(
    offerIds.flatMap((id) =>
      types.map(async ({ key, event }) => {
        const { count, error } = await supabase
          .from('offer_events')
          .select('id', { count: 'exact', head: true })
          .eq('offer_id', id)
          .eq('event_type', event);
        if (!error && count != null) out[id][key] = count;
      })
    )
  );
  return out;
}

/** GET: métricas por oferta (solo el creador); vistas, compartidos, clics en «Cazar oferta». */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const rl = await enforceRateLimit(`me-metrics:${user.id}`);
  if (!rl.success) return NextResponse.json({ error: 'Rate limit' }, { status: 429 });

  const { data: rows, error: offersError } = await supabase
    .from('offers')
    .select('id')
    .eq('created_by', user.id);

  if (offersError) {
    console.error('[me/offer-metrics] offers:', offersError.message);
    return NextResponse.json({ error: 'Error al cargar' }, { status: 500 });
  }

  const offerIds = (rows ?? []).map((r: { id: string }) => r.id).filter(Boolean);
  if (offerIds.length === 0) {
    return NextResponse.json({ metrics: {} as Record<string, OfferOwnerMetrics> });
  }

  const empty = (): Record<string, OfferOwnerMetrics> => {
    const m: Record<string, OfferOwnerMetrics> = {};
    for (const id of offerIds) m[id] = { cazarClicks: 0, views: 0, shares: 0 };
    return m;
  };

  let metrics = empty();

  const { data: rpcData, error: rpcError } = await supabase.rpc('offer_event_counts_for_offers', {
    p_offer_ids: offerIds,
  });

  if (!rpcError && Array.isArray(rpcData)) {
    for (const row of rpcData as RpcRow[]) {
      const oid = String(row.offer_id ?? '');
      if (!offerIds.includes(oid)) continue;
      const et = String(row.event_type ?? '');
      const ct = Number(row.ct) || 0;
      if (!metrics[oid]) metrics[oid] = { cazarClicks: 0, views: 0, shares: 0 };
      if (et === 'cazar_cta') metrics[oid].cazarClicks = ct;
      else if (et === 'view') metrics[oid].views = ct;
      else if (et === 'share') metrics[oid].shares = ct;
    }
    return NextResponse.json({ metrics });
  }

  if (rpcError && process.env.NODE_ENV === 'development') {
    console.warn('[me/offer-metrics] RPC fallback:', rpcError.message);
  }

  metrics = await countsViaHeadQueries(supabase, offerIds);
  return NextResponse.json({ metrics });
}
