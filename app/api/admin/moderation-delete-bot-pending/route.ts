import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireTeamManagement } from '@/lib/server/requireAdmin';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { deleteOffersByIdsCascade } from '@/lib/server/deleteOffersByIds';
import { MODERATION_DELETE_BOT_CONFIRM_PHRASE } from '@/lib/moderation/deleteBotQueue';

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
 * POST: elimina físicamente todas las ofertas pending identificadas como del bot.
 * Solo owner/admin + frase de confirmación. Uso: limpiar cola en pruebas.
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
    return NextResponse.json({ ok: true, deleted: 0, message: 'No había ofertas del bot pendientes.' });
  }

  const result = await deleteOffersByIdsCascade(supabase, ids);
  if (!result.ok) {
    console.error('[moderation-delete-bot-pending] cascade:', result.message);
    return NextResponse.json({ error: result.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    deleted: ids.length,
  });
}
