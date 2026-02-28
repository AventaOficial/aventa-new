import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export type SimilarOffer = {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  store: string | null;
  created_at: string;
};

/**
 * GET ?store=...&title=...&offer_url=...
 * Devuelve ofertas aprobadas/publicadas similares:
 * - Misma tienda y (mismo offer_url si se pasa, o título similar por palabras).
 * Excluye ofertas ya expiradas.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const store = searchParams.get('store')?.trim();
  const title = searchParams.get('title')?.trim();
  const offerUrl = searchParams.get('offer_url')?.trim();

  if (!store && !title && !offerUrl) {
    return NextResponse.json({ similar: [] });
  }

  const supabase = createServerClient();
  const now = new Date().toISOString();

  const base = () =>
    supabase
      .from('offers')
      .select('id, title, price, original_price, store, created_at')
      .or('status.eq.approved,status.eq.published')
      .or(`expires_at.is.null,expires_at.gte.${now}`);

  // Duplicado exacto: mismo enlace (y misma tienda si viene)
  if (offerUrl) {
    let q = base().eq('offer_url', offerUrl);
    if (store) q = q.eq('store', store);
    const { data: byUrl } = await q.limit(5);
    if (byUrl?.length) {
      return NextResponse.json({ similar: byUrl as SimilarOffer[] });
    }
  }

  let query = base();
  if (store) query = query.eq('store', store);
  if (title) {
    const words = title.split(/\s+/).filter((w) => w.length > 2).slice(0, 4);
    if (words.length) query = query.ilike('title', `%${words[0]}%`);
  }
  const { data, error } = await query.order('created_at', { ascending: false }).limit(8);

  if (error) {
    return NextResponse.json({ similar: [] });
  }

  return NextResponse.json({ similar: (data ?? []) as SimilarOffer[] });
}
