import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AVENTA - Comunidad de cazadores de ofertas',
    short_name: 'AVENTA',
    description: 'Las mejores ofertas que la comunidad encuentra. No vendemos nada — somos cazadores de ofertas.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F5F5F7',
    theme_color: '#7c3aed',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }],
  };
}
