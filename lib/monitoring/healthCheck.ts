import { createServerClient } from '@/lib/supabase/server';

export type HealthStatus = 'ok' | 'degraded' | 'error';

export type HealthSnapshot = {
  status: HealthStatus;
  offersCount: number | null;
  feedViewOk: boolean;
  checkedAt: string;
  message?: string;
};

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  const checkedAt = new Date().toISOString();
  try {
    const supabase = createServerClient();
    const { error: offersErr, count } = await supabase
      .from('offers')
      .select('id', { count: 'exact', head: true });

    if (offersErr) {
      return {
        status: 'error',
        offersCount: null,
        feedViewOk: false,
        checkedAt,
        message: offersErr.message,
      };
    }

    const { error: viewErr } = await supabase.from('ofertas_ranked_general').select('id').limit(1);

    if (viewErr) {
      return {
        status: 'degraded',
        offersCount: count ?? null,
        feedViewOk: false,
        checkedAt,
        message: viewErr.message,
      };
    }

    return {
      status: 'ok',
      offersCount: count ?? null,
      feedViewOk: true,
      checkedAt,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      status: 'error',
      offersCount: null,
      feedViewOk: false,
      checkedAt,
      message,
    };
  }
}
