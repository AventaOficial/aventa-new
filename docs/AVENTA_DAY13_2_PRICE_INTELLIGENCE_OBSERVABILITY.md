# AVENTA — DAY 13.2 — PRICE INTELLIGENCE OBSERVABILITY

Solo observabilidad. No se cambió el contrato de identidad, ni la semántica o los writers de Price Memory, ni DQE, S6.1, provenance, gates, `acquisition_path`, criterios, deadlines, scheduling, orden de fuentes, aceptación o dedupe.

- Rama: `day13.2/pi-observability`, desde `origin/master` `8e8a101`, en el worktree `aventa-day8-master-verify`.
- Sin commit, sin PR, sin deploy y sin ciclos de producción.

Etiquetas: **OBSERVED**, **INFERRED**, **UNKNOWN**. Toda tabla marcada **FIXTURE** proviene de tests deterministas, no de producción.

---

## VERDICT

- Queda instrumentado lo necesario para responder, por candidato y por ciclo: qué identidad posee Price Intelligence (PI) en cada etapa, cuándo cambia, quién la cambia (`sticky_observe` o `enrich_with_price_intel`) y qué efecto tiene (`historyReady`, `habitual30d`, `lowest30d`, `lowest90d`, precio artificial y escrituras a Price Memory).
- **Demostrado en fixture** (OBSERVED en tests):
  - el patrón PRODUCT:X → LISTING:Y se detecta como `overwrite_detected=true` / `identity_changed`, con antes/después;
  - los resultados (meta, escrituras PM y salida del hunter) son idénticos con y sin instrumentación.
- **No demostrado en producción** (UNKNOWN): los campos no existen todavía en snapshots reales, porque no hubo deploy ni ciclo. La frecuencia real del overwrite, su efecto real y el reparto de tiempo del hunter siguen sin medirse.
- El progreso de `hunter_collect` ya no se pierde con el deadline: se persiste en el snapshot final y en el snapshot del watchdog.

---

## OBSERVED

1. **Doble cálculo** (código): `observeStickySkuViaServer` calcula PI con el tip (`observeStickySkus.ts`, `computeMlPriceIntel`). Después, `enrichCandidateMeta` ejecuta `enrichWithPriceIntel`, que re-deriva la clave de `canonicalUrl`. Ambas operaciones quedaron intactas; ahora se observan (`runObservedSecondPricePass` envuelve la misma llamada).
2. **Fixture test 3:**
   - la PI #1 es `product:MLM63084226` (live, `historyReady=true`, `habitual30d=1981.73`);
   - la PI #2 es `listing:MLM4503400006` (evidencia `fallback`, porque la cotización devolvió 403) y deja `historyReady=false` y `habitual30d=null`;
   - `second_pass_changed = {identity, history_ready, habitual30d, lowest30d, lowest90d}` quedan en `true`; `current_price` y `original_price` en `false` (se preservan con `preserveLabelDiscount`);
   - escrituras PM: `sticky_observe` escribe bajo `MLM63084226` y después `enrich_with_price_intel` escribe bajo `MLM4503400006` (`after_price_intel=true`).
3. **A/B** (test 3b): la meta final, las llamadas a `recordSnapshots` y los upserts a PM son idénticos con y sin observer.
4. **Observer defectuoso** (test 7b): si todos los callbacks lanzan excepción, la salida de `enrichWithPriceIntel` es idéntica.
5. **Hunter** (tests 8 a 10):
   - los contadores por fuente registran requests iniciadas, completadas, con error HTTP y timeout, y candidatos recibidos, aceptados, descartados y duplicados;
   - con el deadline externo, la fuente en curso queda como `in_flight_at_deadline` con sus requests contadas; la fuente terminada queda como `finished_result_discarded` con `partial_result_lost=true`; la fuente no alcanzada, como `not_started` / `not_reached_at_deadline`;
   - la salida del engine (`items`, `sourceRuns` sin latencia y `stoppedReason`) es idéntica con y sin progreso.
6. **Nuevo, en código:** `resolveStickyViaProductsApi` también asigna `regularPrice: picked.originalPrice` (`observeStickySkus.ts`, return de `products_items`). Corrige y amplía Day 13.1 §6.4: `freshnessCycle` **no** es el único origen de `regular_price == list_price`. No se modificó.
7. **Build:** poner `node:async_hooks` directamente en `fetchWithTimeout` rompe el bundle cliente, porque `fetchWithTimeout` llega a `app/admin/owner` vía `lib/moderation`. Se resolvió con un registro en `globalThis`: `fetchWithTimeout` no importa nada de Node, y el scope con `AsyncLocalStorage` vive en `requestProgressScope.ts`, que solo importa el engine del servidor.

## INFERRED

- Por el código y el fixture: en producción, todo candidato PRODUCT con mapping `catalog_to_listing_via_products_items` que pase por sticky observe con éxito debería mostrar `calculation_count=2` y `overwrite_reason=identity_changed`.
- Si la cotización de la segunda pasada devuelve 403, como indica la evidencia de acceso de Day 12.5, `price_intel_evidence_kind` final será `fallback`. Es decir, la segunda pasada no aporta evidencia live nueva, solo cambia la historia consultada. **Hay que confirmarlo con datos.**
- Para candidatos con tip = listing sin mapping, el reason esperado es `same_identity_recalculated` con kind `unknown`.

## UNKNOWN

- La frecuencia real de `identity_changed` frente a `same_identity_recalculated` por ciclo.
- Si la segunda pasada obtiene alguna vez evidencia `live` en producción.
- Cuántos `historyReady` cambian realmente por la segunda pasada.
- En qué fase y con qué requests se consume el cap de 75 s de `hunter_collect`.
- El éxito real de las escrituras PM: el writer no reporta éxito a quien llama, así que se registra `attempted: true`.
- El kind de claves sin evidencia explícita (tips sin `products_items`): queda como `unknown` y **no** se infiere por dígitos.

---

## Qué se implementó

### Price Intelligence (por candidato: `candidate_observations[].price_intel`)

| campo | origen | valor si no se conoce |
|---|---|---|
| `price_intel_identity_kind` | Evento del cálculo final aplicado. `product` solo si `/products/{tip}/items` devolvió un listing distinto; `listing`/`product` en la segunda pasada solo si el id coincide con `mlListingItemId`/`mlCatalogProductId` **y** `mlIdentityMatchMethod=catalog_to_listing_via_products_items` | `unknown` |
| `price_intel_identity_id` | id exacto usado por el cálculo | null |
| `observed_listing_id` | listing del mapping `products_items` | null |
| `price_intel_identity_source` | `sticky_observe`, `identity_mapping`, `discovery` (URL de discovery evidence) | `unknown` |
| `price_intel_evidence_kind` | observe: `live`; segunda pasada: `live` solo si `current` vino de la API; si no, `fallback` | `unknown` |
| `price_intel_calculation_count` | número de `computeMlPriceIntel` observados | 0 |
| `price_intel_overwrite_detected` | un cálculo posterior llegó a la meta existiendo uno previo | false |
| `price_intel_previous_identity_kind` / `_id` | cálculo inmediatamente anterior | null |
| `price_intel_overwrite_reason` | `identity_changed` / `same_identity_recalculated` / `unknown` (algún id nulo) | null |
| `price_intel_previous_result_applied` | si el cálculo sobrescrito había llegado a la meta (false en la rama de transporte Day 12.3) | null |
| `before_second_pass` / `after_second_pass` | resumen compacto: identidad, `history_ready`, `habitual30d`, `lowest30d`, `lowest90d`, precios y cláusulas artificiales | null |
| `second_pass_changed` | diff booleano de esos campos | null |
| `calculations[]` (≤6), `price_memory_writes[]` (≤6) | trazas por evento | [] |

Agregado por ciclo: `price_intel_observability` en el payload del snapshot, calculado sobre **todos** los candidatos enriquecidos, no solo los 50 persistidos.

### Price Memory write observability

Cada intento de escritura en los caminos instrumentados registra:
- `writer`;
- `key` exacta;
- `key_kind` (explícito o `unknown`);
- `pi_identity_*` del mismo cálculo;
- `prior_pi_identity_*`;
- `observed_listing_id`;
- `evidence_kind`;
- `after_price_intel`.

Caminos instrumentados: `observeStickySkuViaServer` (con `persistSnapshots`) y `enrichMercadoLibrePriceIntel`, que cubre la segunda pasada del ciclo continuo.

**No instrumentados** en esta fase, y por tanto UNKNOWN: `freshnessCycle`, el worker (`persistWorkerPriceMemory`, `externalWorker`) y los highlights de `discoverMercadoLibre`. Esos llamadores reciben el hook como opcional y hoy no lo pasan.

### Hunter source progress (`hunter_source_progress` en el snapshot final y en el del watchdog)

Por fuente se registra:
- `source`, `started_at`, `finished_at` y `elapsed_ms`;
- `requests` (`requests_started`, `requests_completed`, `requests_http_error`, `requests_failed` y `requests_timed_out`, que incluye aborts), contadas en `fetchWithTimeout` dentro del scope async de la fuente;
- `candidates_received`, `candidates_accepted` (post-dedupe), `candidates_discarded` (`collectedCount - itemsFound` reportado por la fuente) y `duplicates`;
- `errors`, `error_code` y `status`;
- `deadline_status` y `partial_result_lost`.

### Schema

No hubo cambio de schema:
- `discovery_cycle_snapshots.payload` ya es JSON durable. Los campos nuevos son opcionales y aditivos, y los snapshots anteriores siguen siendo válidos.
- `schema_version: 1` y `observability_schema_version: 1` no cambian. Los objetos nuevos llevan su propia versión (`price_intel_observability_version: 1` y `hunter_source_progress_version: 1`).

### Archivos

- **Nuevos:** `lib/bots/ingest/priceIntelObserver.ts`, `lib/hunter/discovery/priceIntelObservability.ts`, `lib/hunter/sourceProgress.ts`, `lib/server/requestProgressCounters.ts`, `lib/server/requestProgressScope.ts` y `tests/hunter/discovery/day13_2PriceIntelObservability.test.ts`.
- **Modificados** (solo hooks opcionales y persistencia aditiva): `mlPricesApi.ts`, `mlPriceEngine.ts`, `priceIntel.ts`, `observeStickySkus.ts`, `continuousDiscoveryCycle.ts`, `discoveryObservability.ts`, `persistContinuousDiscoveryTruth.ts`, `engine.ts` y `fetchWithTimeout.ts`.

---

## PRICE INTELLIGENCE TRACE (FIXTURE)

| candidate | listing_id | identity_kind | identity_id | identity_source | evidence_kind | calculation_count | overwrite_detected | previous_identity | final_identity |
|---|---|---|---|---|---|---:|---|---|---|
| T1 product, solo observe | MLM4503400006 | product | MLM63084226 | sticky_observe | live | 1 | false | — | product:MLM63084226 |
| T2 listing con mapping, sin PI previa | MLM4503400006 | listing | MLM4503400006 | identity_mapping | fallback | 1 | false | — | listing:MLM4503400006 |
| T3 flujo sticky real (observe + segunda pasada) | MLM4503400006 | listing | MLM4503400006 | identity_mapping | fallback | 2 | **true** (`identity_changed`) | product:MLM63084226 | listing:MLM4503400006 |
| T4 listing → product (sintético) | — | product | MLM63084226 | identity_mapping | live | 2 | **true** (`identity_changed`) | listing:MLM4503400006 | product:MLM63084226 |
| T5 tip = item sin mapping | — | unknown | MLM1649534433 | sticky_observe | live | 2 | **true** (`same_identity_recalculated`) | unknown:MLM1649534433 | unknown:MLM1649534433 |
| T6 sin identidad | — | unknown | null | unknown | unknown | 0 | false | — | — |

**Producción: UNKNOWN.** Se llenará con el primer ciclo dry-run que corra este código.

## PRICE MEMORY TRACE (FIXTURE, T3)

| # | writer | key | key_kind | pi_identity | prior_pi_identity | observed_listing_id | evidence_kind | after_price_intel |
|---:|---|---|---|---|---|---|---|---|
| 1 | sticky_observe | MLM63084226 | product | product:MLM63084226 | — | MLM4503400006 | live | false |
| 2 | enrich_with_price_intel | MLM4503400006 | listing | listing:MLM4503400006 | product:MLM63084226 | null | fallback | true |

**OBSERVED en el fixture:** la escritura 2 usa como precio el `current` que ya traía la meta, por el fallback tras el 403. Es el mismo mecanismo de "historia sombra" identificado en Day 13.1.

## HUNTER TRACE (FIXTURE)

| test | source | status | deadline_status | req started / completed / http_err | received | accepted | discarded | duplicates | partial_result_lost |
|---|---|---|---|---|---:|---:|---:|---:|---|
| T8 normal | ml_api_legacy | completed | none | 2 / 2 / 0 | 1 | 1 | 3 | 0 | false |
| T8 normal | env_urls | completed | none | 1 / 1 / 0 | 1 | 0 | null | 1 | false |
| T9 deadline externo | ml_api_legacy | running | in_flight_at_deadline | 1 / 0 / 0 | null | null | null | null | **true** |
| T9b budget del engine | ml_api_legacy | completed | none | 0 / 0 / 0 | 1 | 1 | null | 0 | false |
| T9b budget del engine | env_urls | skipped_deadline | skipped_before_start | 0 / 0 / 0 | null | null | null | null | false |
| T10 múltiples | ml_api_legacy | completed | finished_result_discarded | 1 / 1 / 1 | 1 | null | null | null | **true** |
| T10 múltiples | env_urls | running | in_flight_at_deadline | 1 / 0 / 0 | null | null | null | null | **true** |
| T10 múltiples | amazon_asin | not_started | not_reached_at_deadline | 0 / 0 / 0 | null | null | null | null | false |

**Producción: UNKNOWN.** Lo esperable (INFERRED de Day 13): `ml_api_legacy` como `in_flight_at_deadline` con N requests iniciadas.

---

## TESTS

| Suite | Resultado |
|---|---|
| `tests/hunter/discovery/day13_2PriceIntelObservability.test.ts` | **15/15 passed** (casos 1–10 + 3b A/B, 7b observer defectuoso, agregado/durable, 2 de wiring de gates) |
| Discovery + engine + ingest relacionados (`tests/hunter/discovery`, `hunterEngine`, `sourceHealthSemantics`, `dayToDay`, `tests/bots/ingest`, `priceMemoryNicheProvenance`) | **61 archivos / 651 tests passed** |
| `npm run typecheck` | passed |
| `npm run test:contracts` (dentro de `ci:verify`) | **302 archivos passed, 2 skipped; 3303 tests passed, 8 skipped** |
| `npm run test:launch` | 3 archivos / 32 tests passed |
| `npm run build` | **Compiled successfully** |
| `npm run ci:verify` | **EXIT 0** |

El primer `ci:verify` falló en el build porque `node:async_hooks` llegaba a un bundle cliente. Se corrigió el diseño (sección OBSERVED, punto 7), sin tocar configuración ni timeouts. No hubo fallos por timeout ni por falta de recursos.

Cobertura de los 10 casos pedidos:
1. product con un solo cálculo;
2. listing con un solo cálculo;
3. overwrite product → listing, con antes/después y escrituras;
4. overwrite listing → product;
5. misma identidad recalculada;
6. identidad desconocida, sin inferir por dígitos;
7. observabilidad de escrituras PM (en T3; T3b demuestra que las escrituras no cambian);
8. hunter completo;
9. deadline del hunter (externo y del engine);
10. múltiples fuentes en estados distintos.

## SAFETY

- MONEY_PATH_FROZEN, mint OFF, dry_run y sin pending, sin cambios.
- Sin escrituras a offers, rewards, commissions ni settlement.
- Sin cambios en DQE, S6.1, provenance, gates, `acquisition_path`, criterios de aprobación, deadlines, scheduling, orden de fuentes, ranking, aceptación ni dedupe. Los tests de wiring verifican que los gates reciben la misma meta y que la segunda pasada sigue presente.
- Price Memory: mismas claves, mismas escrituras y mismo orden (A/B en T3b). Sin migración, backfill ni reclasificación.
- Sin requests a Mercado Libre: todo con fixtures y `fetch` stub. Sin ciclos de producción. Sin SELECT nuevos (no fueron necesarios).
- No se expusieron secretos; las trazas contienen solo ids MLM, precios y enums.
- Sin commit, push, PR ni deploy.

## NEXT DECISION

**No se recomienda todavía implementar el contrato.** Falta la siguiente evidencia, en producción y en dry-run, con este código desplegado, cosa que requiere tu autorización explícita de merge y deploy:

| Evidencia | Métrica (ya instrumentada) | Decide |
|---|---|---|
| E1. Frecuencia del overwrite con cambio de identidad | `price_intel_observability.identity_changed / candidates` por ciclo, ≥12 ciclos (1 día) | A |
| E2. Si la segunda pasada aporta evidencia live alguna vez | `calculations[stage=enrich_with_price_intel].evidence_kind` = live frente a fallback | A frente a D |
| E3. Efecto real sobre la readiness | `second_pass_changed_history_ready`, `_habitual30d`, `_lowest30d`, `_lowest90d`, `_artificial` y la dirección del cambio (antes/después) | A, B |
| E4. Escrituras PM bajo claves distintas de la PI previa | `pm_write_attempts_key_differs_from_prior_pi` por ciclo | C |
| E5. Cuántas claves siguen con kind `unknown` (sin mapping explícito) | `final_identity_kind.unknown` | B, C |
| E6. Writers no instrumentados (freshness, worker, highlights) | requiere extender el hook opcional a esos llamadores (siguiente paso de observabilidad, no de contrato) | C |
| E7. Dónde se va el tiempo de `hunter_collect` | `hunter_source_progress.entries[ml_api_legacy].requests` + `deadline_status` | fuera del contrato PI |

Cómo se decidiría:
- **A (corregir el doble cálculo):** si E1 es alto, E2 es siempre `fallback` y E3 muestra cambios de readiness.
- **D (mantener parte del comportamiento):** si E2 muestra evidencia live útil en algún subconjunto.
- **B (owner formal de PI):** requiere E1, E3 y E5.
- **C (modificar Price Memory):** requiere E4 y E6, además de la decisión del owner sobre las filas legacy (Day 13.1 §18).
