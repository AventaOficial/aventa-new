import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { enforceRateLimit, getClientIp } from '@/lib/server/rateLimit';
import {
  CATALOG_TARGETS_CONFIG_KEY,
  PRICE_BRACKETS,
  buildCatalogGaps,
  parseBracketTargets,
  type PriceBracketId,
} from '@/lib/catalog/priceBrackets';

export const revalidate = 300;

/**
 * GET: cuántas ofertas vivas hay por rango de presupuesto y cuántas faltan.
 * Público: lo consumen moderación, Plaza y la Guía del Cazador.
 */
export async function GET(request: Request) {
  const rl = await enforceRateLimit(`gaps:${getClientIp(request)}`);
  if (!rl.success) {
    return NextResponse.json({ error: 'Demasiadas peticiones' }, { status: 429 });
  }

  const supabase = createServerClient();
  const nowIso = new Date().toISOString();

  const targetsRow = await supabase
    .from('app_config')
    .select('value')
    .eq('key', CATALOG_TARGETS_CONFIG_KEY)
    .maybeSingle();
  const targets = parseBracketTargets((targetsRow.data as { value?: unknown } | null)?.value);

  const counts: Partial<Record<PriceBracketId, number>> = {};

  const results = await Promise.all(
    PRICE_BRACKETS.map(async (bracket) => {
      let query = supabase
        .from('offers')
        .select('id', { count: 'exact', head: true })
        .in('status', ['approved', 'published'])
        .or(`expires_at.is.null,expires_at.gte.${nowIso}`)
        .gte('price', bracket.min);
      if (bracket.max != null) {
        query = query.lt('price', bracket.max);
      }
      const { count, error } = await query;
      return { id: bracket.id, count: count ?? 0, error };
    })
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error('[catalog-gaps]', failed.error.message);
    return NextResponse.json({ error: 'No se pudo calcular el catálogo' }, { status: 500 });
  }

  for (const row of results) counts[row.id] = row.count;

  const gaps = buildCatalogGaps(counts, targets);
  const totalLive = gaps.reduce((sum, g) => sum + g.count, 0);
  const totalMissing = gaps.reduce((sum, g) => sum + g.missing, 0);

  return NextResponse.json({ gaps, totalLive, totalMissing, computedAt: nowIso });
}
