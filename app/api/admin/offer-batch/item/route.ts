import { NextResponse } from 'next/server';
import { requireModeration } from '@/lib/server/requireAdmin';
import { createServerClient } from '@/lib/supabase/server';
import { ingestOfferObservation } from '@/lib/offers/ingestion/ingestOfferObservation';
import { OFFER_DESCRIPTION_MAX } from '@/lib/contracts/offers';

/**
 * Una oferta por request (evita timeout al parsear 20 Amazon).
 * Staff only. Idempotent via ingestion_identity_key + offer_observations.
 * Siempre pending al crear. No toca el formulario público.
 */
export async function POST(request: Request) {
  const auth = await requireModeration(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const description =
    typeof body?.description === 'string' && body.description.trim()
      ? body.description.trim().slice(0, OFFER_DESCRIPTION_MAX)
      : 'Oferta cargada por lote. Revisar ficha antes de aprobar.';

  const result = await ingestOfferObservation(createServerClient(), {
    createdBy: auth.user.id,
    source: 'community:batch',
    body: {
      ...body,
      description,
      tags: Array.isArray(body?.tags) ? [...body.tags, 'lote'] : ['lote'],
    },
    onDuplicate: 'reuse',
    forceLoteTag: true,
    allowMissingUrl: false,
    confidence: typeof body?.confidence === 'number' ? body.confidence : null,
    extractionMethod:
      typeof body?.extraction_method === 'string' ? body.extraction_method : 'batch_paste',
    seller: typeof body?.seller === 'string' ? body.seller : null,
    availability: typeof body?.availability === 'string' ? body.availability : null,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        ...(result.issues ? { issues: result.issues } : {}),
        ...(result.duplicate_offer_id != null
          ? {
              duplicate_offer_id: result.duplicate_offer_id,
              duplicate_status: result.duplicate_status,
            }
          : {}),
      },
      { status: result.httpStatus },
    );
  }

  return NextResponse.json({
    id: result.offerId,
    ok: true,
    status: result.status,
    created: result.created,
    observation_id: result.observationId,
    observation_reused: result.observationReused,
    identity_key: result.identityKey,
    identity_strategy: result.identityStrategy,
    conflicts: result.conflicts,
    schema_degraded: result.schemaDegraded,
  });
}
