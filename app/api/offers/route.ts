import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getClientIp, enforceRateLimitCustom } from '@/lib/server/rateLimit';
import { REPUTATION_LEVEL_AUTO_APPROVE_OFFERS } from '@/lib/server/reputation';

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

    const supabase = createServerClient();
    try {
      const { data: ban } = await supabase
        .from('user_bans')
        .select('id')
        .eq('user_id', createdBy)
        .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
        .maybeSingle();
      if (ban) {
        return NextResponse.json(
          { error: 'No puedes publicar ofertas. Tu cuenta está restringida.' },
          { status: 403 }
        );
      }
    } catch {
      // user_bans puede no existir aún
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
    const rawOriginal = hasDiscount && body?.original_price != null ? Number(body.original_price) : null;
    const rawPrice = hasDiscount && body?.price != null ? Number(body.price) : (rawOriginal ?? Number(body.original_price) ?? 0);
    const originalPrice = rawOriginal != null && Number.isFinite(rawOriginal) ? Math.round(rawOriginal * 100) / 100 : null;
    const price = Number.isFinite(rawPrice) ? Math.round(rawPrice * 100) / 100 : 0;

    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: 'Precio inválido' }, { status: 400 });
    }

    const imageUrlRaw = typeof body?.image_url === 'string' ? body.image_url : null;
    const imageUrlsArr = Array.isArray(body?.image_urls)
      ? (body.image_urls as unknown[]).filter((u: unknown): u is string => typeof u === 'string' && u.trim() !== '')
      : [];
    const firstImage = imageUrlRaw ?? imageUrlsArr[0] ?? '/placeholder.png';
    const msiMonths =
      body?.msi_months != null && Number.isInteger(body.msi_months) && body.msi_months >= 1 && body.msi_months <= 24
        ? body.msi_months
        : null;

    let offerStatus: 'pending' | 'approved' = 'pending';
    let expiresAt: string | undefined;
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('reputation_level')
        .eq('id', createdBy)
        .maybeSingle();
      const level = (profile as { reputation_level?: number } | null)?.reputation_level ?? 1;
      if (level >= REPUTATION_LEVEL_AUTO_APPROVE_OFFERS) {
        offerStatus = 'approved';
        expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      }
    } catch {
      // si no existe la columna, mantener pending
    }

    const category = typeof body?.category === 'string' && body.category.trim() ? body.category.trim() : null;
    const payload = {
      title,
      price,
      original_price: hasDiscount && originalPrice != null && Number.isFinite(originalPrice)
        ? originalPrice
        : null,
      store,
      ...(category && { category }),
      status: offerStatus,
      created_by: createdBy,
      ...(expiresAt && { expires_at: expiresAt }),
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

    const { data, error } = await supabase.from('offers').insert([payload]).select('id').single();

    if (error) {
      console.error('[offers] insert failed:', error.message, error.details, error.code);
      const devMessage = process.env.NODE_ENV === 'development' ? error.message : undefined;
      return NextResponse.json(
        { error: 'Error al crear la oferta', ...(devMessage && { details: devMessage }) },
        { status: 500 }
      );
    }

    try {
      await supabase.rpc('increment_offers_submitted_count', { uuid: createdBy });
    } catch {}

    return NextResponse.json({ id: data?.id, ok: true });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error('[offers] error:', err.message, e);
    const devMessage = process.env.NODE_ENV === 'development' ? err.message : undefined;
    return NextResponse.json(
      { error: 'Error al crear la oferta', ...(devMessage && { details: devMessage }) },
      { status: 500 }
    );
  }
}
