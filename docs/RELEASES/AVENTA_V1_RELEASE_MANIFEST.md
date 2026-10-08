# AVENTA V1.0 — PRODUCT COMPLETE

Cierre leído el 8 de octubre de 2026. Este archivo no cambia el runtime.

El comportamiento verificado está en `d903ad0ee2d1e93cb4e8108b33c5508e549235ae`. Si `master` avanza solo con este documento, el producto sigue siendo el de ese SHA.

## Release

Aventa V1.0. Producto completo. No hay siguiente ronda de features de V1.

Trabajo posterior solo si se clasifica como V1.1, crecimiento, monetización, economía, operaciones, seguridad o corrección P0/P1.

## Canonical branch

`master`

## Product commit

- SHA: `d903ad0ee2d1e93cb4e8108b33c5508e549235ae`
- Commit: `feat(hunters): complete human growth engine (#82)`
- PR: https://github.com/AventaOficial/aventa-new/pull/82
- Árbol idéntico a `d52ab924127fdf424f628263fa449b38e2f75300`
- Diff contra la fase 3 (`34fb7f6`): 21 archivos, +656 / −7

## Production deployment

- Proyecto: `aventa-new` (`prj_Y3sU0roPe6uNpW97mD9u6FZqbRb7`)
- Deployment: `dpl_5MpHncgDgyunFnApWZy8xydZp9Hq`
- Host: `https://aventa-bgt4aa6li-aventa-oficial.vercel.app`
- Estado: Ready
- SHA: `d903ad0ee2d1e93cb4e8108b33c5508e549235ae`
- Apex: `https://aventaofertas.com` 200
- WWW: `https://www.aventaofertas.com` 200

## Phases

| Fase | Qué es | Estado |
| --- | --- | --- |
| 1 | Analítica de producto | En producción y verificada |
| 2 | Inteligencia de oferta | En producción y verificada |
| 3 | Motor de oferta humana | En producción y verificada |
| 4 | Crecimiento del cazador humano | En producción y verificada |

## Capabilities

Aventa V1 puede adquirir usuarios, servir ofertas, aceptar contribución humana, moderarla, devolver feedback, medir comportamiento, medir oferta, medir crecimiento del cazador y operar la comunidad.

## Architectural guarantees

- Una taxonomía de `product_events`. No hay un segundo sistema de analítica ni un segundo dashboard.
- `vote`, `save`, `comment`, `signup`, `offer_view` y `outbound_click` no se espejan en `product_events`.
- Escritura de analítica solo con service role. RLS activo y sin políticas públicas.
- `hunter_intent` es analítica de comportamiento: usuario autenticado con consentimiento, `actor_class` HUMAN, sin IP, sin token y sin PII. Deduplicación por usuario y día UTC. Un fallo de analítica no rompe el flujo.
- La clase de actor sigue el directorio canónico. La identidad del usuario tiene precedencia sobre el anónimo.
- Rate limit crítico en producción sigue fail-closed si el backend no está disponible. `AVENTA_DEPLOYMENT_SURFACE` no está definido en producción. `AVENTA_REDIS_ENVIRONMENT=production`.

## Database

- Producción: `mkgsrpsuvedwwlzmzmzh`
- Staging: `oojshofrpbfwsiypcecr`
- Migración: `docs/supabase-migrations/20261008_hunter_intent_event.sql`
- El CHECK de `product_events.event_name` en producción incluye `hunter_intent` y está `NOT VALID`, igual que en staging. No se reescribieron filas históricas.
- Una sonda que insertaba `hunter_intent` y rechazaba un nombre inválido abortó con rollback. No quedó fila de sonda.
- Índices de `product_events` sin cambios. No hay política nueva.

## Supply baseline

Lectura del 8 de octubre de 2026, 19:29:38 UTC. UI, API y SQL coinciden.

| Ventana | Creadas | Aprobadas | Rechazadas |
| --- | --- | --- | --- |
| Hoy | 0 | 0 | 0 |
| 7 días | 188 | 40 | 39 |
| 30 días | 720 | 119 | 280 |

- Pendientes actuales: 109
- Actores a 30 días: humano 16, cazador de máquina 186, sistema 518, sin atribución 0
- Oferta humana a 30 días: 1 humano, 0 nuevos, 1 recurrente, 16 ofertas, aprobación 94%, rechazo 6%
- Primer éxito de cacería: sin historial suficiente. No se publica como 0%.
- Intención de cazador en producción: sin historial suficiente. Las tasas de intención quedan en blanco.

## Economic status

Congelado. No hay payout ni liquidación de recompensas ni activación de comisiones.

- `MONEY_PATH_FROZEN=true`
- `REWARDS_PROGRAM_ACTIVE=false`
- `REWARDS_PAYOUT_ENABLED=false`
- Conteos sin cambio en este cierre: `creator_rewards` 6, `payout_intents` 0, `affiliate_ledger_entries` 10
- `REWARDS_BETA_ENABLED=true` solo separa la experiencia. No enciende el programa ni los pagos.

## Tests

- `npm run ci:verify` local sobre el árbol de `d903ad0`: typecheck, contratos, launch y build en verde. 0 fallos.
- Contratos: 4362 passed, 8 skipped. Launch: 99 passed. La fase 4 no agregó skips.
- CI de GitHub del mismo árbol: success en https://github.com/AventaOficial/aventa-new/actions/runs/37829962407

## Intentionally deferred

No son bugs de este cierre.

- Activación económica
- Activación fiscal
- Activación de payouts
- Cohortes históricas de retención
- Experimentos de crecimiento todavía no ejecutados
- Features de V1.1

## Known non-blocking risks

- 109 ofertas pendientes. 109 superan 24 h.
- Rechazo de oferta a 30 días: 70%.
- Oferta humana atribuida a 30 días: 2%.
- 81 ofertas live sin stock en el último escaneo.
- 20 escrituras diferidas fallidas.
- 8 errores en runs de Hunter del día.
- Producción todavía no tiene filas `hunter_intent`. El panel lo dice con historial insuficiente.
