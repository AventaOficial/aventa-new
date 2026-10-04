import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireTeamManagement } from '@/lib/server/requireAdmin';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import {
  BOT_QUEUE_REJECTION_REASON,
  MODERATION_DELETE_BOT_CONFIRM_PHRASE,
} from '@/lib/moderation/deleteBotQueue';

function isBotOfferRow(
  row: {
    created_by?: string | null;
    moderator_comment?: string | null;
    description?: string | null;
  },
  botIds: Set<string>
): boolean {
  if (row.created_by && botIds.has(row.created_by)) return true;
  const mc = (row.moderator_comment ?? '').toLowerCase();
  if (mc.includes('[bot-ingest]')) return true;
  const desc = (row.description ?? '').toLowerCase();
  if (desc.includes('ingesta automática (bot)')) return true;
  return false;
}

/**
 * POST: rechaza (no borra) todas las ofertas pending identificadas como del bot.
 * Solo owner/admin + frase de confirmación. La oferta y su historial se conservan
 * (retention policy v2); cada rechazo queda en moderation_logs con el actor.
 */
export async function POST(request: Request) {
  const auth = await requireTeamManagement(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const confirm =
    typeof body?.confirmPhrase === 'string' ? body.confirmPhrase.trim() : '';
  if (confirm !== MODERATION_DELETE_BOT_CONFIRM_PHRASE) {
    return NextResponse.json(
      {
        error: `Confirma escribiendo exactamente: ${MODERATION_DELETE_BOT_CONFIRM_PHRASE}`,
      },
      { status: 400 }
    );
  }

  const config = loadBotIngestConfig('standard');
  const botIds = new Set(config.botUserIdsForQuota);
  if (botIds.size === 0) {
    return NextResponse.json(
      { error: 'No hay BOT_INGEST_USER_ID / TECH / STAPLES configurados; no se puede determinar el bot.' },
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  const { data: pendingRows, error: fetchErr } = await supabase
    .from('offers')
    .select('id, created_by, moderator_comment, description')
    .eq('status', 'pending');

  if (fetchErr) {
    console.error('[moderation-delete-bot-pending]', fetchErr.message);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  type Row = {
    id: string;
    created_by?: string | null;
    moderator_comment?: string | null;
    description?: string | null;
  };
  const ids = ((pendingRows ?? []) as Row[]).filter((row) => isBotOfferRow(row, botIds)).map((r) => r.id);

  if (ids.length === 0) {
    return NextResponse.json({ ok: true, rejected: 0, message: 'No había ofertas del bot pendientes.' });
  }

  const { data: rejected, error: rejectErr } = await supabase.rpc('reject_pending_offers_bulk', {
    p_offer_ids: ids,
    p_actor_id: auth.user.id,
    p_reason: BOT_QUEUE_REJECTION_REASON,
  });
  if (rejectErr) {
    console.error('[moderation-delete-bot-pending] reject:', rejectErr.message);
    return NextResponse.json({ error: 'No se pudo rechazar la cola del bot' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    rejected: typeof rejected === 'number' ? rejected : 0,
  });
}
