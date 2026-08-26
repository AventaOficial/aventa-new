import { ImageResponse } from 'next/og';
import { createServerClient } from '@/lib/supabase/server';
import { extractOfferIdFromPathSegment } from '@/lib/offerPath';
import { formatStoreDisplayName } from '@/lib/formatStoreDisplay';

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
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('offers')
    .select('title, price, original_price, store, image_url')
    .eq('id', id)
    .eq('status', 'approved')
    .or(`expires_at.is.null,expires_at.gte.${now}`)
    .maybeSingle();

  const offer = data as {
    title?: string;
    price?: number;
    original_price?: number | null;
    store?: string | null;
    image_url?: string | null;
  } | null;

  const title = (offer?.title ?? 'Oferta').slice(0, 90);
  const price = typeof offer?.price === 'number' ? offer.price : null;
  const original =
    typeof offer?.original_price === 'number' && offer.original_price > 0
      ? offer.original_price
      : null;
  const discountPct =
    price != null && original != null && original > price
      ? Math.round(((original - price) / original) * 100)
      : null;
  const store = formatStoreDisplayName(offer?.store) || 'Tienda';
  const img = offer?.image_url?.startsWith('http') ? offer.image_url : null;

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
                    −{discountPct}%
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
