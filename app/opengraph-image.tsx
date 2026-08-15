import { ImageResponse } from 'next/og';

export const alt = 'AVENTA · Ofertas de la comunidad';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Imagen de marca fija para Google/redes — no usar fotos de producto. */
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f0f10',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.28) 0%, transparent 55%)',
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 96,
            height: 96,
            borderRadius: 24,
            background: '#1a1a1a',
            border: '1px solid #333',
            marginBottom: 28,
          }}
        >
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
            <path d="M 5.5 21 L 12 2.5" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
            <path d="M 18.5 21 L 12 2.5" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
            <path d="M 12 14.2 L 9.2 17.5 h 5.6 Z" fill="#8b5cf6" />
          </svg>
        </div>
        <div
          style={{
            fontSize: 80,
            fontWeight: 700,
            letterSpacing: '-0.03em',
            color: '#ffffff',
            marginBottom: 12,
          }}
        >
          AVENTA
        </div>
        <div
          style={{
            fontSize: 28,
            color: '#c4b5fd',
            fontWeight: 600,
            marginBottom: 10,
          }}
        >
          Ofertas de la comunidad
        </div>
        <div
          style={{
            fontSize: 22,
            color: '#a1a1aa',
            fontWeight: 500,
          }}
        >
          Antes de comprar, revisa aquí
        </div>
      </div>
    ),
    { ...size },
  );
}
