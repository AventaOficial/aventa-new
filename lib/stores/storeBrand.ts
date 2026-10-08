export type RetailerKey = 'amazon' | 'mercado_libre' | 'costco' | 'soriana' | 'chedraui' | 'unknown';

export type StoreBrand = {
  key: RetailerKey;
  name: string;
  logoSrc: string | null;
  initials: string;
  bg: string;
  /** El icono oficial de ML es squircle amarillo, no un círculo con letras. */
  markShape: 'circle' | 'squircle';
  domains: string[];
};

export type RetailerPresentation = {
  key: RetailerKey;
  name: string;
  logo: string | null;
  fallback: string;
};

const KNOWN: Array<{
  key: Exclude<RetailerKey, 'unknown'>;
  match: RegExp;
  name: string;
  logoSrc: string;
  bg: string;
  markShape: StoreBrand['markShape'];
  domains: string[];
}> = [
  {
    key: 'mercado_libre',
    match: /mercado\s*libre|mercadolibre|mercadolivre/i,
    name: 'Mercado Libre',
    logoSrc: '/stores/mercado-libre.svg',
    bg: '#FFE600',
    markShape: 'squircle',
    domains: ['mercadolibre.com.mx', 'mercadolibre.com', 'mercadolivre.com.br'],
  },
  {
    key: 'amazon',
    match: /\bamazon\b/i,
    name: 'Amazon',
    logoSrc: '/stores/amazon.svg',
    bg: '#232F3E',
    markShape: 'circle',
    domains: ['amazon.com.mx', 'amazon.com'],
  },
  {
    key: 'costco',
    match: /\bcostco\b/i,
    name: 'Costco',
    logoSrc: '/stores/costco.svg',
    bg: '#E31837',
    markShape: 'circle',
    domains: ['costco.com.mx', 'costco.com'],
  },
  {
    key: 'soriana',
    match: /\bsoriana\b/i,
    name: 'Soriana',
    logoSrc: '/stores/soriana.svg',
    bg: '#E30613',
    markShape: 'circle',
    domains: ['soriana.com'],
  },
  {
    key: 'chedraui',
    match: /\bchedraui\b/i,
    name: 'Chedraui',
    logoSrc: '/stores/chedraui.svg',
    bg: '#F36F21',
    markShape: 'circle',
    domains: ['chedraui.com.mx'],
  },
];

function initialsFrom(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || 'TI';
}

/** Identidad visual de tienda. Una sola lista para feed, ficha, favoritos y moderación. */
export function resolveStoreBrand(store: string | null | undefined): StoreBrand {
  const trimmed = (store ?? '').trim() || 'Tienda';
  for (const known of KNOWN) {
    if (known.match.test(trimmed)) {
      return {
        key: known.key,
        name: known.name,
        logoSrc: known.logoSrc,
        initials: initialsFrom(known.name),
        bg: known.bg,
        markShape: known.markShape,
        domains: known.domains,
      };
    }
  }
  return {
    key: 'unknown',
    name: trimmed,
    logoSrc: null,
    initials: initialsFrom(trimmed),
    bg: '#7c3aed',
    markShape: 'circle',
    domains: [],
  };
}

export function getRetailerPresentation(store: string | null | undefined): RetailerPresentation {
  const brand = resolveStoreBrand(store);
  return {
    key: brand.key,
    name: brand.name,
    logo: brand.logoSrc,
    fallback: brand.initials,
  };
}
