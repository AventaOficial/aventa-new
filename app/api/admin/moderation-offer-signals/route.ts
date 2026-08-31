import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireModeration } from '@/lib/server/requireAdmin';
import { fetchOfferModerationSignals } from '@/lib/moderation/moderationQueueSignals';

/** GET ?offerId=&createdBy= — señales A/B/C para la oferta abierta. */
export async function GET(request: Request) {
  const auth = await requireModeration(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const offerId = searchParams.get('offerId')?.trim();
  const createdBy = searchParams.get('createdBy')?.trim() || null;

  if (!offerId) {
    return NextResponse.json({ error: 'offerId obligatorio' }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    const signals = await fetchOfferModerationSignals(supabase, offerId, createdBy);
    return NextResponse.json({ ok: true, ...signals });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'No se pudieron cargar señales';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
