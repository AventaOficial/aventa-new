/** Normaliza nombres de tienda muy usados cuando el usuario escribe mal el casing. */
const KNOWN: Record<string, string> = {
  'mercado libre': 'Mercado Libre',
  'mercadolibre': 'Mercado Libre',
  'amazon mexico': 'Amazon México',
  amazon: 'Amazon',
  walmart: 'Walmart',
  liverpool: 'Liverpool',
  'coppel': 'Coppel',
  'costco': 'Costco',
  'sams club': "Sam's Club",
  'sam s club': "Sam's Club",
};

export function formatStoreDisplayName(raw: string | null | undefined): string {
  const t = raw?.trim();
  if (!t) return '';
  const key = t.toLowerCase().replace(/\s+/g, ' ').replace(/\.+$/, '');
  return KNOWN[key] ?? t;
}
