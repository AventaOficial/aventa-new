import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireModeration } from '@/lib/server/requireAdmin';
import { resolveAndNormalizeAffiliateOfferUrl } from '@/lib/affiliate';

/** Normaliza enlaces de ofertas pendientes al abrir moderación (batch). */
export async function POST(request: Request) {
  const auth = await requireModeration(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const limitRaw = Number(body?.limit);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 200;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('offers')
    .select('id, offer_url')
    .eq('status', 'pending')
    .not('offer_url', 'is', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[moderation-normalize-links] read:', error.message);
    return NextResponse.json({ error: 'No se pudieron leer ofertas pendientes' }, { status: 500 });
  }

  let scanned = 0;
  let updated = 0;
  let failed = 0;

  for (const row of data ?? []) {
    const id = (row as { id?: string }).id;
    const raw = ((row as { offer_url?: string | null }).offer_url ?? '').trim();
    if (!id || !raw) continue;
    scanned += 1;
    try {
      const normalized = await resolveAndNormalizeAffiliateOfferUrl(raw);
      if (normalized && normalized !== raw) {
        const { error: upError } = await supabase.from('offers').update({ offer_url: normalized }).eq('id', id);
        if (upError) failed += 1;
        else updated += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return NextResponse.json({ ok: true, scanned, updated, failed, limit });
}
