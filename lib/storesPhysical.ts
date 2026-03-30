/**
 * Heurística: tiendas donde suele importar aclarar si la oferta es en sucursal o solo en línea.
 * No es exhaustiva; amplía la lista cuando quieras más cobertura.
 */
const PHYSICAL_HINTS = [
  'walmart',
  'mercado libre',
  'soriana',
  'chedraui',
  'liverpool',
  'palacio de hierro',
  'costco',
  'sams club',
  "sam's",
  'office depot',
  'home depot',
  'farmacias del ahorro',
  'farmacias guadalajara',
  'benavides',
  'petco',
  'bodega aurrera',
  'superama',
  'sears',
  'coppel',
  'elektra',
  'oxxo',
  'seven eleven',
  'circle k',
  'chedraui selecto',
  'la comer',
  'city market',
  'fresko',
  'sumesa',
  'smart fit',
];

function normalizeForMatch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ');
}

export function storeLikelyHasPhysicalPresence(storeName: string): boolean {
  const n = normalizeForMatch(storeName);
  if (n.length < 2) return false;
  return PHYSICAL_HINTS.some((h) => n.includes(h));
}
