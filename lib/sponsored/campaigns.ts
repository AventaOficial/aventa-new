import type { SponsoredCampaign } from './placements';

/**
 * Campañas vigentes del Home. Hoy solo hay espacios house (sin anunciante que pague).
 * Una campaña vendida se agrega aquí con `kind: 'paid'`, fechas y tope; el feed no cambia.
 */
export const SPONSORED_CAMPAIGNS: readonly SponsoredCampaign[] = [
  {
    id: 'house-amazon-electronica',
    kind: 'house',
    store: 'Amazon',
    creative: { title: 'Hasta 30% en electrónicos', cta: 'Ver ofertas' },
    surfaces: ['feed'],
    priority: 0,
    active: true,
    maxPerFeed: 1,
  },
  {
    id: 'house-costco-tecnologia',
    kind: 'house',
    store: 'Costco',
    creative: { title: 'Hasta 25% en tecnología', cta: 'Ver ofertas' },
    surfaces: ['rail'],
    priority: 0,
    active: true,
    maxPerFeed: 1,
  },
];
