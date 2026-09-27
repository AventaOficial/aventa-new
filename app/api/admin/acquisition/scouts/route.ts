import { registerAcquisitionScout } from '@/lib/acquisition';
import { jsonError, jsonOk, requireBatchAuth } from '@/lib/offers/batch/http';

export async function GET(request: Request) {
  const auth = await requireBatchAuth(request);
  if ('error' in auth) return auth.error;
  const sourceKey = new URL(request.url).searchParams.get('source');
  let query = auth.supabase
    .from('acquisition_scouts')
    .select('id, source_id, display_name, active, created_by, acquisition_sources!inner(source_key)')
    .eq('active', true)
    .order('display_name', { ascending: true });
  if (sourceKey) query = query.eq('acquisition_sources.source_key', sourceKey);
  const { data, error } = await query;
  if (error) return jsonError('No se pudieron leer los scouts.', 500);
  return jsonOk({ ok: true, scouts: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireBatchAuth(request);
  if ('error' in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const sourceKey = typeof body?.sourceKey === 'string' ? body.sourceKey : '';
  const displayName = typeof body?.displayName === 'string' ? body.displayName : '';
  const result = await registerAcquisitionScout(auth.supabase, {
    sourceKey,
    displayName,
    createdBy: auth.user.id,
  });
  if (!result.ok) return jsonError(result.error, result.httpStatus);
  return jsonOk({ ok: true, scout: result.scout });
}
