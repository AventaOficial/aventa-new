import { NextResponse } from 'next/server';
import { requireModeration } from '@/lib/server/requireAdmin';
import { createServerClient } from '@/lib/supabase/server';
import { createCommunityOfferPending } from '@/lib/offers/createCommunityOffer';
import { OFFER_DESCRIPTION_MAX } from '@/lib/contracts/offers';

/**
 * Una oferta por request (evita timeout al parsear 20 Amazon).
 * Staff only. Siempre pending. No toca el formulario público.
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

  const result = await createCommunityOfferPending({
    supabase: createServerClient(),
    createdBy: auth.user.id,
    sourceDetail: 'community:batch',
    body: {
      ...body,
      description,
      tags: Array.isArray(body?.tags) ? [...body.tags, 'lote'] : ['lote'],
    },
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

  return NextResponse.json({ id: result.id, ok: true, status: result.status });
}
