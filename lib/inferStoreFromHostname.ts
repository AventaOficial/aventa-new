/**
 * Cuando og:site_name falta o es genérico, infiere nombre de tienda conocida por el host.
 * Orden: más específico primero (subdominios / TLD regional).
 */
const SUFFIX_TO_STORE: Array<{ suffix: string; store: string }> = [
  { suffix: 'mercadolibre.com.mx', store: 'Mercado Libre' },
  { suffix: 'mercadolibre.com', store: 'Mercado Libre' },
  { suffix: 'amazon.com.mx', store: 'Amazon' },
  { suffix: 'amazon.com', store: 'Amazon' },
  { suffix: 'walmart.com.mx', store: 'Walmart' },
  { suffix: 'walmart.com', store: 'Walmart' },
  { suffix: 'liverpool.com.mx', store: 'Liverpool' },
  { suffix: 'liverpool.com', store: 'Liverpool' },
  { suffix: 'shein.com.mx', store: 'SHEIN' },
  { suffix: 'shein.com', store: 'SHEIN' },
  { suffix: 'temu.com', store: 'Temu' },
  { suffix: 'aliexpress.com', store: 'AliExpress' },
  { suffix: 'aliexpress.us', store: 'AliExpress' },
  { suffix: 'bodegaaurrera.com.mx', store: 'Bodega Aurrera' },
  { suffix: 'bodega-aurrera.com.mx', store: 'Bodega Aurrera' },
  { suffix: 'sams.com.mx', store: "Sam's Club" },
  { suffix: 'costco.com.mx', store: 'Costco' },
  { suffix: 'chedraui.com.mx', store: 'Chedraui' },
  { suffix: 'soriana.com', store: 'Soriana' },
  { suffix: 'elektra.com.mx', store: 'Elektra' },
  { suffix: 'coppel.com', store: 'Coppel' },
  { suffix: 'linio.com.mx', store: 'Linio' },
  { suffix: 'sears.com.mx', store: 'Sears' },
  { suffix: 'palaciodehierro.com', store: 'El Palacio de Hierro' },
  { suffix: 'nike.com', store: 'Nike' },
  { suffix: 'adidas.mx', store: 'adidas' },
  { suffix: 'adidas.com', store: 'adidas' },
];

export function inferStoreFromHostname(hostname: string): string | null {
  const h = hostname.replace(/^www\./, '').toLowerCase();
  if (!h) return null;
  for (const { suffix, store } of SUFFIX_TO_STORE) {
    if (h === suffix || h.endsWith(`.${suffix}`)) return store;
  }
  return null;
}
