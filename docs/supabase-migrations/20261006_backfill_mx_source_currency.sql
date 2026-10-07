-- Moneda MXN solo para hosts de retailers mexicanos ya soportados.
-- No toca acortadores (meli.la, link.amazon) ni marketplaces de otro país.
-- Idempotente: solo filas con source_currency nula.

update public.offers
set source_currency = 'MXN'
where source_currency is null
  and offer_url is not null
  and (
    offer_url ~* '^https://([^/@]+@)?([^/]+\.)?amazon\.com\.mx/'
    or offer_url ~* '^https://([^/@]+@)?([^/]+\.)?mercadolibre\.com\.mx/'
    or offer_url ~* '^https://([^/@]+@)?([^/]+\.)?mercadolibre\.mx/'
    or offer_url ~* '^https://([^/@]+@)?([^/]+\.)?soriana\.com/'
    or offer_url ~* '^https://([^/@]+@)?([^/]+\.)?costco\.com\.mx/'
    or offer_url ~* '^https://([^/@]+@)?([^/]+\.)?chedraui\.com\.mx/'
    or offer_url ~* '^https://([^/@]+@)?([^/]+\.)?cityclub\.com\.mx/'
  );
