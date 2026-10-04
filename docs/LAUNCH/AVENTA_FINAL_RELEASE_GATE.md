# AVENTA — FINAL RELEASE GATE

Fecha: 2026-10-04, ~23:30 UTC. Auditoría de solo lectura: sin código nuevo, sin migraciones, sin escrituras en producción, sin deploy.

## 1. Current release — PASS

| | |
|---|---|
| Producción (`aventaofertas.com`) | `master` @ `0d97401` (#43), CI y Vercel en verde |
| Release candidate | [PR #44](https://github.com/AventaOficial/aventa-new/pull/44), rama `product/founder-os` @ `7315f69` |
| Contenido del RC | Founder OS (nav CEO / Operations / Technical, fichas de módulos), Baneos como pestaña de Moderación, OfferMedia sin imagen «flotando», fechas deterministas en el detalle (#418), flechas de voto sin error de consola, sponsored placement por política, rail de comunidad |

## 2. Git state — PASS

- Árbol de trabajo limpio (0 cambios sin commit). `.next/` está ignorado.
- `product/founder-os` = `origin/product/founder-os` = `7315f69`. Va 3 commits por delante de `origin/master` y 0 por detrás: no hay conflictos ni rebase pendiente.
- 52 archivos cambiados frente a `master`, todos de producto, UX, docs o tests. Se elimina 1 archivo (`app/components/RailOfferRequests.tsx`, sustituido por el rail de comunidad).
- Búsqueda de palabras sensibles en las líneas del diff: no hay `MONEY_PATH`, service-role, `.insert/.update/.delete/.upsert/.rpc`, policies, migraciones, `suppressHydrationWarning`, `console.log`, `debugger` ni TODO. Las únicas coincidencias son enlaces de navegación (`/admin/commissions`, `/admin/rewards`), textos de las fichas y docs.
- Sin código experimental ni restos de staging en el diff.
- **Para reportar (no son blockers):** hay PRs antiguos abiertos que **no deben mergearse** como parte de este release: #42 (docs), #32, #14 (`reconcile/economy-ledger`, toca dinero), #13 y #8. PR #44 es el único cambio pendiente de este cierre.

## 3. CI — PASS

- PR #44: `verify` pass y Vercel `aventa-new`/`aventa-staging` desplegados.
- `master`: `verify`, `scrape-and-ingest` y Vercel en éxito.
- Local sobre `7315f69`:
  - `tsc --noEmit`: OK.
  - `next build`: OK.
  - Tests relevantes (launch, owner, offers, home, moderation, team): 126 archivos, 1.182 tests OK.
  - Suite completa previa: 4.254 OK y 8 saltados.
- Lint de los archivos tocados: 0 errores nuevos. `app/page.tsx` tiene 5 errores de React Compiler **idénticos en `master`** (preexistentes, sin cambio de comportamiento).

## 4. Production — PASS

HTTP de solo lectura contra `aventaofertas.com` (y el preview de PR #44, con el mismo resultado):

- 200: `/`, `/plaza`, `/subir`, `/descubre`, `/u/[usuario]`, `/api/health`, `/sitemap.xml`, `/robots.txt`.
- 307 → `/` para un visitante anónimo, que es correcto: `/me`, `/me/favorites`, `/admin/owner`, `/admin/moderation`, `/admin/moderation/bans`, `/equipo`, `/admin/team`, `/admin/sistemas/mapa`.
- Con la sesión del owner, todas las rutas del owner responden 200 y renderizan. No hay 401/403 incorrectos.
- Sin 5xx.
- `/api/health`: `{"status":"ok","feedViewOk":true}`.
- Sitemap: 171 URLs, 0 referencias a staging.
- `/subir` redirige a `/?upload=1` (modal de subida) por diseño.

## 5. Browser QA — PASS

Producción (`master`), con la sesión real del owner y sin acciones de escritura:

| Página | Viewports | console.error / hidratación | Overflow | Imágenes rotas |
|---|---|---|---|---|
| `/` | escritorio, 390 oscuro | 0 | 0 | 0 de 51 |
| `/plaza` | escritorio | 0 | 0 | 0 |
| Detalle de oferta | escritorio, 390 oscuro | 0 | 0 | 0 |
| `/descubre` | 390 oscuro | 0 | 0 | 0 |
| `/subir` → `/` | 430 claro | 0 | 0 | 0 |
| `/u/[usuario]` | 430 claro | 0 | 0 | 0 |
| `/me`, `/me/favorites` | 430 claro y oscuro | 0 | 0 | 0 |
| `/admin/owner`, `/admin/moderation/bans`, `/admin/sistemas/mapa`, `/equipo` | escritorio | 0 | 0 | — |

- PR #44 se verificó contra staging en local (sesión de owner): Baneos dentro del hub, sidebar en 3 secciones, Team Hub para el owner y CEO Dashboard sin errores.
- Diferencias esperadas de producción respecto al RC, todas cosméticas y que se corrigen al mergear PR #44:
  - Baneos no tiene pestaña en Moderación (la página funciona).
  - Imagen blanca con halo en dark mode.
  - Navegación del owner antigua.

## 6. Security — PASS

PR #44 no toca RLS, auth, middleware/proxy, migraciones, schema, policies, service-role ni `.env`. El acceso a las rutas del owner sigue dependiendo de los guards existentes, verificado con anónimo (307) y owner (200).

## 7. Money freeze — PASS

- `isMoneyPathFrozen()` (`lib/server/moneyPathFreeze.ts`) devuelve true en producción si `MONEY_PATH_FROZEN` falta o es inválida. Solo un `false/0/no/off` explícito lo descongela.
- PR #44 no modifica ese archivo ni ninguna ruta de dinero. El único archivo con nombre relacionado (`PayoutsCard.tsx`) solo cambia el destino de un enlace. **PR #44 no puede habilitar dinero.**
- Conteos en producción (solo lectura):
  - `affiliate_conversions`, `affiliate_commissions`, `payout_intents` y `payout_batches`: **0**.
  - Filas históricas: 10 ledger entries, 6 rewards, 6 reward payouts y 6 clawbacks, todas del 2026-08-31. Hay 6 settlements del 2026-09-06. **Ninguna fila de dinero nueva en 4 semanas.** Cada reward histórico tiene su clawback.
- Estados: rewards, commissions, payouts, settlement, ledger y attribution congelados y sin cambios.

## 8. Lifecycle — PASS

`offers-lifecycle-v2`, `17 * * * *`, activo. Última corrida `succeeded` el 2026-10-04 a las 23:17 UTC. Sin cambios en PR #44.

## 9. Scanner — PASS

`/api/cron/offer-health-scan`, diario a las 03:00 UTC. Último `last_checked_at`: 2026-10-04 03:46 UTC (la corrida de hoy). La salida a la tienda solo se bloquea con 404/410. Sin cambios en PR #44.

## 10. Founder OS — PASS

- Navegación: CEO (¿Qué debo decidir hoy?), Operations (¿Cómo está funcionando Aventa hoy?) y Technical (¿Cómo está armado y quién puede hacer qué?).
- 17 fichas, con qué decide, qué NO controla y cuándo entrar.
- «Roles y permisos» y «Team Hub», sin «Team» suelto.
- Baneos dentro de Moderación.
- Cubierto por `tests/owner/founderOs.test.ts`.

## 11. Product parity — PASS

- Paridad con staging cerrada en #41; feed, detalle, favoritos, Plaza, notificaciones, `/me`, moderación, Team Hub y CEO Dashboard verificados.
- No se promovió staging. No se copiaron datos, usuarios, crons, tablas ni configuración de dinero.

## 12. Remaining P2 — PASS (no bloquean)

**11 ofertas con «Oferta cargada por lote. Revisar ficha antes de aprobar.»** No se modificaron.

| id | status | expires_at (UTC) |
|---|---|---|
| 61267a33-9779-4b77-83c5-11f646dff8bb | approved | 2026-10-05 01:08:24 |
| c90a091c-90cc-4d32-9dfb-670db434dad3 | approved | 2026-10-05 01:43:19 |
| aa9a51e8-cac2-4399-b141-6e9295338d2f | approved | 2026-10-05 01:43:21 |
| c51e5ab4-d4c6-4f4d-82ec-4f636debfc93 | approved | 2026-10-05 01:43:22 |
| 1beeea9c-98e4-4da6-aeb9-ebeff36f28ea | approved | 2026-10-05 01:43:24 |
| 7ba0aaf5-81da-409c-8eb6-5273b7462540 | approved | 2026-10-05 01:43:25 |
| a07c8ff8-f431-4b4b-9370-1718d000563a | approved | 2026-10-05 01:43:27 |
| 54d0c08e-e254-4681-aa2c-91d544e76de1 | approved | 2026-10-05 01:43:28 |
| 0b094e07-9657-40d4-9906-e2ae3418b323 | approved | 2026-10-05 01:43:29 |
| 9924db0d-2840-4fe4-ae70-9129057bf0d3 | approved | 2026-10-05 01:43:31 |
| d8bb8a67-33ed-42ca-ac0d-d8631f135d07 | approved | 2026-10-05 01:43:32 |

- **¿Visibles?** Las ofertas sí, hasta que venzan solas (≈01:43 UTC del 5 de octubre). **El texto de lote no**: `lib/offers/publicDescription.ts` lo oculta. Verificado en producción sobre `c51e5ab4…`.
- La limpieza opcional (SELECT, UPDATE y validación BEFORE/AFTER) está en `AVENTA_PRODUCTION_CLOSURE_STATUS.md` §10 como operación del owner. No es necesaria.
- **Ojo:** después de ≈01:43 UTC del 5 de octubre quedarán 0 ofertas vigentes (hoy hay 12, todas de este lote más una). No es un fallo técnico, pero antes de abrir al público tiene que haber ofertas aprobadas y vigentes.

Otros P2: la API del feed devuelve `description` sin filtrar en el JSON, y la etiqueta «Patrocinado» aparece en creativos propios de Aventa.

## 13. External gate — BLOCKED

**Supabase Pro + backup visible + restore verificado.** No se resuelve desde el repositorio. Checklist para el fundador (todo en el panel de Supabase):

1. **Proyecto correcto.** Abrir el proyecto con ref `mkgsrpsuvedwwlzmzmzh` (producción). No confundir con `oojshofrpbfwsiypcecr` (staging). Comprobarlo en Settings → General → Reference ID.
2. **Plan Pro.** En Organization → Billing, el plan de la organización que contiene `mkgsrpsuvedwwlzmzmzh` debe decir **Pro**.
3. **Backup visible.** En Project → Database → Backups debe aparecer al menos un backup diario con fecha y estado completado.
4. **Backup verificable.** Elegir el backup más reciente y anotar su fecha/hora exacta (UTC). Si PITR está activo, anotar también la ventana disponible. PITR no sustituye la prueba de restore.
5. **Restore no destructivo.** Usar **Restore to a new project** desde ese backup, hacia un proyecto nuevo y temporal. **No** usar «Restore» sobre el proyecto de producción. Si el panel no ofrece restaurar a un proyecto nuevo, detenerse y pedir a soporte de Supabase un restore de prueba; no restaurar encima de producción.
6. **Comprobar que funciona.** En el proyecto restaurado, ejecutar en el SQL Editor:
   ```sql
   select count(*) from public.offers;
   select count(*) from public.profiles;
   select max(created_at) from public.offers;
   select jobname, active from cron.job;
   ```
   Los conteos deben ser coherentes con producción a la hora del backup (`offers` ≈ 654 hoy) y `max(created_at)` cercano a esa hora.
7. **Fecha/hora del backup:** `____-__-__ __:__ UTC`.
8. **Fecha/hora de la prueba de restore:** inicio `__:__ UTC`, fin `__:__ UTC`. Esto da el **RTO medido**. La distancia entre el backup y el incidente simulado da el **RPO**.
9. **Resultado:** OK / FALLÓ, con conteos y capturas, anotado en este documento.
10. **Producción intacta.** En `mkgsrpsuvedwwlzmzmzh`, comprobar que `/api/health` sigue en `ok`, que `select count(*) from public.offers` no bajó y que el job `offers-lifecycle-v2` sigue activo. Después, **pausar o borrar el proyecto restaurado** para no duplicar costos ni crons. Ese proyecto no debe recibir tráfico ni conectarse a Vercel.

El gate solo se cierra con el punto 6 en OK. Que el backup exista no basta.

## 14. Final GO / NO-GO — PASS (técnico) / BLOCKED (externo)

GO técnico. El release final queda condicionado al gate externo.

---

TECHNICAL STATUS: **PASS**. Código, CI, build, tests, seguridad, dinero congelado, lifecycle y scanner en orden. Sin blockers técnicos.

EXTERNAL STATUS: **BLOCKED**. Falta Supabase Pro + backup visible + restore verificado.

RELEASE STATUS: **READY FOR FINAL EXTERNAL GATE**

BLOCKERS: **1, externo.** Supabase Pro + backup + restore verificado (§13). Blockers técnicos: 0.

NON-BLOCKING P2:
- 11 ofertas con nota de lote (oculta al público y vencen solas).
- `description` sin filtrar en el JSON del feed.
- Etiqueta «Patrocinado» en creativos propios.
- 5 errores de lint preexistentes en `app/page.tsx`.
- PRs antiguos abiertos (#42, #32, #14, #13, #8) que no deben mergearse con este release.

NEXT ACTION:
1. El fundador completa la checklist de §13 y anota el resultado aquí.
2. Con el restore en OK, el fundador decide el merge de PR #44 a `master` (Vercel despliega solo) y se repite el smoke de §4 y §5.
3. Antes de abrir al público, que haya ofertas aprobadas y vigentes en el feed.
4. Con eso: **FINAL RELEASE READY**.
