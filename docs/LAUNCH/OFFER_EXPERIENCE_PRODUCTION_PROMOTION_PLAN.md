# Plan de promoción: experiencia de oferta

Fecha: 2026-10-04. Comparación real, no un merge.

| Superficie | Ref |
|---|---|
| Producción (código) | `origin/master` `446e13c` |
| Staging (código) | `origin/staging` `0461497` |
| Trabajo local | `launch/final-verdict` `83137ee` más los cambios de esta pasada, sin commit |

## Qué hay en staging y no en producción

`origin/master..origin/staging` son 12 commits de producto visual del CEO y de `/me`, no del lifecycle ni de la seguridad.

En las superficies de oferta el diff es de 8 líneas:

- `OfferPageContent.tsx` y `page.tsx`: el logro del autor pasa de un emoji a `AchievementSigil`.
- `app/page.tsx`: el query `?upload=1` solo abre el modal de oferta si también viene contexto (`title`, `image`, `offer_url` o `store`).

No hay migración ni cambio de base en ese diff.

## Qué hay en producción y no en staging

`origin/staging..origin/master`:

- `#37` Team OS
- `#38` gestión de equipos del owner
- `#39` lifecycle v2, protección de evidencia, hardening
- `#40` revocación de escrituras de cliente sobre vistas públicas

Staging no tiene eso. Un deploy o merge de staging hacia producción lo borraría.

## Promover / no promover

| Cambio | Clase | Decisión |
|---|---|---|
| Commits de staging del dashboard CEO, notificaciones, `/me`, sigilo de logro, `?upload=1` | E. DO NOT PROMOTE como rama | No mergear `staging` → `master`. Si uno de esos commits se quiere, se cherry-pickea solo, después de esta pasada. |
| Datos, usuarios, ofertas y crons de staging (`aventa_mark_expired` cada 5 min) | E | No salen de staging. |
| Dinero, rewards, comisiones, payouts | E | `MONEY_PATH_FROZEN` no se toca. |
| Esta pasada (media de oferta, jerarquía de la ficha, outbound según evidencia, likes, hidratación, SEO de título) | A. SAFE TO PROMOTE como código | Va en `launch/final-verdict`, que parte de master. Sin migración. |
| Health de las 12 ofertas vivas | D. MANUAL VERIFICATION | No se reescriben filas. El modelo de UX deja de bloquear el outbound si el diagnóstico no es 404/410. |

## Orden, cuando se decida desplegar

1. No partir de `staging`.
2. Commit de esta pasada sobre `launch/final-verdict` (ya contiene master + los docs de cierre).
3. PR hacia `master`. Sin migración.
4. Preview. Smoke: home, ficha, comentario, like, outbound, dark, light, 390 px.
5. Promover ese deployment. Rollback: el deployment anterior de master (`446e13c` más lo que ya esté en producción).
6. No correr dumps, no copiar filas, no encender dinero.

## Riesgos de esta pasada

- Una oferta `out_of_stock` sin diagnóstico `http_404`/`http_410` vuelve a tener outbound. Es intencional: esas filas son fallos de parseo, no una página desaparecida.
- Un 404/410 confirmado sigue sin botón.
- Una oferta vencida sigue fuera del índice y ahora permite abrir la tienda, con el texto de que el precio puede haber cambiado.
- Quitar el poll de comentarios cada 25 s deja de refrescar la lista sola. El like ya no depende de ese refresco.

## Tests

`tests/launch/freshness.test.ts`, `tests/launch/launchHardening.test.ts`, `tests/launch/offerExperience.test.ts`, `tests/launch/brandedTitle.test.ts`. Typecheck. No hay migración que probar.

## Archivos de esta pasada (código, sin migración)

| Archivo | Qué cambia |
|---|---|
| `app/components/offers/OfferMedia.tsx` | Marco único de foto de oferta: ratio fijo, producto en `object-contain`, fondo con la misma imagen desenfocada, fallback, error. |
| `app/components/OfferCard.tsx` | Usa ese marco. Quita el segundo badge de descuento y el chip "Destacada". |
| `app/components/FeaturedOfferCard.tsx` | Misma media. Orden: tienda, imagen, título, precio, anterior, ahorro, CTA. |
| `lib/offers/freshness/present.ts` | Outbound según evidencia. 404/410 bloquea. Precio cambiado, unknown y agotado sin confirmar dejan salir. |
| `app/oferta/[id]/page.tsx` | Lee `diagnostic` y lo pasa como `confirmedGone`. SEO de título ya iba en esta rama. |
| `app/oferta/[id]/OfferPageContent.tsx` | Jerarquía, descripción con recorte, likes optimistas, sin poll de 25 s, hora de México fija. |
| `lib/time/mexicoClock.ts` | Formato `America/Mexico_City` para que SSR y cliente coincidan. |
| `lib/comments/commentLikeState.ts` | Toggle y reconciliación sin recargar el hilo. |
| `app/api/offers/[offerId]/comments/[commentId]/like/route.ts` | Un like duplicado (`23505`) responde `liked: true` en vez de 500. |

No se tocó `lib/server/moneyPathFreeze.ts`, el scanner, el lifecycle ni RLS.

## Comportamiento

- Foto de oferta: el producto no se estira. El hueco deja de ser un pozo negro o blanco.
- "Destacada" y el porcentaje duplicado salen del feed. Se quedan tienda, un descuento sobre la foto, ahorro, autor, tiempo, votos, MSI, cupón y en línea/en tienda.
- `out_of_stock` sin `http_404`/`http_410`: CTA "Comprobar oferta", indexable.
- `http_404`/`http_410`: CTA apagado, noindex.
- Precio cambiado: "Verificar precio".
- Vencida: sigue fuera del índice, el botón abre la tienda.
- La ficha muestra la oferta, luego "Sobre esta oferta", luego pasos/condiciones/cupones, comentarios, y al final "Información adicional" cerrada.
- El like no vuelve a pedir la lista ni muestra "Cargando comentarios…".
