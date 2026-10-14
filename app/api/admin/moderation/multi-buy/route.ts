import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireModerationActor } from '@/lib/team/moderation/access';
import { assertModeratorOwnsLock } from '@/lib/moderation/atomicModerationLock';
import { decideMultiBuy } from '@/lib/moderation/multiBuyDecision';

/**
 * POST: el moderador confirma o descarta la promoción NxM que declaró el bot.
 * Sólo ofertas pendientes con la oferta reclamada. Confirmar escribe el texto público en
 * `conditions`; descartar lo retira. No toca precio, recompensas ni economía.
 */
export async function POST(request: Request) {
  const auth = await requireModerationActor(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id : null;
  const decision = body?.decision === 'confirm' || body?.decision === 'reject' ? body.decision : null;
  if (!id || !decision) return NextResponse.json({ error: 'id y decision (confirm | reject) obligatorios' }, { status: 400 });

  const supabase = createServerClient();
  const { data: offer, error } = await supabase
    .from('offers')
    .select('id, status, price, conditions, bot_meta, locked_by, locked_at')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'No se pudo leer la oferta' }, { status: 500 });
  if (!offer || offer.status !== 'pending') {
    return NextResponse.json({ error: 'Solo se puede decidir la promoción de ofertas pendientes' }, { status: 400 });
  }
  const lock = assertModeratorOwnsLock({ locked_by: offer.locked_by ?? null, locked_at: offer.locked_at ?? null }, auth.user.id);
  if (!lock.ok) return NextResponse.json({ error: lock.error }, { status: 409 });

  const decided = decideMultiBuy({
    botMeta: offer.bot_meta,
    conditions: offer.conditions ?? null,
    price: Number(offer.price),
    decision,
    effectiveUnitPrice: body?.effective_unit_price,
    actorId: auth.user.id,
    now: new Date(),
  });
  if (!decided.ok) return NextResponse.json({ error: decided.error }, { status: 400 });

  const { data: updated, error: updateError } = await supabase
    .from('offers')
    .update({ bot_meta: decided.botMeta, conditions: decided.conditions })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (updateError) return NextResponse.json({ error: 'No se pudo guardar la decisión' }, { status: 500 });
  if (!updated) return NextResponse.json({ error: 'La oferta cambió de estado; recarga' }, { status: 409 });

  return NextResponse.json({ ok: true, multi_buy: decided.multiBuy, conditions: decided.conditions });
}
