import { loadAcquisitionMetrics } from '@/lib/acquisition';
import { jsonOk, requireBatchAuth } from '@/lib/offers/batch/http';

export async function GET(request: Request) {
  const auth = await requireBatchAuth(request);
  if ('error' in auth) return auth.error;
  const sourceKey = new URL(request.url).searchParams.get('source');
  const rows = await loadAcquisitionMetrics(auth.supabase, { sourceKey });
  return jsonOk({ ok: true, rows });
}
