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
      'caminadora',
      'treadmill',
      'impresora',
      'creatina',
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
      'limpieza',
      'detergente',
    ],
  },
  {
    id: 'supermercado',
    words: [
      'cafe',
      'café',
      'aceite',
      'arroz',
      'leche',
      'cereal',
      'snack',
      'supermercado',
      'despensa',
      'croquetas',
      'croqueta',
      'alimento para gato',
      'alimento para perro',
      'alimento mascota',
      'mascota',
      'mascotas',
    ],
  },
  {
    id: 'viajes',
    words: ['vuelo', 'hotel', 'viaje', 'maleta', 'aerolinea', 'aerolínea'],
  },
  {
    id: 'bebes',
    words: [
      'bebe',
      'bebé',
      'bebes',
      'bebés',
      'pañal',
      'panal',
      'pañales',
      'formula',
      'fórmula',
      'infantil',
      'mamadera',
      'cuna',
      'carriola',
      'stroller',
      'juguetes',
      'lego duplo',
      'fisher price',
    ],
  },
  {
    id: 'jardin',
    words: [
      'jardin',
      'jardín',
      'maceta',
      'planta',
      'pasto',
      'manguera',
      'taladro',
      'broca',
      'bricolaje',
      'diy',
      'herramienta electrica',
      'herramienta eléctrica',
      'pintura',
      'brocha',
    ],
  },
  {
    id: 'autos',
    words: [
      'llanta',
      'llantas',
      'refaccion',
      'refacción',
      'refacciones',
      'aceite motor',
      'bateria auto',
      'batería auto',
      'motocicleta',
      'moto',
      'auto',
      'automotriz',
      'carro',
    ],
  },
  {
    id: 'entretenimiento',
    words: [
      'libro',
      'libros',
      'vinilo',
      'cd',
      'bluray',
      'blu-ray',
      'pelicula',
      'película',
      'coleccionable',
      'figura',
      'funko',
      'lego',
      'rompecabezas',
      'board game',
    ],
  },
  {
    id: 'deportes',
    words: [
      'deporte',
      'deportes',
      'gym',
      'fitness',
      'pesas',
      'mancuerna',
      'caminadora',
      'treadmill',
      'creatina',
      'pre workout',
      'bicicleta estatica',
      'bicicleta estática',
      'eliptica',
      'elíptica',
      'yoga',
      'outdoor',
      'camping',
      'mochila camping',
    ],
  },
  {
    id: 'servicios',
    words: [
      'suscripcion',
      'suscripción',
      'gift card',
      'membresia',
      'membresía',
      'spotify',
      'netflix',
      'office 365',
      'uber eats',
      'rappi',
      'dominos',
      "domino's",
    ],
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
  MLM1747: 'supermercado',
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
  const titleHay = normalizeHaystack([input.title]);
  if (
    titleHay.includes('smart tv') ||
    titleHay.includes('televisor') ||
    titleHay.includes('television') ||
    titleHay.includes('impresora') ||
    titleHay.includes('monitor') ||
    /\btv\b/.test(titleHay)
  ) {
    return 'tecnologia';
  }
  if (titleHay.includes('caminadora') || titleHay.includes('treadmill') || titleHay.includes('creatina')) {
    return 'deportes';
  }
  if (titleHay.includes('parrilla') || titleHay.includes('asador') || titleHay.includes('barbacoa')) {
    return 'jardin';
  }
  if (/silla gamer|silla gaming|gamepad|control xbox|control ps5|nintendo switch/.test(titleHay)) {
    return 'gaming';
  }
  if (/consola|videojuego|gaming/.test(path)) return 'gaming';
  if (/electr[oó]nica|computaci[oó]n|celulares|televisores/.test(path)) return 'tecnologia';
  if (/beb[eé]|infantil|pañal|juguetes/.test(path)) return 'bebes';
  if (/mascota|mascotas|animales|perro|perros|gato|gatos/.test(path)) return 'supermercado';
  if (/jard[ií]n|herramient|bricolaje|plantas/.test(path)) return 'jardin';
  if (/auto|motocicleta|refaccion|llanta/.test(path)) return 'autos';
  if (/deporte|fitness|outdoor/.test(path)) return 'deportes';
  if (/libro|m[uú]sica|entretenimiento|pel[ií]cula/.test(path)) return 'entretenimiento';
  if (/hogar|muebles|electrodom/.test(path)) return 'hogar';
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
