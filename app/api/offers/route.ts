import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getClientIp, enforceRateLimitCustom } from '@/lib/server/rateLimit';
import { REPUTATION_LEVEL_AUTO_APPROVE_OFFERS } from '@/lib/server/reputation';
import { normalizeCategoryForStorage } from '@/lib/categories';
import { normalizeBankCoupon } from '@/lib/bankCoupons';
import { createOfferInputSchema } from '@/lib/contracts/offers';
import { resolveAndNormalizeAffiliateOfferUrl } from '@/lib/affiliate';

type OfferInsertPayload = {
  title: string;
  price: number;
  original_price: number | null;
  store: string;
  category?: string;
  status: 'pending' | 'approved';
  created_by: string;
  expires_at?: string;
  image_url: string;
  image_urls?: string[];
  msi_months?: number;
  offer_url?: string;
  description?: string;
  steps?: string;
  conditions?: string;
  coupons?: string;
  bank_coupon?: string;
  tags?: string[];
  moderator_comment?: string;
};

function hasMissingColumn(error: { message?: string } | null, columnName: string): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes(columnName.toLowerCase());
}

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
    const parsed = createOfferInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Datos inválidos para crear oferta',
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }
    const input = parsed.data;

    const title = input.title.trim();
    const store = input.store.trim();
    if (!title || !store) {
      return NextResponse.json(
        { error: 'Título y tienda son obligatorios' },
        { status: 400 }
      );
    }

    const hasDiscount = input.hasDiscount !== false;
    const rawOriginal = hasDiscount && input.original_price != null ? Number(input.original_price) : null;
    const rawPrice = hasDiscount && input.price != null ? Number(input.price) : (rawOriginal ?? Number(input.original_price) ?? 0);
    const originalPrice = rawOriginal != null && Number.isFinite(rawOriginal) ? rawOriginal : null;
    const price = Number.isFinite(rawPrice) ? rawPrice : 0;

    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: 'Precio inválido' }, { status: 400 });
    }

    const imageUrlRaw = typeof input.image_url === 'string' ? input.image_url : null;
    const imageUrlsArr = Array.isArray(input.image_urls)
      ? input.image_urls.filter((u: unknown): u is string => typeof u === 'string' && u.trim() !== '')
      : [];
    const firstImage = imageUrlRaw ?? imageUrlsArr[0] ?? '/placeholder.png';
    const msiMonths = input.msi_months ?? null;

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

    const categoryRaw = typeof input.category === 'string' ? input.category : null;
    const category = normalizeCategoryForStorage(categoryRaw);
    const bankCoupon = normalizeBankCoupon(typeof input.bank_coupon === 'string' ? input.bank_coupon : null);
    const tags = Array.isArray(input.tags)
      ? [...new Set(input.tags
        .filter((v: unknown): v is string => typeof v === 'string')
        .map((v: string) => v.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 20))]
      : [];

    const rawOfferUrl = typeof input.offer_url === 'string' ? input.offer_url.trim() : '';
    const offerUrlNormalized = rawOfferUrl ? await resolveAndNormalizeAffiliateOfferUrl(rawOfferUrl) : '';

    const payload: OfferInsertPayload = {
      title,
      price,
      original_price: hasDiscount && originalPrice != null && Number.isFinite(originalPrice)
        ? originalPrice
        : null,
      store,
      ...(category ? { category } : { category: 'other' }),
      status: offerStatus,
      created_by: createdBy,
      ...(expiresAt && { expires_at: expiresAt }),
      image_url: firstImage,
      ...(imageUrlsArr.length > 0 && { image_urls: imageUrlsArr }),
      ...(msiMonths != null && { msi_months: msiMonths }),
      ...(offerUrlNormalized && { offer_url: offerUrlNormalized }),
      ...(typeof input.description === 'string' && input.description.trim() && {
        description: input.description.trim(),
      }),
      ...(typeof input.steps === 'string' && input.steps.trim() && { steps: input.steps.trim() }),
      ...(typeof input.conditions === 'string' && input.conditions.trim() && {
        conditions: input.conditions.trim(),
      }),
      ...(typeof input.coupons === 'string' && input.coupons.trim() && {
        coupons: input.coupons.trim(),
      }),
      ...(bankCoupon && { bank_coupon: bankCoupon }),
      ...(tags.length > 0 && { tags }),
      ...(typeof input.moderator_comment === 'string' && input.moderator_comment.trim() && {
        moderator_comment: input.moderator_comment.trim().slice(0, 500),
      }),
    };

    let insertPayload: OfferInsertPayload = payload;
    let { data, error } = await supabase.from('offers').insert([insertPayload]).select('id').single();
    if (error && (hasMissingColumn(error, 'bank_coupon') || hasMissingColumn(error, 'tags'))) {
      const fallbackPayload: OfferInsertPayload = { ...payload };
      delete fallbackPayload.bank_coupon;
      delete fallbackPayload.tags;
      insertPayload = fallbackPayload;
      ({ data, error } = await supabase.from('offers').insert([insertPayload]).select('id').single());
    }

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
