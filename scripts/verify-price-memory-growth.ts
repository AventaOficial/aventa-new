/**
 * Verifica si Price Memory (product_price_snapshots) acumula entre corridas.
 * Read-only. No escribe ofertas.
 *
 *   npx tsx --env-file=.env.local scripts/verify-price-memory-growth.ts
 */
import { createClient } from '@supabase/supabase-js';

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { count: total, error: e1 } = await sb
    .from('product_price_snapshots')
    .select('*', { count: 'exact', head: true })
    .eq('marketplace', 'mercadolibre');

  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: recent, error: e2 } = await sb
    .from('product_price_snapshots')
    .select('product_id, recorded_on, last_price, min_price, list_price, recorded_at')
    .eq('marketplace', 'mercadolibre')
    .gte('recorded_on', since7)
    .order('recorded_at', { ascending: false })
    .limit(40);

  const byDay: Record<string, number> = {};
  for (const row of recent ?? []) {
    const d = String(row.recorded_on);
    byDay[d] = (byDay[d] ?? 0) + 1;
  }

  // Productos con ≥2 días distintos en la ventana
  const { data: multi, error: e3 } = await sb
    .from('product_price_snapshots')
    .select('product_id, recorded_on')
    .eq('marketplace', 'mercadolibre')
    .gte('recorded_on', since7)
    .limit(2000);

  const daysByProduct = new Map<string, Set<string>>();
  for (const row of multi ?? []) {
    const id = String(row.product_id);
    const set = daysByProduct.get(id) ?? new Set();
    set.add(String(row.recorded_on));
    daysByProduct.set(id, set);
  }
  const with2plus = [...daysByProduct.values()].filter((s) => s.size >= 2).length;
  const with4plus = [...daysByProduct.values()].filter((s) => s.size >= 4).length;

  console.log(
    JSON.stringify(
      {
        ok: !e1 && !e2 && !e3,
        errors: { e1, e2, e3 },
        totalRowsApprox: total,
        recentSampleSize: recent?.length ?? 0,
        byDayLast7: byDay,
        distinctProductsInSample: daysByProduct.size,
        productsWith2PlusDays: with2plus,
        productsWith4PlusDays_historyReadyEligible: with4plus,
        sample: (recent ?? []).slice(0, 8),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
