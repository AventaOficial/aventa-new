# Aventa V1 — release manifest

Datos leídos el 6 de octubre de 2026. Este archivo no cambia el runtime.

## Release

Aventa V1

## Canonical branch

`master`

## Production deployment

El smoke de esta página se hizo sobre este deployment, antes de agregar este documento.

- SHA: `d2e0d3f085388789ccc863dd05400376618616d7`
- Deployment ID: `dpl_71oqDA7mzQ9pYMxJioHvHDfMVMmU`
- Proyecto: `aventa-new` (`prj_Y3sU0roPe6uNpW97mD9u6FZqbRb7`)
- Estado: READY
- Commit: `fix(seo): no declarar MXN en una oferta sin moneda confirmada` (PR #59)
- Padre de producto: `5d94a393484786290c861f372519803c0215588f` (PR #58)

## Apex

`https://aventaofertas.com` → `dpl_71oqDA7mzQ9pYMxJioHvHDfMVMmU`

## WWW

`https://www.aventaofertas.com` → `dpl_71oqDA7mzQ9pYMxJioHvHDfMVMmU`

## Staging

`https://staging.aventaofertas.com` no es producción.

- Proyecto: `aventa-staging` (`prj_zlWblfjkK2oPYJ28N6VhEwN50JQZ`)
- SHA en el momento del smoke de producción: `d2e0d3f085388789ccc863dd05400376618616d7`
- Deployment ID: `dpl_6iVqzkCHpNof5mmZg2RRk7NfA5MD`
- Mismo SHA de `master`, otro proyecto y otra base.

## Database

- Producción: `mkgsrpsuvedwwlzmzmzh` (Aventa Cazadores de ofertas, us-east-2)
- Staging: `oojshofrpbfwsiypcecr` (Aventa Staging, us-west-1)

## Applied migrations

Aplicadas en esta sesión y verificadas en producción:

- `offer_source_currency`: columna `offers.source_currency` text, nullable, check `^[A-Z]{3}$`. 657 ofertas, 0 con moneda, 657 desconocidas.
- `offer_match_intelligence`: `offer_product_identities` y `offer_match_observations`. RLS activo. 0 policies. Grants de `service_role` y del owner `postgres`. 0 filas. Índice `offers_product_fingerprint_eq_idx`.
- `economic_shadow_projections`: tablas `economic_shadow_projections` y `economic_order_reconciliation_candidates`. Función `economic_beta_report` security invoker, execute solo `service_role`. 0 filas. `withdrawable` no tiene filas que puedan ser true.

La misma columna y las tablas de coincidencias quedaron en staging. El shadow económico ya existía en staging antes de esta sesión.

## Pending migrations

Ninguna de las tres anteriores quedó pendiente en producción.

`persistShadowProjection` no está conectado a `recordCommission`. El esquema shadow existe y el writer del camino de comisión no escribe esas tablas.

## Feature inventory

| Feature | master | production | DB | status |
| --- | --- | --- | --- | --- |
| feed | en `d2e0d3f` | `/` y `/api/feed/home` 200 | ofertas 657 | SMOKE |
| auth | en master | `/me` anónimo 307 a `/` | — | GUARD SMOKE. Login y logout no se ejecutaron |
| profiles | en master | sin slug público ejercido | — | NO SMOKE DE PERFIL |
| public profiles | en master | no se abrió un `/u/[username]` | — | NO SMOKE |
| achievements | en master desde #53 | no re-ejercido | — | EN EL SHA, NO RE-SMOKE |
| Hunters | en master | `/cazadores` 200 | `machine_clients` con RLS | SMOKE PÚBLICO |
| Hunter AI | en `d2e0d3f` | `/admin/moderation/hunter` anónimo 307 | — | GUARD SMOKE |
| moderation | en master | `/admin/moderation` anónimo 307 | — | GUARD SMOKE. Approve/reject no ejecutados |
| Hunter moderation | misma cola `bot` | misma ruta | — | SIN SEGUNDA PIPELINE EN CÓDIGO |
| Duplicate Intelligence | en `d2e0d3f` | no hay sesión de moderador | tablas vacías, RLS on | ESQUEMA VERIFICADO. UI NO EJERCIDA |
| Team OS | en `d2e0d3f` | `/team` anónimo 307 a `/team/gate` | `team_memberships` RLS forzado. 1 rol `owner` | GUARD SMOKE. Entrada del owner no ejercida |
| Owner OS / Founder OS | en `d2e0d3f` | `/admin/owner` y `/admin/owner/vista/equipos/moderacion` anónimo 307 | `user_roles`: owner 1, admin 1, moderator 1 | GUARD SMOKE |
| rewards beta UI | en master desde #57 | flag `REWARDS_BETA_UI_ENABLED` ausente en production | — | FLAG AUSENTE |
| economic beta foundation | código en master | writer no conectado | tablas shadow en 0 filas | SCHEMA ONLY |
| money freeze | flags de production | `MONEY_PATH_FROZEN=true` | conteos sin cambio | VERIFICADO |
| actor firewall | en master desde #53 | no re-ejercido | — | EN EL SHA, NO RE-SMOKE |
| MCP | en master | no re-ejercido | `machine_clients` RLS | EN EL SHA, NO RE-SMOKE |
| Amazon parser | en master desde #54 | oferta Amazon 200 | — | PÁGINA 200 |
| auth fix | en master desde #55 | no se provocó el fallo transitorio | — | EN EL SHA, NO RE-SMOKE |
| batches | en master | no re-ejercido | — | EN EL SHA, NO RE-SMOKE |
| OfferMedia | en master | imagen de oferta visible | — | SMOKE VISUAL DE UNA OFERTA |
| guides | en master | `/descubre` 200 | — | SMOKE |
| settings | en master | no re-ejercido | — | EN EL SHA, NO RE-SMOKE |
| seasons | en master | no re-ejercido | — | EN EL SHA, NO RE-SMOKE |
| privacy/server-side profile | en master desde #51 | no re-ejercido | — | EN EL SHA, NO RE-SMOKE |
| discovery pipeline | en master | no re-ejercido | — | EN EL SHA, NO RE-SMOKE |
| price intelligence | historial no persistido | no se muestra mínimo histórico | sin serie | DISEÑO SIN MÉTRICAS FALSAS |
| currency architecture | en `d2e0d3f` | la oferta de prueba no emite `priceCurrency` y muestra "Precio sin moneda confirmada" | 657/657 sin moneda | SMOKE |
| revenue split | en `5d94a39` | no se abrió ingresos con sesión | — | CÓDIGO EN EL SHA. UI NO EJERCIDA |
| fake metrics removal | en `5d94a39` | no quedan `1842`, `342 ms` ni `128 offers` en el árbol | — | BÚSQUEDA EN CÓDIGO |

`/ofertas` responde 404. El catálogo público está en `/`.

## Economic state

FROZEN / SHADOW ONLY

- `MONEY_PATH_FROZEN=true`
- `REWARDS_PROGRAM_ACTIVE=false`
- `REWARDS_PAYOUT_ENABLED=false`
- Antes y después de las migraciones: `creator_rewards` 6, `payout_intents` 0, `affiliate_ledger_entries` 10

## Tests

- `tsc --noEmit`: pass, después de quitar tipos generados rotos de `.next/dev`
- `npm run test:contracts`: 4257 passed, 8 skipped, 0 failed, antes del fix de JSON-LD
- CI `verify` de PR #58 y PR #59: SUCCESS
- `npm run build`: el primer intento murió con código `3221225477` durante TypeScript; el segundo intento pasó
- ESLint del archivo `ModerationOfferDetail.tsx` sigue con errores previos a esta sesión (setState en effect y memoización). El diff de ese archivo solo monta el panel. No se corrigió el lint histórico del repositorio

## Smoke

Público, anónimo, sobre `d2e0d3f`:

- `/`, `www` `/`, `/plaza`, `/descubre`, `/cazadores`: 200
- `/api/feed/home`: 200, 3 filas en la primera página, sin `source_currency` en el payload
- `/oferta/2882a03d-9f57-4ac2-9fe1-3848c9a5ca96`: 200. JSON-LD sin `price` y sin `priceCurrency`. HTML contiene "Precio sin moneda confirmada"
- `/me`, `/admin/moderation`, `/admin/moderation/hunter`, `/equipo`, `/admin/owner`, `/admin/owner/vista/equipos/moderacion`: 307 a `/`
- `/team`: 307 a `/team/gate?next=%2Fteam`
- `/ofertas`: 404

No se ejecutó login, logout, aprobar, rechazar ni la vista de inteligencia con un moderador.

## Known non-blocking issues

- Lint histórico del repositorio
- El primer `next build` local cayó por un access violation del worker y el reintento pasó
- `REWARDS_BETA_UI_ENABLED` no existe en las env de production
- Las 657 ofertas históricas siguen sin moneda. Es el estado correcto hasta que haya evidencia
- Las tablas de coincidencias y de shadow están vacías. La moderación no depende de que tengan filas

## Known blocking issues

No hay sesión autenticada en este cierre. Por eso no está demostrado en producción que el owner entre a Equipo ni que un moderador vea la inteligencia de una oferta y decida. Las rutas anónimas sí niegan el acceso.

## GO / NO-GO

NO-GO para declarar Aventa V1 cerrada de punta a punta.

El SHA `d2e0d3f085388789ccc863dd05400376618616d7` sí está alineado entre `master`, apex, www y el host de staging, con las tres migraciones verificadas en la base de producción y el dinero congelado. Falta el smoke autenticado de moderación y de owner.
