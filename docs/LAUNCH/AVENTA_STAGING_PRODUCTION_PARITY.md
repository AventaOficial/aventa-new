# Paridad staging / producción

Fecha: 2026-10-04.

| Ref | Commit |
|---|---|
| Producción (`origin/master`) | `446e13c` |
| Trabajo local (`launch/final-verdict`) | `83137ee` más la experiencia de oferta, sin commit todavía |
| Staging (`origin/staging`) | `0461497` |
| Ancestro común | `a9a5ca5` (#36, achievements v1 y `/me`) |

Staging está 12 commits adelante de ese ancestro y 4 atrás de producción (`#37` Team OS, `#38` equipos del owner, `#39` lifecycle y evidencia, `#40` vistas públicas). El diff de archivos de esos 12 commits no toca ningún archivo de los 4 commits de hardening. Un merge de la rama staging sí los borraría, porque staging nunca los recibió.

No hay migraciones en `a9a5ca5..origin/staging`.

## A. PROMOVER

| Sistema | Staging | Production | Delta | Acción | Riesgo | Dependencias |
|---|---|---|---|---|---|---|
| Experiencia de oferta | No está | No está en `446e13c`; está en el trabajo local | Media, outbound honesto, jerarquía, likes, SEO de título | Promover el trabajo local | Bajo. No cambia scanner ni tablas | `offer_health_state.diagnostic` ya existe |
| Favoritos `/me/favorites` | Rediseño en `46e43b6` | Lista anterior | Mosaico, vacío, carrusel, toggle sin recargar el mapa | Cherry-pick | Bajo | `offer_favorites`, `applyFavoriteToggle` |
| Plaza | `edf2688` | Página anterior | Centro de caza, presupuesto, tienda, carga/error/vacío | Cherry-pick | Bajo | `/api/plaza/requests`, `/api/plaza/discussions`, `/api/announcements`, `budget_max` |
| Notificaciones | `edf2688`, sonido quitado en `edffb9b` | Centro anterior | Centro nuevo, sin poll de sonido | Cherry-pick | Bajo | `/api/notifications` |
| Perfil público y `/me` | `0dc9eb4`, `46e43b6`, `edf2688` | Versión #36 | Métricas de mis ofertas, pulido visual | Cherry-pick | Bajo | APIs de perfil ya en producción |
| Sigilos | `edf2688` | Texto/emoji | Capa visual | Cherry-pick | Bajo | `/api/me/achievements`, tablas de achievements ya en #36 |
| Navbar | `edf2688` | Navbar larga | Más corta, notificaciones | Cherry-pick | Medio. Hay que comprobar rutas | Rutas actuales |
| Subir oferta | `beec7b1` (`UploadKindChooser`) | Modal anterior | Selector visual | Cherry-pick | Bajo | Misma validación de subida |
| SEO de título y canonical | No está en staging | Título duplicado en el HTML vivo | `brandedTitle` y canonical `./` en el trabajo local | Promover con la oferta | Bajo | Layout de Next |

## B. PROMOVER DESPUÉS DE ADAPTACIÓN

| Sistema | Staging | Production | Delta | Acción | Riesgo | Dependencias |
|---|---|---|---|---|---|---|
| Ficha de oferta y sigilo del autor | 8 líneas en `OfferPageContent` | Trabajo local ya reescribió la ficha | El sigilo choca con el archivo local | Resolver al cherry-pick: conservar outbound, jerarquía y likes, y poner el sigilo | Bajo | Achievements |
| `app/page.tsx` `?upload=1` | Solo abre el modal si hay contexto | Abre con el query pelado | 3 líneas | Conservar la versión de staging al resolver | Bajo | Upload |
| Dashboard CEO | 12 commits, solo lectura | Panel owner anterior a este mosaico | Mosaico, carrusel, vistas | Cherry-pick. La API nueva es `GET` con `requireOwner` y `select` | Medio. Lee `payout_intents` y `creator_rewards`; no escribe | Rol owner. `MONEY_PATH_FROZEN` no se toca |

`git grep insert(` sobre `lib/owner/buildOwnerCommand.ts`, `app/admin/owner`, favoritos, Plaza y notificaciones en `origin/staging` no encontró inserciones.

## C. NO PROMOVER

| Sistema | Staging | Production | Delta | Acción | Riesgo | Dependencias |
|---|---|---|---|---|---|---|
| Rama `staging` completa | Sin #37–#40 | Con #37–#40 | Merge revertiría Team OS, lifecycle, evidencia y el cierre de vistas | No merge | Alto | — |
| Cron `aventa_mark_expired` | Cada 5 min en la base de staging | No existe | Job de staging | No copiar | Alto | pg_cron |
| Tablas legacy de staging | 55 rels de más | No están | `ofertas`, `votos`, `payouts`, `ui_events`, etc. | No copiar | Alto | Schema parity |
| Tablas solo de producción | No están en staging | 13 rels | Revisiones, ledger de clawback, snapshots | No borrar | Alto | — |
| Datos | Ofertas `LIFECYCLE-TEST`, usuarios de staging | Datos reales | — | No copiar | Alto | — |
| Dinero | Congelado | Congelado | El mosaico CEO solo lee conteos | No activar payouts, rewards ni comisiones | Alto | `moneyPathFreeze.ts` |
| Scanner y lifecycle | Staging tiene el scanner viejo en el árbol, porque no tiene #39 | 404/410 únicamente | No traer `evaluateOfferHealth.ts` ni `runOfferHealthBatch.ts` desde staging | Esos archivos no están en los 12 commits | Alto | — |

## D. YA ESTÁ EN PRODUCCIÓN

| Sistema | Staging | Production | Delta | Acción | Riesgo | Dependencias |
|---|---|---|---|---|---|---|
| Achievements v1 y fórmula de reputación | #36 | #36 | Ninguno en tablas | No recrear | — | `achievement_xp` no se mezcla con reputación |
| `offer_favorites` | Misma tabla | Misma tabla | Solo UI | No migrar | — | — |
| Plaza APIs | Mismas rutas | Mismas rutas | Solo UI y estados | No migrar | — | `budget_max` ya existe |
| Team OS, evidencia, vistas | Ausente | #37–#40 | Producción va adelante | Conservar | — | — |
| Lifecycle automático | Job viejo o distinto | `offers-lifecycle-v2` verificado | — | Conservar | — | — |

## E. REQUIERE VERIFICACIÓN MANUAL

| Sistema | Staging | Production | Delta | Acción | Riesgo | Dependencias |
|---|---|---|---|---|---|---|
| Navbar en 390 px | Recortada | Larga | Rutas de Plaza, perfil, notificaciones | Smoke | Medio | — |
| CEO en producción | Lee payouts | Owner real | Que el `select` no falle por RLS y que no haya botones de liquidar | Smoke con owner, sin escribir | Medio | Rol owner |
| Foto real de oferta | Fixtures de staging sin imagen válida | Catálogo real | El marco con foto real no se vio en staging | Smoke en preview | Bajo | `OfferMedia` |
| Las 12 ofertas `missing_*` | No aplica | Siguen `out_of_stock` sin 404 | El botón pasa a "Comprobar oferta" | Confirmar en una ficha real | Medio | No reescribir filas |
| Like de comentario | Lógica local nueva | Poll de 25 s en producción | No se hizo click contra datos reales | Smoke en preview, sin publicar comentarios de prueba | Bajo | `comment_likes` |

## Orden

1. Commit de la experiencia de oferta sobre `launch/final-verdict`.
2. Cherry-pick de `0dc9eb4` hasta `0461497`, del más viejo al más nuevo. Sin merge.
3. Resolver el choque de la ficha conservando el outbound y el sigilo.
4. Typecheck, launch tests, build.
5. PR a `master`. Producción solo desde ese resultado, no desde staging.
