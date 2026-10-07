# Aventa V1 — release manifest

Cierre leído el 7 de octubre de 2026. Este archivo no cambia el runtime.

El comportamiento verificado está en `b63f9511d89321b090541f9e2fa17895f55acba0`. El commit que agrega este documento es solo documentación. Si `master` avanza únicamente con este archivo, ese HEAD es el SHA de deployment y el comportamiento sigue siendo el de `b63f951`.

## Release

Aventa V1

## Canonical branch

`master`

## Production deployment

Smoke de producto sobre este deployment, antes de este documento.

- SHA: `b63f9511d89321b090541f9e2fa17895f55acba0`
- Commit: `fix(release): pasar la moneda resuelta a Mis ofertas del cazador` (PR #63)
- Padre: `5a71fffcc048cb37008b8a798df286c730694a79` (PR #62)
- Producto previo: `c1759e075296b4af3d86bbdefc63ea06816db5e4` (PR #61)
- GitHub deployment: `6900620705`
- Host: `https://aventa-le9grj0o6-aventa-oficial.vercel.app`
- Proyecto: `aventa-new` (`prj_Y3sU0roPe6uNpW97mD9u6FZqbRb7`)
- Estado: success
- El id numérico `dpl_` de Vercel no se leyó: el token del CLI respondió 403. La identidad usada es el deployment de GitHub y el host de arriba.
- Apex, www y ese host sirvieron el mismo HTML (`EF73BF2E6B0D141462EAFEAC1DA198835ECEFFC1B109ADFDDC60FD1F3981F532`).

## Apex

`https://aventaofertas.com` alineado con el host de `6900620705`.

## WWW

`https://www.aventaofertas.com` alineado con el mismo HTML.

## Staging

`https://staging.aventaofertas.com` no es producción.

- Proyecto: `aventa-staging` (`prj_zlWblfjkK2oPYJ28N6VhEwN50JQZ`)
- GitHub deployment del mismo SHA: `6900621354`
- Otra base: `oojshofrpbfwsiypcecr`

## Database

- Producción: `mkgsrpsuvedwwlzmzmzh`
- Staging: `oojshofrpbfwsiypcecr`

## Applied migrations

Verificadas en producción por consulta, no solo por el archivo SQL.

- `offers.source_currency`: 728 MXN, 63 null. Los null son acortadores (`meli.la`, `link.amazon`), no retailers mexicanos con host inequívoco.
- `offer_product_identities` y `offer_match_observations`: existen. RLS activo.
- `economic_shadow_projections` y `economic_order_reconciliation_candidates`: existen. RLS activo.
- Función `economic_beta_report`: existe. Execute no se concedió a `anon` ni a `authenticated` en el SQL del repositorio.
- `offers` y `user_roles`: RLS activo.

## Pending migrations

Ninguna de las anteriores quedó solo en `docs/`.

`persistShadowProjection` no está conectado a `recordCommission`.

## Feature inventory

| Feature | Evidencia | Estado |
| --- | --- | --- |
| Feed y MXN público | `/` muestra precios MXN y "Destacado por AVENTA" cada 3 ofertas | SMOKE |
| Plaza móvil | Tab Inicio, Guía, Subir, Plaza, Perfil | SMOKE |
| `/me` | Favoritos como Guardados, Mis ofertas, actividad, logros, recompensas, configuración | SMOKE |
| Mis ofertas MXN | Amazon México `$19,999.00 MXN` y `$117.52 MXN`. `meli.la` sigue sin moneda | SMOKE |
| Hunter a moderación | 108 ofertas pending ligadas a lotes de máquina. La cola principal las lista | SMOKE + SQL |
| Lotes | Historial "Aventa MCP Supply". Ítems de máquina APPROVED ya tienen oferta | SMOKE + SQL |
| URL Soriana/Costco | Regresión en CI `verify` de #61–#63 | TEST |
| Duplicate Intelligence | `GET /api/admin/moderation/offer-intelligence` 200, `NO_MATCH`, moneda MXN, sin auto-decisión | SMOKE API |
| Owner | `/equipo`, `/admin/owner`, `/admin/owner/vista/equipos` redirige a `/moderacion` | SMOKE |
| Economía | Dashboard owner: `$ 0.00`, "Congelado · no pagadero" | SMOKE |
| Rewards | "Rewards no está activo en todas las cuentas" | SMOKE |

## Economic state

FROZEN / SHADOW ONLY

- `MONEY_PATH_FROZEN=true` (lectura previa de production; el CLI no pudo releer el env en este cierre)
- `REWARDS_PROGRAM_ACTIVE=false`
- `REWARDS_PAYOUT_ENABLED=false`
- Conteos después del backfill de moneda: `creator_rewards` 6, `payout_intents` 0, `affiliate_ledger_entries` 10
- No se generó payout ni se escribió ledger en este cierre

## Tests

- CI `verify` de PR #61, #62 y #63: pass
- `tests/v1/productClosure.test.ts`: 10 passed en local antes de #63
- ESLint histórico de `ModerationOfferDetail.tsx` no se reescribió

## Smoke

Sesión ya abierta del owner. No se aprobó, no se rechazó y no se cerró la sesión.

- Público: `/`, www, plaza, feed con MXN y bloque cada 3
- `/me`: secciones personales y MXN en Amazon México
- Moderación: pendientes 108, Hunter IA, lote, aprobadas 95
- Inteligencia: una oferta pending de Chedraui respondió `NO_MATCH`
- Owner: Equipo, CEO Dashboard, índice de equipos hacia moderación
- Economía: congelado, $0

## Known non-blocking issues

- 63 ofertas siguen sin moneda porque el enlace es un acortador
- 150 ítems READY y 136 ERROR son lotes manuales, no de `machine_client_id`
- 7 ítems de máquina en `NEEDS_REVIEW` no tienen oferta
- No se pulsó aprobar ni rechazar
- No se envió de nuevo el formulario de login ni se ejecutó logout
- El id `dpl_` de Vercel no está en este documento
- Lint histórico del repositorio
- La barra inferior tapa contenido a media página; el documento ya tiene padding de safe area

## Known blocking issues

Ninguno P0/P1 abierto en el SHA de comportamiento.

## GO / NO-GO

GO

Aventa V1 pasa de construcción a operación. No hay siguiente ronda de features en este cierre.
