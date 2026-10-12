import { ImageResponse } from 'next/og';
import { createServerClient } from '@/lib/supabase/server';
import { extractOfferIdFromPathSegment } from '@/lib/offerPath';
import { formatStoreDisplayName } from '@/lib/formatStoreDisplay';
import { compareWithListPrice, listPercentText } from '@/lib/offers/listPriceComparison';
import { PUBLIC_OFFER_DETAIL_STATUSES, presentOfferSharePreview } from '@/lib/offers/offerSharePreview';
import { normalizeOfferImageUrl } from '@/lib/offers/media/offerImageSource';

export const alt = 'Oferta en AVENTA';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = extractOfferIdFromPathSegment(raw);
  if (!id) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0f0f10',
            color: '#fff',
            fontSize: 48,
            fontFamily: 'system-ui',
          }}
        >
          AVENTA
        </div>
      ),
      { ...size }
    );
  }

  const supabase = createServerClient();
  const { data } = await supabase
    .from('offers')
    .select('title, price, original_price, store, image_url, status, deleted_at, expires_at')
    .eq('id', id)
    .in('status', [...PUBLIC_OFFER_DETAIL_STATUSES])
    .is('deleted_at', null)
    .maybeSingle();

  const row = data as {
    title?: string;
    price?: number;
    original_price?: number | null;
    store?: string | null;
    image_url?: string | null;
    status?: string | null;
    deleted_at?: string | null;
    expires_at?: string | null;
  } | null;
  const preview = presentOfferSharePreview(row);
  const offer = preview.visible ? row : null;
  const expired = preview.visible && preview.expired;

  const title = (offer?.title ?? 'Oferta').slice(0, 90);
  const price = typeof offer?.price === 'number' ? offer.price : null;
  const listComparison = compareWithListPrice(price, offer?.original_price);
  const original = listComparison?.listPrice ?? null;
  const discountPct = listComparison?.percent ?? null;
  const store = formatStoreDisplayName(offer?.store) || 'Tienda';
  const imageUrl = normalizeOfferImageUrl(offer?.image_url);
  const img = imageUrl.startsWith('http') ? imageUrl : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#0f0f10',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse at 20% 0%, rgba(139,92,246,0.35) 0%, transparent 50%)',
          }}
        />
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            padding: 48,
            gap: 40,
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: 420,
              height: 420,
              borderRadius: 28,
              background: '#1a1a1a',
              border: '1px solid #333',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={img}
                alt=""
                width={400}
                height={400}
                style={{ objectFit: 'contain', width: 400, height: 400 }}
              />
            ) : (
              <div style={{ color: '#71717a', fontSize: 28 }}>Sin foto</div>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minWidth: 0,
              gap: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                color: '#c4b5fd',
                fontSize: 22,
                fontWeight: 600,
              }}
            >
              <span>AVENTA</span>
              <span style={{ color: '#52525b' }}>·</span>
              <span style={{ color: '#a1a1aa' }}>{store}</span>
              {expired ? (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 18,
                    fontWeight: 700,
                    color: '#fbbf24',
                    border: '1px solid #92400e',
                    borderRadius: 999,
                    padding: '4px 12px',
                  }}
                >
                  Expirada
                </span>
              ) : null}
            </div>

            <div
              style={{
                fontSize: 44,
                fontWeight: 700,
                color: '#ffffff',
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
                display: 'flex',
              }}
            >
              {title}
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 8 }}>
              {price != null ? (
                <span style={{ fontSize: 56, fontWeight: 800, color: '#a78bfa' }}>
                  {formatMoney(price)}
                </span>
              ) : null}
              {original != null && discountPct != null && discountPct > 0 ? (
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 28,
                      color: '#71717a',
                      textDecoration: 'line-through',
                    }}
                  >
                    {formatMoney(original)}
                  </span>
                  <span
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      color: '#fff',
                      background: '#7c3aed',
                      borderRadius: 999,
                      padding: '6px 14px',
                    }}
                  >
                    {listPercentText(discountPct)}
                  </span>
                </span>
              ) : null}
            </div>

            <div style={{ marginTop: 24, fontSize: 22, color: '#a1a1aa' }}>
              Antes de comprar, revisa en Aventa
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
