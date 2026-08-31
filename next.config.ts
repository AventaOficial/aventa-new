import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : '';

const nextConfig: NextConfig = {
  async headers() {
    const connectSrc = [
      "'self'",
      supabaseHost ? `https://${supabaseHost}` : '',
      supabaseHost ? `wss://${supabaseHost}` : '',
      'https://*.supabase.co',
      'wss://*.supabase.co',
      'https://accounts.google.com',
    ]
      .filter(Boolean)
      .join(' ');

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "form-action 'self' https://accounts.google.com https://auth.mercadolibre.com.mx https://auth.mercadolibre.com",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              `connect-src ${connectSrc}`,
              "frame-src 'self' https://accounts.google.com",
              'upgrade-insecure-requests',
            ].join('; '),
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: '/communities', destination: '/', permanent: true },
      { source: '/communities/:path*', destination: '/', permanent: true },
      { source: '/admin/communities', destination: '/admin/moderation', permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      ...(supabaseHost ? [{ protocol: 'https' as const, hostname: supabaseHost, pathname: '/storage/**' }] : []),
      { protocol: 'https', hostname: 'placehold.co', pathname: '/**' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com', pathname: '/**' },
      { protocol: 'https', hostname: 'aventaofertas.com', pathname: '/**' },
      /* CDNs de retail (ofertas pegan URL de producto; sin esto next/image devuelve 400) */
      { protocol: 'https', hostname: 'http2.mlstatic.com', pathname: '/**' },
      { protocol: 'https', hostname: '**.mlstatic.com', pathname: '/**' },
      { protocol: 'https', hostname: 'm.media-amazon.com', pathname: '/**' },
      { protocol: 'https', hostname: 'images-na.ssl-images-amazon.com', pathname: '/**' },
      { protocol: 'https', hostname: 'images-eu.ssl-images-amazon.com', pathname: '/**' },
    ],
  },
};

export default nextConfig;
