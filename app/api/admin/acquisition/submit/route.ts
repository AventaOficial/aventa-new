import { advanceAcquisitionSubmission, submitAcquisitionCandidates } from '@/lib/acquisition';
import { jsonError, jsonOk, requireBatchAuth } from '@/lib/offers/batch/http';

export const maxDuration = 60;

/**
 * Contrato para una tarea externa (ChatGPT u otra).
 * POST JSON: { sourceKey, text, externalRunId, discoveredAt }.
 * La tarea tiene que poder llamar HTTPS con el token de un staff.
 * Si no puede, no hay otro canal: no hay scraping ni automatización de navegador.
 */
export async function POST(request: Request) {
  const auth = await requireBatchAuth(request);
  if ('error' in auth) return auth.error;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return jsonError('Cuerpo inválido.', 400);
  const text = typeof body.text === 'string' ? body.text : '';
  const sourceKey = typeof body.sourceKey === 'string' ? body.sourceKey : '';
  const scoutId = typeof body.scoutId === 'string' ? body.scoutId : null;
  const externalRunId = typeof body.externalRunId === 'string' ? body.externalRunId : null;
  const discoveredAt = typeof body.discoveredAt === 'string' ? body.discoveredAt : null;
  const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
    ? (body.metadata as Record<string, unknown>)
    : null;
  const result = await submitAcquisitionCandidates({
    supabase: auth.supabase,
    actorUserId: auth.user.id,
    sourceKey,
    scoutId,
    text,
    externalRunId,
    discoveredAt,
    metadata,
  });
  if (!result.ok) return jsonError(result.error, result.httpStatus);
  if (result.accepted === 0 && result.idempotent === 0) return jsonOk({ ...result, advance: null });
  const advance = await advanceAcquisitionSubmission({
    supabase: auth.supabase,
    createdBy: auth.user.id,
    runId: result.submissionId,
  });
  return jsonOk({ ...result, advance });
}
