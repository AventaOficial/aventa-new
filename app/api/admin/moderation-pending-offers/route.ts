import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireModeration } from '@/lib/server/requireAdmin';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';

function hasMissingColumn(error: { message?: string } | null, columnName: string): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes(columnName.toLowerCase());
}

const SELECT_WITH_LOCK =
  'id, title, price, original_price, store, category, bank_coupon, coupons, image_url, image_urls, offer_url, description, steps, conditions, created_at, created_by, risk_score, moderator_comment, locked_by, locked_at, snoozed_until, profiles:public_profiles_view!created_by(display_name, avatar_url)';

const SELECT_BASE =
  'id, title, price, original_price, store, category, bank_coupon, coupons, image_url, image_urls, offer_url, description, steps, conditions, created_at, created_by, risk_score, moderator_comment, profiles:public_profiles_view!created_by(display_name, avatar_url)';

function computeIsBot(
  row: {
    created_by?: string | null;
    moderator_comment?: string | null;
    description?: string | null;
  },
  botIds: Set<string>
): boolean {
  if (row.created_by && botIds.has(row.created_by)) return true;
  if ((row.moderator_comment ?? '').toLowerCase().includes('[bot-ingest]')) return true;
  if ((row.description ?? '').toLowerCase().includes('ingesta automática (bot)')) return true;
  return false;
}

/**
 * Lista ofertas `pending` para la cola de moderación usando service_role.
 * El cliente en el navegador queda sujeto a RLS y puede no ver filas creadas por el bot (ingesta con service_role).
 */
export async function GET(request: Request) {
  const auth = await requireModeration(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createServerClient();
  const primary = await supabase
    .from('offers')
    .select(SELECT_WITH_LOCK)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  let data = primary.data;
  let error = primary.error;

  if (error && hasMissingColumn(error, 'locked_by')) {
    const fallback = await supabase
      .from('offers')
      .select(SELECT_BASE)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    data = fallback.data as typeof data;
    error = fallback.error;
  }

  if (error) {
    console.error('[moderation-pending-offers]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const lockerIds = [
    ...new Set(
      (data ?? [])
        .map((row) => (row as { locked_by?: string | null }).locked_by)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const lockerNames = new Map<string, string>();
  if (lockerIds.length > 0) {
    const { data: lockers } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', lockerIds);
    for (const p of lockers ?? []) {
      const id = (p as { id?: string }).id;
      const name = (p as { display_name?: string | null }).display_name?.trim();
      if (id && name) lockerNames.set(id, name);
    }
  }

  const config = loadBotIngestConfig('standard');
  const botIds = new Set(config.botUserIdsForQuota);
  const offers = (data ?? []).map((row) => {
    const lockedBy = (row as { locked_by?: string | null }).locked_by ?? null;
    return {
      ...row,
      locked_by_name: lockedBy ? lockerNames.get(lockedBy) ?? null : null,
      is_bot: computeIsBot(
        row as { created_by?: string | null; moderator_comment?: string | null; description?: string | null },
        botIds
      ),
    };
  });

  return NextResponse.json({ offers });
}
