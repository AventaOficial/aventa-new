# AVENTA — FINAL RELEASE GATE

Fecha: 2026-10-04, ~23:45 UTC. Auditoría de solo lectura: sin código, sin migraciones, sin escrituras en producción, sin deploy y sin merge.
Producción: `aventaofertas.com`, `master` @ `0d97401`, Supabase `mkgsrpsuvedwwlzmzmzh`.
Release candidate: [PR #44](https://github.com/AventaOficial/aventa-new/pull/44), `product/founder-os` @ `6349245`.

## 1. Executive verdict

**READY WITH CONDITIONS.**

El código está cerrado: no hay blockers técnicos y PR #44 está **READY TO MERGE**. Quedan dos blockers, y ninguno requiere código:

1. **EXTERNAL:** Supabase está en plan **free** (verificado por API: `plan: free`, `tier_free`). Falta Pro + backup visible + restore verificado.
2. **P1 de operación (supply):** hay 12 ofertas vigentes y todas vencen entre las 00:59 y las 01:43 UTC del 2026-10-05. Después de esa hora el feed queda vacío.

## 2. Technical status — PASS

| Comprobación | Evidencia |
|---|---|
| Git | Árbol limpio. `HEAD` = `origin/product/founder-os` = `6349245`. 4 commits por delante de `master` y 0 por detrás |
| PR #44 | `OPEN`, `MERGEABLE`, `CLEAN`. `verify` pass. Vercel `aventa-new` y `aventa-staging` desplegados |
| `master` | `verify`, `scrape-and-ingest` y Vercel en éxito |
| Typecheck / build | `tsc --noEmit` OK; `next build` OK sobre `7315f69` (el último commit solo añade docs) |
| Tests | Relevantes: 126 archivos, 1.182 OK. Suite completa previa: 4.254 OK y 8 saltados |
| Lint | 0 errores nuevos. 5 errores de React Compiler en `app/page.tsx` idénticos en `master` (preexistentes) |

**PR #44: READY TO MERGE.**

- **Qué cambia:**
  - Navegación del owner en 3 audiencias, con 17 fichas.
  - Baneos como pestaña de Moderación.
  - Drilldowns del CEO Dashboard.
  - OfferMedia (placa neutra; desenfoque solo para escenas medidas).
  - Fechas deterministas en el detalle (#418).
  - Flechas de voto sin error de framer-motion.
  - Sponsored placement por política y rail de comunidad.
  - Docs y tests.
- **Qué no cambia:** seguridad, dinero, lifecycle, scanner, schema, migraciones, crons, middleware, auth, `.env` y `vercel.json`. El escaneo de las líneas del diff no encuentra escrituras a DB, service-role, policies ni `suppressHydrationWarning`.
- **Deuda:** ninguna nueva. Elimina `RailOfferRequests.tsx`, sustituido por el rail de comunidad, y sus tests pasan.

## 3. Security status — PASS

- **Rutas protegidas (anónimo):**
  - `/me`, `/me/favorites`, `/admin/*`, `/equipo` → 307 a `/`.
  - 14 APIs `/api/admin/*` → 401.
  - Crons (incluidos los de dinero) sin secret → 401.
- **Owner (sesión real en producción):** `/admin/owner`, `/admin/moderation(/bans)`, `/admin/team`, `/admin/sistemas/mapa` y `/equipo` → 200 y renderizan. No hay 401/403 incorrectos.
- **Separación owner / admin / moderator:** la cubren los guards existentes y los tests (`tests/owner`, `tests/team`, `tests/moderation`). No pude probarla en producción con una sesión no-owner.
- **Bundles de producción (25 chunks JS):** el único JWT es `anon@mkgsrpsuvedwwlzmzmzh`. No aparece `service_role`, `sk_live`, `sk_test`, `CRON_SECRET`, `PRIVATE_KEY`, `client_secret` ni referencias a staging (`oojshofrpbfwsiypcecr`, `staging.aventaofertas`).
- **Advisors de Supabase (seguridad):**
  - 61 tablas con RLS y sin policies (INFO): deny-all para el cliente, que es lo correcto porque el servidor usa service-role.
  - 2 vistas SECURITY DEFINER (`ofertas_ranked_general`, `public_profiles_view`): solo `SELECT` para anon y authenticated; las escrituras se revocaron en #40. Residuo aceptado en `AVENTA_LAUNCH_READINESS.md`.
  - `is_moderator` y `user_has_moderation_role` son ejecutables, pero solo devuelven un boolean sobre el propio usuario (LOW).
  - 2 funciones con `search_path` mutable (LOW).
  - Protección de contraseñas filtradas desactivada (P2, ajuste del panel).
- **Sin cambios de seguridad en PR #44.**

## 4. Money status — FROZEN (SAFE)

- `isMoneyPathFrozen()` (`lib/server/moneyPathFreeze.ts`) devuelve true en producción si `MONEY_PATH_FROZEN` falta o es inválida.
- **Crons de dinero programados en `vercel.json`:** `ledger-reward-bridge`, `available-payout-intent`, `reserved-payout-submit`, `provider-payout-confirm` y `rewards-release-holds`. Todos exigen `CRON_SECRET` y llegan a un guard de congelamiento antes de escribir:
  - `ledgerRewardBridge/classify.ts`
  - `payoutIntent/engine.ts` (`reservePayoutIntent` y el envío)
  - `providerConfirmationAutomation/processConfirmablePayoutIntent.ts`
  - `rewardsEngine.ts`
  - `payout.ts`
  - `clawback.ts`
  - `manualAttribution.ts`
- **Evidencia en producción (solo lectura):**
  - `affiliate_conversions`, `affiliate_commissions`, `payout_intents` y `payout_batches` = **0**.
  - Filas históricas: 10 ledger entries, 6 rewards, 6 reward payouts y 6 clawbacks, todas del 2026-08-31. Hay 6 settlements del 2026-09-06.
  - **No hay ninguna fila nueva en 4 semanas**, aunque esos crons corren cada día.
- PR #44 no toca ningún archivo de dinero. `PayoutsCard.tsx` solo cambia el destino de un enlace.

## 5. Database status — PASS (técnico) / FAIL (respaldo)

- Proyecto `ACTIVE_HEALTHY`, Postgres 17.6, `us-east-2`.
- Sin migraciones pendientes en este release.
- `/api/health`: `{"status":"ok","offersCount":654,"feedViewOk":true}`.
- **Plan free:** no hay restore administrable. Ver §10.

## 6. Reliability status — PASS

- **Lifecycle** `offers-lifecycle-v2` (`17 * * * *`, activo):
  - 5 corridas desde que se activó hoy a las 19:17 UTC, todas `succeeded`.
  - 0 fallos y 0 solapamientos. Duración máxima menor a 1 s.
  - La última corrida fue a las 23:17 UTC.
- **pg_cron:** 1 job en total y 0 jobs de staging.
- **Scanner** `/api/cron/offer-health-scan` (03:00 UTC):
  - Último `last_checked_at`: 2026-10-04 03:46 UTC.
  - 0 ofertas con `gone` o `not_found`.
  - Las 12 vigentes tienen el health antiguo `out_of_stock`, con su procedimiento de cierre en `AVENTA_FINAL_GO_NO_GO.md`.
  - La salida a la tienda solo se bloquea con 404/410.
- **Expiraciones:** las 12 vigentes conservan su `expires_at` original. Hay 70 ofertas aprobadas ya vencidas que no se archivan: siguen visibles como página de detalle y no aparecen en el feed, que filtra por `expires_at`.

## 7. Product status — PASS

QA de producción con la sesión real del owner y sin escrituras:

- **Páginas públicas y de usuario:** `/`, `/plaza`, detalle de oferta, `/descubre`, `/subir` (redirige a `/?upload=1` por diseño), `/u/[usuario]`, `/me` y `/me/favorites`.
- **Viewports:** escritorio, 390 y 430px, claro y oscuro.
- **Resultado:** 0 `console.error`, 0 errores de hidratación, 0 overflow horizontal y 0 imágenes rotas.
- **Admin:** CEO Dashboard, Baneos, Mapa de sistemas y Team Hub renderizan sin errores.
- **Notificaciones:** el botón carga sin errores. No abrí el panel para no marcar nada como leído.
- **SEO técnico:**
  - Canonical correcto en `/`, `/plaza`, `/descubre`, `/u/*` y `/oferta/*` (slug).
  - El detalle tiene `index, follow`.
  - `robots.txt` bloquea `/admin`, `/api`, `/auth` y `/me`.
  - Sitemap: 171 URLs, sin staging.
- **Diferencias de producción frente a PR #44** (se corrigen al mergear):
  - Baneos no tiene pestaña en Moderación.
  - Imagen blanca con halo en dark mode.
  - Navegación del owner antigua.

## 8. Supply status — FAIL (P1, operación, sin código)

**Auditoría técnica (solo lectura):**

| Métrica | Valor |
|---|---|
| Vigentes (aprobadas, no borradas ni archivadas, `expires_at > now`) | **12** |
| Aprobadas | 12 |
| En el feed (`/api/feed/home`) | 12 |
| Indexables (`/oferta/*` en el sitemap) | 12 |
| Imagen https | 12 |
| Descripción útil | **1** (11 con la nota de lote, oculta al público) |
| Precio | 12 |
| Descuento (`original_price > price`) | 12 |
| Outbound https | 12 |
| Primer vencimiento | 2026-10-05 00:59 UTC |
| Último vencimiento | 2026-10-05 01:43 UTC |
| Cola pendiente de moderación | 1 (desde el 2026-10-02) |
| Aprobadas históricas | 82 |

**CURRENT LIVE CATALOG = 12, y será 0 a partir de las 01:43 UTC del 2026-10-05.**

**Mínimo para abrir: ≥ 24 ofertas vigentes.** Es una decisión de producto, separada de la auditoría; se apoya en el diseño ya implementado:

- La política de patrocinio (`DEFAULT_FEED_POLICY`: primero tras 2 ofertas, luego cada 4, máximo 6) necesita **22 ofertas** para que el feed muestre su ritmo completo sin que los patrocinados dominen. Con menos, la proporción patrocinado/orgánico empeora; con 12, ya hay 3 patrocinados.
- El home tiene 9 categorías. Con ≥ 24 ofertas repartidas en ≥ 5 categorías, ningún filtro queda vacío en la primera visita.
- Cada oferta debe tener **≥ 72 h de vigencia** al abrir, para que el catálogo no se vacíe en el primer día, como ocurre hoy.
- Calidad mínima por oferta: imagen, precio con descuento, outbound https y descripción útil. Las 12 actuales cumplen todo menos la descripción.

## 9. Acquisition status — N/A (fuera del alcance técnico)

- Lo técnico está listo para tráfico orgánico: sitemap, canonical, robots e indexación del detalle.
- No hay campaña de adquisición activa ni verificada. Abrir adquisición antes de cumplir §8 llevaría tráfico a un feed vacío.
- P3: `/descubre` y `/u/[usuario]` usan el título genérico «AVENTA · Ofertas de la comunidad».

## 10. External blockers

**Supabase Pro + backup visible + restore verificado — FAIL.** La organización `AventaOficial` está en `plan: free`. No se resuelve desde el código y no se debe simular.

## 11. Founder actions

Por orden:

1. **Supabase**, en el panel y sin código:
   1. Abrir el proyecto `mkgsrpsuvedwwlzmzmzh` (no `oojshofrpbfwsiypcecr`).
   2. En Organization → Billing, pasar `AventaOficial` a **Pro**.
   3. En Database → Backups, esperar a que aparezca al menos un backup completado y anotar su fecha/hora UTC.
   4. Hacer **Restore to a new project** desde ese backup. **Nunca** restaurar encima de producción. Si el panel no ofrece restaurar a un proyecto nuevo, pedirlo a soporte de Supabase.
   5. En el proyecto restaurado, ejecutar `select count(*) from public.offers;`, `select count(*) from public.profiles;`, `select max(created_at) from public.offers;` y `select jobname, active from cron.job;`. Deben ser coherentes con producción a la hora del backup.
   6. Anotar en este documento la hora del backup, el inicio y fin del restore (RTO) y el resultado.
   7. Confirmar que producción sigue intacta (`/api/health` ok, conteo de `offers` sin bajar, lifecycle activo) y **pausar o borrar** el proyecto restaurado.
2. **Supply:** aprobar desde Moderación ofertas reales hasta tener **≥ 24 vigentes con ≥ 72 h** en ≥ 5 categorías. Se hace con el flujo normal de moderación, sin escrituras directas a la DB.
3. **Merge de PR #44**, preferiblemente con el backup ya verificado. Vercel despliega solo; después hay que repetir el smoke de §13.
4. **Opcional (P2):** activar la protección de contraseñas filtradas en Auth y decidir la etiqueta «Patrocinado» de los creativos propios.

## 12. Post-launch items (no tocar antes del release)

- Las 11 ofertas con nota de lote: vencen solas y la nota está oculta. La limpieza opcional está en `AVENTA_PRODUCTION_CLOSURE_STATUS.md` §10.
- La API del feed devuelve `description` sin filtrar en el JSON.
- 5 errores de lint preexistentes en `app/page.tsx`.
- Títulos genéricos en `/descubre` y `/u/[usuario]`.
- Residuo de advisors: vistas SECURITY DEFINER, `search_path` mutable y funciones de rol ejecutables.
- 70 ofertas vencidas sin archivar (comportamiento actual del lifecycle).
- Vistas legacy `/admin/owner/vista/*` y componentes de owner sin uso.
- **PRs antiguos abiertos que NO se mergean con este release:** #42, #32, #14 (`reconcile/economy-ledger`, dinero), #13 y #8.
- Todo lo de dinero: `MONEY_PATH_FROZEN`, rewards, commissions, payouts, settlement, ledger y attribution.

## 13. Exact release checklist

1. [ ] La organización de Supabase muestra `plan: Pro` (panel o API).
2. [ ] Database → Backups muestra al menos un backup completado, con su fecha/hora anotada aquí.
3. [ ] El restore a un proyecto nuevo termina, y sus 4 consultas de validación devuelven datos coherentes.
4. [ ] El RTO medido y el resultado están anotados aquí.
5. [ ] Producción sigue intacta tras el restore: `/api/health` ok y conteo de `offers` sin bajar. El proyecto restaurado está pausado o borrado.
6. [ ] El catálogo tiene ≥ 24 ofertas vigentes con ≥ 72 h, en ≥ 5 categorías (consulta de §8).
7. [ ] PR #44 sigue en `MERGEABLE`, `CLEAN` y con `verify` pass justo antes del merge.
8. [ ] PR #44 mergeado y el deploy de producción de Vercel en «Ready».
9. [ ] Smoke post-deploy: `/`, `/plaza`, detalle, `/u/*`, `/me` y `/me/favorites` dan 200 y `/api/health` da `ok`. Las rutas admin dan 307 para anónimo y 200 para el owner.
10. [ ] En producción, Moderación muestra la pestaña Baneos y la navegación del owner tiene CEO / Operations / Technical.
11. [ ] Sin `console.error` ni overflow en escritorio y 390px, claro y oscuro.
12. [ ] Conteos de dinero sin cambios: `payout_intents = 0`, `affiliate_conversions = 0` y sin filas nuevas en ledger, rewards ni settlements.
13. [ ] `offers-lifecycle-v2` sigue activo y su última corrida es `succeeded`.
14. [ ] Después de las 03:00 UTC del 2026-10-05, se cierra el scanner sobre las 12 ofertas antiguas con el procedimiento de solo lectura de `AVENTA_FINAL_GO_NO_GO.md`.
15. [ ] Con 1 a 14 en verde: **FINAL RELEASE READY**.

## 14. Rollback procedure

- **Antes del merge:** no hay nada que revertir; producción es `master` @ `0d97401`.
- **Después del merge de PR #44:**
  - Opción A: en Vercel, promover a producción el deployment anterior (`0d97401`). Es inmediato y no toca git.
  - Opción B: `git revert -m 1 <merge-commit>` en `master` y dejar que Vercel redespliegue.
- PR #44 no tiene migraciones ni cambios de datos, así que el rollback es solo de código.
- **Datos:** el rollback de la base de datos depende del backup y restore de §10. Hasta que ese gate esté cerrado, **no existe un rollback de datos verificado**. Por eso es un blocker externo.
