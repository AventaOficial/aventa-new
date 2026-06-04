import { createServerClient } from '@/lib/supabase/server';

export type OfferHealthSummary = {
  tableAvailable: boolean;
  verifiedAvailable: number;
  priceChanged: number;
  outOfStock: number;
  activeWithoutCheck: number;
  lastScanNote: string;
};

function isMissingHealthTable(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('offer_health_state') || m.includes('does not exist') || m.includes('schema cache');
}

export async function fetchOfferHealthSummary(): Promise<OfferHealthSummary> {
  const supabase = createServerClient();
  const nowIso = new Date().toISOString();

  const { count: activeCount, error: activeErr } = await supabase
    .from('offers')
    .select('id', { count: 'exact', head: true })
    .in('status', ['approved', 'published'])
    .or(`expires_at.is.null,expires_at.gte.${nowIso}`);

  if (activeErr) {
    return {
      tableAvailable: false,
      verifiedAvailable: 0,
      priceChanged: 0,
      outOfStock: 0,
      activeWithoutCheck: activeCount ?? 0,
      lastScanNote: 'No se pudo contar ofertas activas.',
    };
  }

  const active = activeCount ?? 0;

  const [availRes, changedRes, oosRes, healthRowsRes] = await Promise.all([
    supabase
      .from('offer_health_state')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'available'),
    supabase
      .from('offer_health_state')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'price_changed'),
    supabase
      .from('offer_health_state')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'out_of_stock'),
    supabase.from('offer_health_state').select('offer_id'),
  ]);

  const firstErr = availRes.error ?? changedRes.error ?? oosRes.error ?? healthRowsRes.error;
  if (firstErr && isMissingHealthTable(firstErr.message ?? '')) {
    return {
      tableAvailable: false,
      verifiedAvailable: 0,
      priceChanged: 0,
      outOfStock: 0,
      activeWithoutCheck: active,
      lastScanNote:
        'Ejecuta la migración offer_health_state.sql en Supabase. Cron: cada 4 h, hasta 25 ofertas por ciclo.',
    };
  }

  const checked = healthRowsRes.data?.length ?? 0;
  const activeWithoutCheck = Math.max(0, active - checked);

  return {
    tableAvailable: true,
    verifiedAvailable: availRes.count ?? 0,
    priceChanged: changedRes.count ?? 0,
    outOfStock: oosRes.count ?? 0,
    activeWithoutCheck,
    lastScanNote:
      'Verificación automática cada 4 horas (hasta 25 ofertas con más clics / cambios de precio).',
  };
}
