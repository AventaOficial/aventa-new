import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireModeration } from '@/lib/server/requireAdmin';

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
  const { data, error } = await supabase
    .from('offers')
    .select(
      'id, title, price, original_price, store, category, bank_coupon, coupons, image_url, image_urls, offer_url, description, steps, conditions, created_at, created_by, risk_score, moderator_comment, profiles:public_profiles_view!created_by(display_name, avatar_url)'
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[moderation-pending-offers]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ offers: data ?? [] });
}
