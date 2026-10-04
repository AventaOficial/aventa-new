# Paridad de producto — release gate

Fecha: 2026-10-04. Rama: `launch/final-verdict`. Base: `origin/master` `446e13c`.

Staging no se mergeó. Los 12 commits de producto (`0dc9eb4`..`0461497`) se cherry-pickearon encima de master. El hardening `#37`–`#40` no cambió: `moneyPathFreeze.ts`, `evaluateOfferHealth.ts`, `runOfferHealthBatch.ts`, Team OS y `vercel.json` están idénticos a `origin/master`.

## PROMOTED

- Experiencia de oferta: `OfferMedia`, outbound según 404/410, "Sobre esta oferta", comentarios sin poll, likes optimistas, hora `America/Mexico_City`, título sin `| AVENTA | AVENTA`, canonical del layout.
- Chips de tienda y categoría repetidos en la ficha. Siguen el breadcrumb y la marca de tienda.
- Favoritos: mosaico, vacío, carrusel, toggle. Tabla `offer_favorites` sin migración.
- Plaza: centro de caza, presupuesto, tienda, carga y error. Mismas APIs y `budget_max`.
- Notificaciones: centro nuevo, sin sonido. `/api/notifications`.
- Perfil público, `/me` y métricas de mis ofertas.
- Sigilos. Sin tablas nuevas y sin tocar `achievement_xp`.
- Navbar más corta.
- Selector visual al subir.
- Dashboard CEO de solo lectura, incluido el conteo de pagos. No liquida ni enciende dinero.

## EXCLUDED

- La rama `staging` como merge.
- Cron `aventa_mark_expired` y el resto de jobs exclusivos de staging.
- Tablas legacy de staging y cualquier copia de datos, usuarios u ofertas de prueba.
- Activación de rewards, comisiones, payouts o settlement.
- El scanner viejo de staging.

## DATABASE

Ninguna migración. Ningún cambio de schema.

## SECURITY

Los archivos de hardening de `origin/master` no tienen diff en esta rama. El dashboard CEO entra por `requireOwner` y hace `select`. No hay `insert` en los módulos promovidos de owner, Plaza, favoritos y notificaciones.

## MONEY

`lib/server/moneyPathFreeze.ts` es el de producción. En runtime de producción sigue cerrado salvo que la variable de entorno lo apague, y esta pasada no la toca. No se activó ningún flujo monetario.

## TESTS

- `tsc --noEmit`: pasó.
- `next build`: pasó.
- `tests/launch`, `tests/owner`, la regresión de imagen y la de ficha expirada: 21 archivos, 150 pruebas, pasaron.
- ESLint de Plaza, favoritos, notificaciones, sigilo, navbar, upload y ficha: 0 errores, 6 avisos ya conocidos (`img`, una dependencia de hook, `favoriteMap` sin uso).

## BROWSER

Contra el dev local con datos de staging, sin escribir:

- Plaza carga Centro de Caza, presupuesto, tienda y solicitudes. Título `Plaza | AVENTA`.
- Favoritos carga "Tus favoritos" y "Lo más votado de la comunidad".
- La ficha de oferta, en la pasada anterior: claro, oscuro, 390 y 430 sin scroll horizontal.

No se publicó un comentario ni se creó una oferta. El like real y el dashboard CEO con el owner de producción no se ejercieron.

## CI

PR [#41](https://github.com/AventaOficial/aventa-new/pull/41): `verify`, Vercel `aventa-new` y Vercel `aventa-staging` pasaron. `MERGEABLE`, `CLEAN`.

## PREVIEW

Preview del proyecto de producción, `aventa-new-git-launch-final-verdict-aventa-oficial.vercel.app`, apuntando a la base de staging. Solo lectura y como invitado.

- `/api/health`: `ok`, `feedViewOk: true`. `/`, `/plaza`, `/subir`, `/u/<usuario>`, `/sitemap.xml`: 200. `/me` y `/me/favorites`: 307 a login.
- Home a 390: feed con `OfferCard`. La imagen inválida del fixture cae al ícono y no tumba la página.
- Ficha a 390, 430 y escritorio, claro y oscuro: breadcrumb `Inicio / Amazon` sin chips repetidos, precio, banner "Sin verificación reciente" con hora de México, CTA "Comprobar oferta" con `rel="noopener noreferrer sponsored"`, comentarios, "Información adicional" cerrada al fondo. Canonical a `aventaofertas.com`.
- Plaza en escritorio oscuro: Centro de Caza, presupuesto, tienda y estado vacío.
- Subir: selector "¿Qué quieres compartir?" con cupón marcado como próximamente.
- Perfil público en claro: métricas, pestañas y nivel.
- Sin scroll horizontal en ninguna vista. Sin `console.error` ni React #418 en la ficha, Plaza, subir y perfil.

No se ejerció en el preview lo que pide sesión: `/me`, favoritos con datos, notificaciones, like real, formulario de subida completo y dashboard CEO. Lo cubren las pruebas de contrato y la revisión local.

## ROLLBACK

Promover de nuevo el deployment de producción de `446e13c` (deployment de GitHub `6845057675`).

## GATE

GO WITH CONDITIONS. Se mergea a `master` y se promueve. La condición es revisar con una cuenta real, después del deploy, lo que pide sesión.

## POST-DEPLOY

PR #41 entró a `master` como `23bb8aa`. `verify` y Vercel pasaron. Vercel promovió `23bb8aa` a producción por la integración de Git. Staging solo recibió un preview.

Smoke en `aventaofertas.com`, solo lectura, sin votos, favoritos, comentarios ni notificaciones marcadas:

- `/api/health`: `ok`, `feedViewOk: true`, 654 ofertas.
- 20 rutas muestreadas (home, Plaza, descubre, subir, sitemap, legales y 12 fichas del feed): 0 respuestas 5xx.
- Ficha real a 390: foto con el marco nuevo, galería, banner "Sin confirmación" con hora de México, CTA "Comprobar oferta" hacia Amazon con tag y `sponsored`, comentarios cargados, "Sobre esta oferta". Sin `console.error`.
- Con la sesión del owner: `/me` con nivel, métricas y accesos; favoritos con estado vacío; campana con 4 notificaciones. Sin `console.error`.
- `/api/notifications` y el dashboard CEO responden 401 sin Bearer.

Base de producción, solo `select`:

- 52 migraciones. La última es `20261004182739`, de #40.
- Cron `offers-lifecycle-v2` activo, última corrida 20:17 UTC, 0 fallos en 24 h.
- Scanner: 82 filas en `offer_health_state`, última revisión 03:46 UTC, consistente con el cron diario de las 03:00. 81 `out_of_stock` sin 404/410 confirmado, por eso su CTA sigue activo.
- `payout_intents`: 0. El dinero sigue congelado.

Hallazgo de datos, no tocado: 11 ofertas aprobadas, cargadas por lote, muestran en "Sobre esta oferta" la nota interna "Oferta cargada por lote. Revisar ficha antes de aprobar." Hay que corregir la descripción desde moderación.
