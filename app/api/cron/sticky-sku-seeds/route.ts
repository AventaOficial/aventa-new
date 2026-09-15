import { NextRequest, NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { selectStickySkuTargets } from '@/lib/hunter/supply/stickySku';

/**
 * Lista de SKUs sticky para ml_worker (discovery-only seeds).
 * Auth: cron secret. No escribe ofertas.
 */
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const limitRaw = request.nextUrl.searchParams.get('limit');
  const limit = Math.min(
    36,
    Math.max(1, Number.parseInt(limitRaw ?? '12', 10) || 12),
  );

  const targets = await selectStickySkuTargets({
    config: { maxTargets: limit },
  });

  const seeds = targets.map((t) => {
    const compact = t.productId.replace(/-/g, '').toUpperCase();
    const m = /^(ML[A-Z]{0,3})(\d+)$/i.exec(compact);
    const path = m ? `${m[1]!.toUpperCase()}-${m[2]}` : compact;
    return {
      id: `sticky_${t.productId}`,
      url: `https://articulo.mercadolibre.com.mx/${path}`,
      productId: t.productId,
      priorDays: t.priorDays,
      hoursSinceObserved: t.hoursSinceObserved,
      discoveryMode: 'sticky' as const,
    };
  });

  return NextResponse.json(
    {
      ok: true,
      count: seeds.length,
      seeds,
      note: 'Usar con WORKER_DISCOVERY_ONLY=1. Solo discovery; dryRun en ingest.',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
