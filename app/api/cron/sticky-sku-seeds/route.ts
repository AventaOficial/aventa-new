import { NextRequest, NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { selectStickySkuTargetsWithReport } from '@/lib/hunter/supply/stickySku';
import { nicheProfileById, enabledNicheProfiles } from '@/lib/hunter/supply/nicheProfiles';

/**
 * Inventario sticky niche-aware — SOLO lectura.
 * Requiere ?niche=beauty|electronics|day_to_day
 */
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const nicheId = (request.nextUrl.searchParams.get('niche') ?? '').trim();
  if (!nicheId || !nicheProfileById(nicheId)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'niche_required',
        niches: enabledNicheProfiles().map((n) => n.id),
        note: 'Pasa ?niche=beauty|electronics|day_to_day',
      },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const limitRaw = request.nextUrl.searchParams.get('limit');
  const limit = Math.min(
    36,
    Math.max(1, Number.parseInt(limitRaw ?? '8', 10) || 8),
  );

  const selection = await selectStickySkuTargetsWithReport({
    nicheId,
    config: { maxTargets: limit },
  });

  const seeds = selection.targets.map((t) => {
    const compact = t.productId.replace(/-/g, '').toUpperCase();
    const m = /^(ML[A-Z]{0,3})(\d+)$/i.exec(compact);
    const path = m ? `${m[1]!.toUpperCase()}-${m[2]}` : compact;
    return {
      id: `sticky_${t.productId}`,
      url: `https://articulo.mercadolibre.com.mx/${path}`,
      productId: t.productId,
      nicheId: t.nicheId,
      priorDays: t.priorDays,
      hoursSinceObserved: t.hoursSinceObserved,
      discoveryMode: 'sticky' as const,
    };
  });

  return NextResponse.json(
    {
      ok: true,
      nicheId,
      count: seeds.length,
      seeds,
      selection: {
        allowlistSize: selection.allowlistSize,
        poolHistoryReady: selection.poolHistoryReady,
        cooldownSkipped: selection.cooldownSkipped,
        budgetLimited: selection.budgetLimited,
        nicheBudget: selection.nicheBudget,
        globalBudget: selection.globalBudget,
        attributionReason: selection.attributionReason,
      },
      observationChannel: 'supply_engine_server_api',
      note: 'Inventario sticky niche-aware. Observar con runSupplyEngine(nicheId). No Playwright PDP.',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
