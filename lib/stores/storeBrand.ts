export type StoreBrand = {
  name: string;
  logoSrc: string | null;
  initials: string;
  bg: string;
};

const KNOWN: Array<{ match: RegExp; name: string; logoSrc: string; bg: string }> = [
  {
    match: /mercado\s*libre|mercadolibre|mercadolivre/i,
    name: 'Mercado Libre',
    logoSrc: '/stores/mercado-libre.svg',
    bg: '#FFE600',
  },
  {
    match: /\bamazon\b/i,
    name: 'Amazon',
    logoSrc: '/stores/amazon.svg',
    bg: '#232F3E',
  },
];

function initialsFrom(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || 'TI';
}

/** Identidad visual de tienda para el feed (logo circular + nombre). */
export function resolveStoreBrand(store: string | null | undefined): StoreBrand {
  const trimmed = (store ?? '').trim() || 'Tienda';
  for (const known of KNOWN) {
    if (known.match.test(trimmed)) {
      return {
        name: known.name,
        logoSrc: known.logoSrc,
        initials: initialsFrom(known.name),
        bg: known.bg,
      };
    }
  }
  return {
    name: trimmed,
    logoSrc: null,
    initials: initialsFrom(trimmed),
    bg: '#7c3aed',
  };
}
