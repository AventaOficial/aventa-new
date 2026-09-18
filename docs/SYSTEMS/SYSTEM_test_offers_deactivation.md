# SYSTEM — Test offers deactivation (canónico)

## Mocks `tester-*`

- Fuente: `lib/offers/testerOffers.ts` (memoria, no DB).
- Toggle: `app_config.show_tester_offers` vía Operaciones / `PATCH /api/admin/app-config`.
- Home: `app/page.tsx` solo inyecta mocks si el flag es true.

**Desactivar:** Operaciones → apagar “ofertas de prueba” (`show_tester_offers = false`).

## Filas reales de prueba en DB

Sin DELETE masivo. Opciones server-authoritative:

1. `POST /api/admin/expire-offer` `{ offerId }` → `expires_at = now` (sale del feed).
2. `POST /api/admin/moderate-offer` `{ status: 'rejected' }` (sale de cola/feed).

`deleted_at`: columna usada en filtros; **no** hay writer de app — UNKNOWN/no usar.

## Prohibido

- `DELETE FROM offers` masivo
- Filtro “contiene test” como política
- SQL manual ad-hoc en prod sin audit
