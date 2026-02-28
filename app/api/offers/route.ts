import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getClientIp, enforceRateLimitCustom } from '@/lib/server/rateLimit';

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rl = await enforceRateLimitCustom(ip, 'offers');
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Demasiadas ofertas. Espera un minuto antes de subir otra.' },
        { status: 429 }
      );
    }

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json({ error: 'Inicia sesión para subir ofertas' }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ error: 'Config error' }, { status: 500 });
    }

    const userRes = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
    if (!userRes.ok) {
      return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });
    }
    const userData = await userRes.json().catch(() => null);
    const createdBy = userData?.id ?? null;
    if (!createdBy) {
      return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const store = typeof body?.store === 'string' ? body.store.trim() : '';
    if (!title || !store) {
      return NextResponse.json(
        { error: 'Título y tienda son obligatorios' },
        { status: 400 }
      );
    }

    const hasDiscount = body?.hasDiscount !== false;
    const originalPrice = hasDiscount && body?.original_price != null
      ? Number(body.original_price)
      : null;
    const price = hasDiscount && body?.price != null
      ? Number(body.price)
      : (originalPrice ?? Number(body.original_price) ?? 0);

    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: 'Precio inválido' }, { status: 400 });
    }

    const imageUrlRaw = typeof body?.image_url === 'string' ? body.image_url : null;
    const imageUrlsArr = Array.isArray(body?.image_urls)
      ? body.image_urls.filter((u): u is string => typeof u === 'string' && u.trim() !== '')
      : [];
    const firstImage = imageUrlRaw ?? imageUrlsArr[0] ?? '/placeholder.png';
    const msiMonths =
      body?.msi_months != null && Number.isInteger(body.msi_months) && body.msi_months >= 1 && body.msi_months <= 24
        ? body.msi_months
        : null;

    const payload = {
      title,
      price,
      original_price: hasDiscount && originalPrice != null && Number.isFinite(originalPrice)
        ? originalPrice
        : null,
      store,
      status: 'pending' as const,
      created_by: createdBy,
      image_url: firstImage,
      ...(imageUrlsArr.length > 0 && { image_urls: imageUrlsArr }),
      ...(msiMonths != null && { msi_months: msiMonths }),
      ...(typeof body?.offer_url === 'string' && body.offer_url.trim() && {
        offer_url: body.offer_url.trim(),
      }),
      ...(typeof body?.description === 'string' && body.description.trim() && {
        description: body.description.trim(),
      }),
      ...(typeof body?.steps === 'string' && body.steps.trim() && { steps: body.steps.trim() }),
      ...(typeof body?.conditions === 'string' && body.conditions.trim() && {
        conditions: body.conditions.trim(),
      }),
      ...(typeof body?.coupons === 'string' && body.coupons.trim() && {
        coupons: body.coupons.trim(),
      }),
    };

    const supabase = createServerClient();
    const { data, error } = await supabase.from('offers').insert([payload]).select('id').single();

    if (error) {
      console.error('[offers] insert failed:', error.message);
      return NextResponse.json({ error: 'Error al crear la oferta' }, { status: 500 });
    }

    try {
      await supabase.rpc('increment_offers_submitted_count', { uuid: createdBy });
    } catch {}

    return NextResponse.json({ id: data?.id, ok: true });
  } catch (e) {
    console.error('[offers] error:', e);
    return NextResponse.json({ error: 'Error al crear la oferta' }, { status: 500 });
  }
}
