import { NextResponse } from 'next/server';
import { getClientIp, enforceRateLimitCustom } from '@/lib/server/rateLimit';
import { normalizePastedOfferUrl } from '@/lib/offerUrl';
import { extractOfferFromUrl } from '@/lib/offers/offerExtraction/extractOfferFromUrl';

/**
 * Formulario público. Auth y límite de uso viven aquí.
 * La extracción es únicamente `extractOfferFromUrl`.
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rl = await enforceRateLimitCustom(ip, 'parseOffer');
    if (!rl.success) {
      return NextResponse.json({ error: 'Demasiadas solicitudes. Espera un momento.' }, { status: 429 });
    }

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json({ error: 'Inicia sesión para analizar enlaces' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return NextResponse.json(
        { error: 'Configuración inválida', failureClass: 'INTERNAL_ERROR' },
        { status: 500 },
      );
    }

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
    if (!userRes.ok) {
      return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const rawUrl = normalizePastedOfferUrl(typeof body?.url === 'string' ? body.url : '');
    const outcome = await extractOfferFromUrl(rawUrl);
    return NextResponse.json(
      {
        ...outcome.body,
        seller: outcome.core.merchant.seller,
        availability: outcome.core.availability.status,
        brand: outcome.core.product.brand,
        rating: outcome.core.reputation.rating,
        review_count: outcome.core.reputation.reviewCount,
      },
      { status: outcome.httpStatus },
    );
  } catch (error) {
    console.error('[parse-offer-url]', error instanceof Error ? error.message : 'internal');
    return NextResponse.json(
      {
        title: null,
        image: null,
        images: [],
        store: null,
        suggested_discount_price: null,
        suggested_original_price: null,
        suggested_category: null,
        suggested_currency: null,
        reason: 'extract_failed',
        extraction_status: 'failed',
        missing: [],
        failureClass: 'INTERNAL_ERROR',
        error: 'Error interno de Aventa al leer la ficha.',
      },
      { status: 500 },
    );
  }
}
