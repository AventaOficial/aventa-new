import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AVENTA - Ofertas antes de comprar',
    short_name: 'AVENTA',
    description: 'Revisa el precio antes de comprar en otra tienda. Ofertas ordenadas por votos.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F5F5F7',
    theme_color: '#7c3aed',
    icons: [
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
