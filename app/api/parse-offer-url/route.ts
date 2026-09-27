import { NextResponse } from 'next/server';
import { getClientIp, enforceRateLimitCustom } from '@/lib/server/rateLimit';
import {
  emptyParseOfferPayload,
  extractOfferFromUrl,
} from '@/lib/offers/offerExtraction/extractOfferFromUrl';

/**
 * Formulario público «Subir oferta»: analiza un enlace y sugiere título / fotos / precios.
 *
 * Este route sólo hace auth + rate limit. La extracción vive en
 * `lib/offers/offerExtraction/extractOfferFromUrl.ts` y la comparte con Batch Ingestion.
 * El contrato de respuesta (`ParseOfferPayload`) no cambia.
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
      return NextResponse.json({ error: 'Configuración inválida' }, { status: 500 });
    }

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
    if (!userRes.ok) {
      return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const outcome = await extractOfferFromUrl(typeof body?.url === 'string' ? body.url : '');
    return NextResponse.json(outcome.body, { status: outcome.httpStatus });
  } catch {
    return NextResponse.json(emptyParseOfferPayload('extract_failed'));
  }
}
