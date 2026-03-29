import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Icono de inicio iOS: misma identidad que AventaIcon + gradiente violeta. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #6d28d9 0%, #a855f7 100%)',
          borderRadius: 40,
        }}
      >
        <svg
          width="112"
          height="112"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M 5.5 21 L 12 2.5"
            stroke="white"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 18.5 21 L 12 2.5"
            stroke="white"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
