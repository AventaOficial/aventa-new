import { ImageResponse } from 'next/og';

export const alt = 'AVENTA - Comunidad de cazadores de ofertas';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

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
          background: 'linear-gradient(135deg, #1d1d1f 0%, #252528 50%, #1d1d1f 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 88,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: '#a78bfa',
            marginBottom: 20,
          }}
        >
          AVENTA
        </div>
        <div
          style={{
            fontSize: 32,
            color: '#d4d4d8',
            fontWeight: 500,
          }}
        >
          Comunidad de cazadores de ofertas
        </div>
        <div
          style={{
            fontSize: 24,
            color: '#71717a',
            marginTop: 16,
          }}
        >
          Cada peso ahorrado es un peso ganado.
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
