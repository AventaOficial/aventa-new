import { NextRequest, NextResponse } from 'next/server';
import { getHomeFeed } from '@/lib/offers/feedService';
import { loadDespensaOffers } from '@/lib/despensa/despensaFeed';
import { DESPENSA_RANK_RULES } from '@/lib/despensa/rank';
import { createServerClient } from '@/lib/supabase/server';
import { enforceRateLimitCustom, getClientIp } from '@/lib/server/rateLimit';

/**
 * Ofertas de Despensa vigentes (aprobadas o publicadas, de la última semana) con el historial
 * propio de precio. Público y sin datos personales: presupuesto e intereses se aplican en el cliente.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = await enforceRateLimitCustom(`despensa:${ip}`, 'feed');
  if (!rl.success) {
    return NextResponse.json({ success: false, error: 'Too many requests' }, { status: rl.status });
  }

  try {
    const feed = await getHomeFeed({ view: 'vitales', period: 'week', limit: 100 });
    if (!feed.success) {
      return NextResponse.json({ success: false, error: 'No se pudieron cargar las ofertas' }, { status: 502 });
    }
    const { offers, excludedCurrency } = await loadDespensaOffers(createServerClient({ timeoutMs: 8000 }), feed.data);
    return NextResponse.json(
      {
        success: true,
        offers,
        excludedCurrency,
        maxEvidenceAgeDays: DESPENSA_RANK_RULES.maxEvidenceAgeDays,
        generatedAt: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } },
    );
  } catch (error) {
    console.error('[DESPENSA API ERROR]', error);
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}
