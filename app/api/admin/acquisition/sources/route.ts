import { listAcquisitionSources, registerAcquisitionSource, ACQUISITION_SOURCE_TYPES } from '@/lib/acquisition';
import { jsonError, jsonOk, requireBatchAuth } from '@/lib/offers/batch/http';

export async function GET(request: Request) {
  const auth = await requireBatchAuth(request);
  if ('error' in auth) return auth.error;
  const sources = await listAcquisitionSources(auth.supabase);
  return jsonOk({ ok: true, sources });
}

export async function POST(request: Request) {
  const auth = await requireBatchAuth(request);
  if ('error' in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const sourceKey = typeof body?.sourceKey === 'string' ? body.sourceKey : '';
  const sourceType = typeof body?.sourceType === 'string' ? body.sourceType : '';
  const displayName = typeof body?.displayName === 'string' ? body.displayName : '';
  const description = typeof body?.description === 'string' ? body.description : null;
  if (!ACQUISITION_SOURCE_TYPES.includes(sourceType as (typeof ACQUISITION_SOURCE_TYPES)[number])) {
    return jsonError('source_type inválido.', 400);
  }
  const result = await registerAcquisitionSource(auth.supabase, {
    sourceKey,
    sourceType: sourceType as (typeof ACQUISITION_SOURCE_TYPES)[number],
    displayName,
    description,
  });
  if (!result.ok) return jsonError(result.error, 400);
  return jsonOk({ ok: true, source: result.source });
}
