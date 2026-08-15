import { ALL_CATEGORIES, normalizeCategoryForStorage, type CategoryId } from '@/lib/categories';

const KEYWORD_MAP: Array<{ id: CategoryId; words: string[] }> = [
  {
    id: 'gaming',
    words: [
      'gaming',
      'videojuego',
      'videojuegos',
      'playstation',
      'xbox',
      'nintendo',
      'switch',
      'consola',
      'steam',
      'gamepad',
      'joystick',
    ],
  },
  {
    id: 'tecnologia',
    words: [
      'iphone',
      'samsung galaxy',
      'xiaomi',
      'pixel',
      'laptop',
      'notebook',
      'macbook',
      'ipad',
      'tablet',
      'audifono',
      'audífono',
      'airpods',
      'smartwatch',
      'monitor',
      'ssd',
      'nvme',
      'teclado',
      'mouse',
      'gadget',
      'electron',
      'computadora',
      'smartphone',
      'celular',
      'televisor',
      'smart tv',
    ],
  },
  {
    id: 'belleza',
    words: ['perfume', 'maquillaje', 'skincare', 'crema facial', 'serum', 'belleza', 'cuidado personal'],
  },
  {
    id: 'moda',
    words: ['tenis', 'zapatos', 'ropa', 'playera', 'sudadera', 'pantalon', 'pantalón', 'bolsa', 'mochila', 'moda'],
  },
  {
    id: 'hogar',
    words: [
      'freidora',
      'licuadora',
      'refrigerador',
      'lavadora',
      'colchon',
      'colchón',
      'silla',
      'mesa',
      'cocina',
      'herramienta',
      'hogar',
      'espejo',
      'lampara',
      'lámpara',
    ],
  },
  {
    id: 'supermercado',
    words: ['cafe', 'café', 'aceite', 'arroz', 'leche', 'cereal', 'snack', 'supermercado', 'despensa'],
  },
  {
    id: 'viajes',
    words: ['vuelo', 'hotel', 'viaje', 'maleta', 'aerolinea', 'aerolínea'],
  },
  {
    id: 'servicios',
    words: ['suscripcion', 'suscripción', 'gift card', 'membresia', 'membresía', 'spotify', 'netflix', 'office 365'],
  },
];

const ML_ROOT_TO_CATEGORY: Record<string, CategoryId> = {
  MLM1000: 'tecnologia',
  MLM1648: 'tecnologia',
  MLM1652: 'tecnologia',
  MLM1144: 'gaming',
  MLM1574: 'hogar',
  MLM1575: 'hogar',
  MLM1403: 'supermercado',
  MLM1430: 'moda',
  MLM1276: 'moda',
  MLM1248: 'belleza',
  MLM1459: 'viajes',
  MLM1747: 'servicios',
};

function normalizeHaystack(parts: Array<string | null | undefined>): string {
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function inferOfferCategory(input: {
  title?: string | null;
  breadcrumbs?: string[] | null;
  mlCategoryId?: string | null;
  mlPathNames?: string[] | null;
}): CategoryId | null {
  const mlId = input.mlCategoryId?.trim().toUpperCase() ?? '';
  if (mlId && ML_ROOT_TO_CATEGORY[mlId]) return ML_ROOT_TO_CATEGORY[mlId];
  const mlPrefix = mlId.slice(0, 7);
  if (ML_ROOT_TO_CATEGORY[mlPrefix]) return ML_ROOT_TO_CATEGORY[mlPrefix];

  const path = (input.mlPathNames ?? []).join(' ').toLowerCase();
  if (/consola|videojuego|gaming/.test(path)) return 'gaming';
  if (/electr[oó]nica|computaci[oó]n|celulares/.test(path)) return 'tecnologia';
  if (/hogar|muebles|jard[ií]n|electrodom/.test(path)) return 'hogar';
  if (/alimento|bebida|supermercado/.test(path)) return 'supermercado';
  if (/ropa|calzado|accesorio/.test(path)) return 'moda';
  if (/belleza|cuidado personal|perfum/.test(path)) return 'belleza';
  if (/viaje|turismo|hoteles/.test(path)) return 'viajes';

  const hay = normalizeHaystack([input.title, ...(input.breadcrumbs ?? []), ...(input.mlPathNames ?? [])]);
  for (const row of KEYWORD_MAP) {
    if (row.words.some((w) => hay.includes(w.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))) {
      return row.id;
    }
  }

  const fromLabel = ALL_CATEGORIES.find((c) => hay.includes(c.label.toLowerCase()));
  return fromLabel ? normalizeCategoryForStorage(fromLabel.value) : null;
}
