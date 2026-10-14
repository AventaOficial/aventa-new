import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireModerationActor } from '@/lib/team/moderation/access';
import { isBotUserId } from '@/lib/bots/ingest/isBotUserId';
import { invalidatePublicOffer } from '@/lib/offers/publicOfferCache';
import { loadMachineAuthorIds } from '@/lib/offers/machineAuthors';
import { isSupplyHunterCode } from '@/lib/product/hunters/identity';
import { offerLaneCode } from '@/lib/product/hunters/lane';

const EDITABLE_STATUSES = new Set(['pending', 'approved', 'published']);

/**
 * POST { id, hunterCode }: el moderador corrige qué hunter presenta una oferta de bot.
 * Sólo cambia `bot_meta.hunter_code` (y deja rastro de quién y cuándo). No toca precio,
 * estado, autor, recompensas ni economía. Una oferta de persona no tiene hunter.
 */
export async function POST(request: Request) {
  const auth = await requireModerationActor(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id : null;
  const hunterCode = isSupplyHunterCode(body?.hunterCode) ? body.hunterCode : null;
  if (!id || !hunterCode) return NextResponse.json({ error: 'id y hunterCode válidos obligatorios' }, { status: 400 });

  const supabase = createServerClient();
  const { data: offer, error } = await supabase
    .from('offers')
    .select('id, status, created_by, bot_meta, deleted_at')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'No se pudo leer la oferta' }, { status: 500 });
  if (!offer || offer.deleted_at || !EDITABLE_STATUSES.has(String(offer.status))) {
    return NextResponse.json({ error: 'Oferta no encontrada o no editable' }, { status: 404 });
  }
  if (!isBotUserId(offer.created_by)) {
    const machineIds = await loadMachineAuthorIds(supabase);
    if (!machineIds) return NextResponse.json({ error: 'No se pudo verificar el autor' }, { status: 503 });
    if (!offer.created_by || !machineIds.includes(String(offer.created_by))) {
      return NextResponse.json({ error: 'Solo las ofertas de bots tienen hunter' }, { status: 400 });
    }
  }

  const meta = offer.bot_meta && typeof offer.bot_meta === 'object' && !Array.isArray(offer.bot_meta)
    ? (offer.bot_meta as Record<string, unknown>)
    : {};
  const from = offerLaneCode(typeof meta.hunter_code === 'string' ? meta.hunter_code : null);
  if (from === hunterCode && meta.hunter_code === hunterCode) {
    return NextResponse.json({ ok: true, hunterCode, unchanged: true });
  }

  const { data: updated, error: updateError } = await supabase
    .from('offers')
    .update({
      bot_meta: {
        ...meta,
        hunter_code: hunterCode,
        hunter_code_change: { from, to: hunterCode, by: auth.user.id, at: new Date().toISOString() },
      },
    })
    .eq('id', id)
    .eq('status', offer.status)
    .select('id')
    .maybeSingle();
  if (updateError) return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
  if (!updated) return NextResponse.json({ error: 'La oferta cambió de estado; recarga' }, { status: 409 });

  invalidatePublicOffer(id);
  return NextResponse.json({ ok: true, hunterCode, from });
}
