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

Promover de nuevo el deployment de producción de `origin/master` `446e13c`.

## GATE

GO WITH CONDITIONS. Se mergea a `master` y se promueve. La condición es revisar con una cuenta real, después del deploy, lo que pide sesión.
