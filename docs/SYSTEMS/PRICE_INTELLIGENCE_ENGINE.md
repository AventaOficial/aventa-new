# Motor de inteligencia de precios (Canasta Básica)

Estado: implementado, **apagado**. Migraciones `20261012_offer_price_observations.sql` y
`20261013_offer_price_observations_product_series.sql` sin aplicar en ningún entorno remoto.
Política: `price-observation-v2` (`lib/offers/priceObservations/policy.ts`).

Fuente de captura vigente: **solo Mercado Libre** (API oficial). Amazon PA-API está retirada (ver «Fuentes»).

## Qué resuelve

Despensa solo puede decir «Ahorro verificado» si Aventa observó el mismo producto, en la misma tienda y alcance, varias
veces y a lo largo del tiempo. Antes de este motor, `offer_price_snapshots` guardaba precios sin moneda, presentación ni
alcance, y casi todas las ofertas tenían un solo registro. El motor agrega:

1. un modelo de observación compatible con `offer_price_snapshots` (columnas nuevas, nada borrado);
2. una captura periódica por API oficial, apagada por defecto, que reutiliza el cron `pm-freshness`;
3. validación determinista con cuarentena;
4. un evaluador de ahorro verificado que Despensa usa en lugar del historial legado.

## Arquitectura

```
cron pm-freshness (existente, 15:45 UTC)
  └─ after(): Price Memory (sin cambios) → runPriceCaptureCycle()
        ├─ app_config.despensa_price_capture  → apagada si no hay fila con enabled=true
        ├─ sonda de esquema                    → schema_missing si falta la migración
        ├─ ingest_cycle_locks ('despensa_price_capture')
        ├─ candidatos: offers aprobadas/publicadas de Canasta Básica, en MXN, vigentes o caducadas hace ≤ 45 días
        ├─ un candidato por producto (fuente + item externo): la oferta vigente más nueva
        ├─ adaptador: Mercado Libre (API oficial). Amazon: retirada, se omite con source_retired
        ├─ validación (validate.ts) con historial previo del producto (readProductObservations)
        └─ INSERT en offer_price_snapshots (source = capture, idempotency_key única por producto)

/api/despensa → loadDespensaOffers → readProductObservations (lotes de 8 productos) → evaluatePriceHistory → savingEvidence
```

## Identidad y continuidad

Una oferta de bot dura 7 días; el ahorro verificado pide ≥ 14 días de historial. Si la serie se leyera por oferta,
nunca se alcanzaría. Por eso se separan tres cosas:

| Concepto | Qué es | Dónde vive |
| --- | --- | --- |
| Producto (ancla) | `source_id` + `external_item_id` (item ML) | Columnas de cada observación |
| Serie comparable | `identity_key` (`fuente:item|necesidad|variante|presentación`) + alcance | Columnas de cada observación |
| Oferta comercial | La publicación en Aventa (precio, vigencia, enlace) | `offers`; `offer_id` en la observación solo registra qué oferta la originó |

- La serie se lee por producto a través de todas sus ofertas. Una oferta nueva del mismo item no reinicia el historial.
- La captura sigue observando un producto hasta 45 días después de que caduque su última oferta
  (`trackingDaysAfterExpiry`), y lo registra en la procedencia (`anchor_offer_expired`).
- Si varias ofertas apuntan al mismo item, se captura una sola vez por día, anclada a la oferta vigente más nueva.
- La llave de idempotencia es por producto, alcance y ventana de 24 h (sin `offer_id`).
- Al evaluar una oferta, solo cuentan filas con su misma necesidad, variante y presentación (`expect`). Un mismo item
  con otra presentación queda fuera (`different_identity`); si no queda nada, `offer_identity_mismatch`.
- Price Memory (`product_price_snapshots`) no se reutiliza como almacén de evidencia: solo Mercado Libre, una fila
  mutable por día (`last_price`, `min_price` con trinquete), sin alcance, presentación, disponibilidad ni procedencia.
  Sigue intacto y la captura no lo escribe (probado).

## Ciclo de vida de la evidencia

El SQL base (`offer_price_snapshots.sql`) declaraba `offer_id … ON DELETE CASCADE`: borrar físicamente una oferta
borraba sus observaciones. La política de retención v2 (`offers_evidence_protection.sql`) ya la convierte en
`RESTRICT`. Según `docs/LAUNCH/AVENTA_LAUNCH_READINESS.md`, eso está aplicado en producción; este PR no lo verificó
contra la base. La migración `20261014_price_observations_lifecycle.sql` lo garantiza en cualquier entorno, sin depender
de esa migración ni de que un script futuro recuerde archivar:

| Operación | Resultado |
| --- | --- |
| `DELETE FROM offers` de una oferta con observaciones (incluido `clean_offers_and_metrics_data.sql`) | Falla con 23503. Se archiva (`status`/`deleted_at`) |
| `DELETE` de una captura (`source = 'capture'`) | Falla siempre (antes: solo mientras la oferta existiera) |
| `TRUNCATE offer_price_snapshots` o `TRUNCATE offers CASCADE` | Falla (42501) |
| Cambiar precio, fecha, identidad o procedencia de una captura | Falla (ya en 20261013); solo avanza el estado |
| Borrar una fila legado (`create`/`app`/`update`) | Permitido, sin cambio |
| Borrar una oferta sin observaciones | Permitido |

- **Procedencia:** `offer_id` nunca queda colgando ni en `NULL`: la oferta se archiva y sigue resolviendo (título,
  estado, fechas). Se descartó `SET NULL` + copia del id: deja referencias que no resuelven y pierde la integridad referencial.
- **Privacidad:** una observación no tiene datos personales (precio, item, fuente, alcance `online/MX`).
  `offers.created_by` es `ON DELETE SET NULL`, así que la purga de cuentas (`runAccountPurge`) no borra ofertas ni observaciones.
- **Excepción (orden legal sobre una fila):** se hace con una migración revisada que deshabilita la guarda para esa sola operación.
- **Consecuencia operativa:** los scripts que borran ofertas (`clean_offers_and_metrics_data.sql`,
  `scripts/staging-p0d3-dry-run.ts`, `scripts/staging-w15-smoke.mjs`, `tests/offers/ingestConcurrency.pg.integration.test.ts`)
  fallan si la oferta tiene observaciones. Ya era así con la política v2.
- Probado sobre Postgres en proceso: `tests/offers/priceObservationsLifecycle.pglite.test.ts`.

## Precio publicado frente al observado

El motor nunca modifica `offers.price`. Cuando no coinciden, lo informa:

| Caso | Resultado |
| --- | --- |
| Observación de < 48 h y mismo precio (±$0.01) | `priceRelation: matches`; puede haber ahorro verificado |
| Observación de < 48 h con precio distinto (promoción cambiada) | Etiqueta «Precio en tienda distinto al publicado» (`price_differs`), `observed_lower` u `observed_higher`, sin ahorro; Despensa muestra el precio visto y la fecha |
| Observación de ≥ 48 h | `current_stale`: no se compara |
| Disponibilidad `unknown` | Puede mostrarse el precio, nunca ahorro verificado (`availability_unconfirmed`) |
| Agotado | No es precio vigente |
| Presentación de la oferta desconocida | Sin ahorro verificado (`offer_presentation_unknown`) |

Por qué así:

- **Sin tabla nueva.** Los ADR `ADR_price_memory_vs_observations` y `ADR_price_observation_read_bridge` fijan
  `offer_price_snapshots` como backend ligado a ofertas. La migración solo agrega columnas, restricciones e índices.
- **Sin cron nuevo.** Se engancha al `after()` de `pm-freshness` después de Price Memory, en su propio `try`. Si está
  apagada, cuesta una lectura de `app_config`.
- **Sin scraping.** Solo fuentes con API oficial. Soriana, 3B, Walmart, Bodega y Chedraui se omiten con
  `source_not_supported`.
- **Nunca toca `offers`.** La captura solo escribe `offer_price_snapshots` e `ingest_cycle_locks` (probado).

## Modelo de observación

Columnas nuevas en `offer_price_snapshots` (todas `NULL` o con `DEFAULT`; las filas existentes quedan como legado):

| Campo | Contenido |
| --- | --- |
| `recorded_at` | Hora exacta en que respondió la fuente |
| `currency` | ISO 4217; solo `MXN` cuenta |
| `canonical_url`, `store_host`, `source_id`, `external_item_id` | Tienda, fuente e item externo (ASIN, item ML) |
| `identity_key` | `fuente:item|necesidad|variante|presentación` |
| `presentation_key`, `need_id`, `variant_id` | Lectura del título (fuente primero, luego oferta) |
| `scope_kind`, `scope_label` | `online`/`store`/`zone`/`unknown` + sucursal o zona |
| `availability` | `in_stock`/`limited`/`out_of_stock`/`unknown` |
| `original_price` | Precio de lista mostrado por la fuente en el mismo momento (evidencia, nunca referencia) |
| `capture_method`, `provenance` | Método, endpoint, HTTP, título observado, precio de la oferta al capturar, precio válido previo |
| `validation_status`, `validation_reasons`, `validated_at`, `policy_version` | Estado y motivos |
| `corrects_snapshot_id` | Fila que esta observación corrige o invalida |
| `idempotency_key`, `capture_run_id` | Idempotencia y corrida |

Guardas en la base:

- índice único parcial en `idempotency_key`;
- `CHECK` de fuente (se amplía con `capture`), estado, moneda, alcance y disponibilidad;
- una captura siempre declara estado, llave y versión de política;
- disparador: la evidencia de una captura es inmutable (solo avanza el estado) y no se borra nunca; ver
  «Ciclo de vida de la evidencia».

## Validación (validate.ts)

| Resultado | Cuándo |
| --- | --- |
| `invalid` | Precio ≤ 0, moneda distinta de MXN o sin confirmar, fecha imposible; la fuente describe otra necesidad, variante o presentación que la oferta |
| `quarantined` | Precio fuera de [0.4×, 2.5×] la mediana de observaciones válidas previas de la misma serie |
| `valid` + `confirmed_by_persistence` | Cambio extremo confirmado por 2 observaciones en cuarentena, en ventanas de 24 h distintas, dentro de 7 días y ±2 % |
| `valid` + avisos | `presentation_unknown`, `scope_unknown`, `availability_unknown`, `out_of_stock`: la observación es cierta, pero no cuenta para precios |

Inválidas y en cuarentena se guardan. Revisar una observación (`reviewCapturedObservation`) solo cambia su estado
(`superseded`, `invalid` o, desde cuarentena, `valid`) y agrega el motivo. Nunca borra.

## Ahorro verificado (evaluate.ts)

Se exige todo:

1. historial completo: ninguna consulta falló ni llegó recortada (`count` > filas → incompleto);
2. observación actual `valid`, en MXN, disponible (`in_stock` o `limited`), con presentación y alcance conocidos, de
   hace < 48 h, y con el mismo precio (±$0.01) que la oferta publicada; la oferta declara una presentación legible;
3. al menos 4 ventanas de 24 h previas de la **misma serie** (identidad + alcance), repartidas en ≥ 14 días, dentro de 90 días
   y posteriores a la última corrección de moderación (`update`/`manual`);
4. bajada ≥ 5 % frente a la **mediana** de esas observaciones.

Nunca alcanza una sola fila y nunca se usa el precio de lista como referencia. Los umbrales son los de
`OBSERVATION_RULES` (Despensa).

Etiquetas (una por oferta, en este orden):

| Etiqueta | Regla |
| --- | --- |
| Ahorro verificado | Se cumplen las 4 condiciones |
| Precio en tienda distinto al publicado | Observación vigente con otro precio que la oferta |
| Precio de lista contradicho | Historial longitudinal y Aventa nunca vio un precio a menos de 5 % de la etiqueta |
| Precio de lista sin confirmar | Hay precio de lista mayor, sin historial que lo respalde |
| Precio observado | Observación actual vigente que coincide con el precio publicado; sin ahorro demostrado |
| Información insuficiente | Nada de lo anterior |

Compatibilidad: los lectores existentes (`buildOfferPriceInsight(s)`, `readOfferPriceObservations`) descartan filas en
cuarentena, inválidas, reemplazadas o agotadas. Si la migración no está aplicada, vuelven a la consulta legada (error
42703). Despensa ignora las filas legado para verificar ahorro: no prueban moneda, presentación ni alcance. En
producción, hoy cada oferta de Despensa tiene un solo registro, así que el cambio no es visible.

## Captura periódica

Configuración en `app_config` (clave `despensa_price_capture`). Sin fila = apagada.

```json
{ "enabled": true, "paused": false, "maxCandidates": 24, "maxPerSource": { "mercadolibre_mx": 20 },
  "budgetMs": 60000, "minHoursBetweenCaptures": 20, "candidatePool": 2000, "sources": ["mercadolibre_mx"] }
```

`amazon_mx` en `sources` o `maxPerSource` se ignora: una fuente retirada no se puede encender desde la configuración.

Topes duros en código: 60 candidatos, 40 por fuente, 120 s, 10 000 ofertas recorridas por corrida.

### Selección (selection.ts)

Antes se leían las 300 ofertas más recientes. Con la ventana de 45 días tras caducar, un producto cuya última oferta
quedara fuera de esas 300 dejaba de capturarse aunque siguiera elegible. Ahora:

1. **Universo en SQL:** ofertas `approved`/`published`, sin `deleted_at`, vigentes o caducadas hace ≤ 45 días, con
   URL o huella de una fuente capturable (`offer_url ilike *mercadolibre.com.mx*`, `*meli.la*` o
   `product_fingerprint like ml:*`). Amazon, Soriana y lo que no es de una fuente activa ni se leen.
2. **Recorrido paginado por `id`** (keyset, 500 por página) con presupuesto `candidatePool`. Si el universo cabe, se
   recorre entero (`scanComplete: true`). Si no, el inicio rota cada día (`frac(día × φ)` del espacio de uuid, con
   vuelta) y el reporte lo marca. No se recorre la tabla completa cuando el presupuesto no alcanza.
3. **Estado por producto** con `price_capture_product_stats` (última observación, días válidos, primer y último día
   válido; 200 items por llamada, usa `idx_offer_price_snapshots_capture_item_recorded`). Si la función no existe, cae
   a la consulta de capturas recientes (`statsSource: 'fallback'`). Cualquier otra falla detiene la selección
   (`recent_capture_check_failed`): no se captura a ciegas.
4. **Prioridad:** horas desde la última observación, saturadas en la duración del ciclo (elegibles ÷ capacidad + 1
   día, mínimo 2). Nunca observado cuenta como saturado. Suma 24 h si falta historial mínimo y resta 12 h si la oferta
   ya caducó. Los empates se resuelven con un sorteo que cambia cada día. Un producto capturado vuelve al final de la
   cola, así que dentro del ciclo la rotación es estricta.
5. **Atrasados:** un producto está atrasado si excede el ciclo (observado hace más que eso, o nunca observado aunque su
   primera oferta ya es más vieja). Casi siempre es porque la fuente falla con él, p. ej. un 404 permanente. Los
   atrasados comparten una reserva del 25 % del cupo por sorteo y solo usan el resto si sobra. Sin la reserva, 15
   productos muertos de 50 consumían el 60 % de los intentos; con ella, ≤ 1 ciclo × cupo + 25 % del cupo después (probado).
6. **Topes** por fuente y por corrida sobre ese orden. Lo que no entra queda `over_source_cap`/`over_run_cap` con
   `staleHours` en el evento.

Se determina por día y no guarda estado propio. Dos corridas simultáneas eligen lo mismo; el lock deja pasar a una y,
si falla abierto, el índice único evita duplicados (probado).

Por oferta, en orden: necesidad de Canasta Básica → precio > 0 → MXN → fuente identificable → fuente no retirada →
adaptador existente → fuente en la configuración → item externo resoluble → una oferta por producto (la vigente; entre
iguales, la más nueva). Por producto: no capturado en las últimas 20 h → prioridad → topes → historial previo completo
→ lectura → validación → `INSERT`. Cada omisión queda con motivo en `skipped` y en `events` (máximo 200).

### Cobertura (`report.coverage`)

| Campo | Significado |
| --- | --- |
| `scannedOffers`, `scanPages`, `scanComplete`, `scanStartKey` | Qué se recorrió y si fue todo |
| `eligibleProducts`, `estimatedEligibleProducts` | Productos elegibles vistos; estimación del universo si el recorrido quedó corto |
| `observedWithin48h`, `coverage48h` | Elegibles con observación en las últimas 48 h (incluida esta corrida) y su proporción |
| `neverObserved`, `needingHistory` | Sin ninguna observación; sin historial mínimo (null sin la función de estadísticas) |
| `oldestObservationHours` | Antigüedad de la última observación más vieja entre los observados |
| `deferredByQuota`, `runCapacity`, `cycleHours`, `overdueProducts` | Diferidos por cupo, capacidad por corrida, ciclo esperado y atrasados |

**Límite de capacidad:** la cobertura completa no está garantizada. Con la configuración por defecto (20 por corrida,
una corrida diaria) cada producto se observa como mucho una vez cada ⌈elegibles / 20⌉ días. El criterio de ahorro
verificado pide una observación de < 48 h, así que solo es alcanzable para todos mientras elegibles < capacidad × 2
(hoy, < 40 productos). Por encima, `coverage48h` ≈ capacidad × 2 ÷ elegibles; con 100 elegibles, ~0.4. Subir el cupo
hasta el tope duro (40 por fuente) requiere autorización, porque implica más llamadas a Mercado Libre.

Métrica verificable fuera de la app (lectura, sin escribir):

```sql
with eligible as (
  select distinct split_part(product_fingerprint, ':', 2) as item
  from offers
  where status in ('approved','published') and deleted_at is null
    and (expires_at is null or expires_at >= now() - interval '45 days')
    and product_fingerprint like 'ml:%'
), last_obs as (
  select external_item_id as item, max(recorded_at) as last_at
  from offer_price_snapshots
  where source = 'capture' and source_id = 'mercadolibre_mx' and recorded_at >= now() - interval '90 days'
  group by 1
)
select count(*) as eligible,
       count(*) filter (where l.last_at >= now() - interval '48 hours') as observed_48h,
       round(avg((l.last_at >= now() - interval '48 hours')::int), 3) as coverage_48h,
       count(*) filter (where l.last_at is null) as never_observed,
       max(extract(epoch from now() - l.last_at) / 3600)::int as oldest_hours
from eligible e left join last_obs l using (item);
```

Es una aproximación: solo cuenta las ofertas con huella `ml:`. Las de URL sin huella se resuelven en código.

Concurrencia: lock `despensa_price_capture` en `ingest_cycle_locks` (TTL = presupuesto + 60 s, mínimo 5 min). El lock
falla abierto por diseño; si eso pasa, el índice único impide duplicados (probado).

Tiempo: corre en el `after()` de `pm-freshness` (`maxDuration` 300 s), después de Price Memory. El presupuesto efectivo
es el menor entre `budgetMs` (tope 120 s) y lo que le queda a la función menos 15 s. Si quedan menos de 10 s, no
empieza (`skipped_time`, `host_time_insufficient`) y lo intenta en la próxima corrida (probado).

Ofertas sin `expires_at`: el producto las trata como vigentes en el feed, los votos y la RLS, y la captura hace lo
mismo. Siguen elegibles mientras estén `approved`/`published` y sin `deleted_at`. El costo no crece con ellas: la
capacidad por corrida es fija y la rotación reparte el cupo.

Fallas de Mercado Libre (`classifyMlFailure`, por código HTTP):

| Respuesta | Motivo | Reintento | Efecto en la corrida |
| --- | --- | --- | --- |
| 401 / 403 | `source_unauthorized` | No | Tras 3 seguidos se cierra la fuente **solo en esta corrida** |
| 429 | `source_rate_limited` | No | Cierra la fuente de inmediato en esta corrida |
| 404 | `item_not_found` | No | Solo ese item |
| 5xx, sin respuesta | `source_error` | 1 vez | Tras 3 items fallidos seguidos se cierra en esta corrida |
| 200 sin precio legible | `price_unavailable` | No | Solo ese item |
| Moneda no ISO o ausente | Se guarda `invalid` (`currency_unconfirmed`) | — | Solo ese item |

Ninguna falla desactiva la fuente de forma permanente: la siguiente corrida la vuelve a intentar (probado). Presupuesto
agotado → los candidatos restantes quedan `time_budget_exhausted`.

Catálogo de Mercado Libre: un enlace `/p/MLM…` con `wid`/`item_id` se captura sobre ese item exacto y pasa
`catalogProductId` a `resolveMercadoLibrePrice`, que verifica que el item pertenezca al producto de catálogo. Un enlace
`/p/MLM…` sin item se omite con `catalog_without_item`: no se elige un vendedor a ciegas.

Observabilidad: una línea `[price-capture] {json}` por corrida con `runId`, estado, presupuesto, conteos por estado,
motivos, resumen por fuente y hasta 50 eventos. Sin credenciales, tokens ni URLs firmadas.

## Fuentes

| Fuente | Captura | Restricción |
| --- | --- | --- |
| Mercado Libre | `/items/bulk` (título, estado, stock) + `resolveMercadoLibrePrice` (`/items/{id}/prices`, `sale_price`, `products/items`) | OAuth existente. Enlaces `meli.la` sin huella `ml:` no se resuelven |
| Amazon México | **No (retirada)** | Amazon retiró PA-API 5.0 el 15-may-2026 ([guía de migración](https://webservices.amazon.com/paapi5/documentation/migration-guide.html)). La sustituye Creators API (OAuth, credenciales nuevas): no está integrada ni hay evidencia de acceso para Aventa. El adaptador de captura se eliminó; `lib/bots/ingest/amazonPaapi.ts` (descubrimiento) sigue en el repo pero no funciona contra el endpoint retirado |
| Walmart, Bodega Aurrera, Chedraui | No | Adaptadores de sitemap con compliance DEGRADED; no se usan para capturar precios |
| Soriana | No | Sin adaptador ni acceso validado |
| Tiendas 3B | No | Sin API autorizada; no se hace scraping |

## Referencias externas: Profeco QQP

«Quién es Quién en los Precios» ([datos.gob.mx](https://www.datos.gob.mx/dataset/programa_quien_es_quien_precios_2026),
CC BY 4.0) publica precios por establecimiento físico. Evaluación al 13-oct-2026:

| Criterio | Hallazgo |
| --- | --- |
| Frecuencia | Mensual, en dos partes (`bMM_AAAA_q1/q2.csv`). Último periodo: julio 2026, publicado el 22-sep-2026 (~2 meses de retraso). Faltan marzo y abril 2026 en el paquete |
| Esquema | 15 columnas fijas (`producto…longitud`), UTF-8 con BOM, comillas RFC 4180. ~234 MB por parte |
| Cobertura | Supermercados (Walmart, Bodega Aurrera, Soriana, Chedraui…), mercados públicos, farmacias, tiendas de conveniencia; por estado y municipio |
| Identidad | Producto + presentación + marca. Duplicados entre catálogos (`Básicos`/`PACIC`) |
| Licencia | CC BY 4.0: requiere atribución |
| Mecanismo | Descarga directa del CSV; revisión vía `last_modified` de CKAN. Profeco advierte que puede revisar datos de forma retroactiva |

Es adecuado como **referencia de mercado**, no como evidencia de ahorro. Implementación (`lib/despensa/references/profecoQqp.ts`):

- valida el encabezado; rechaza filas con motivo (`not_in_catalog_map`, `presentation_unreadable`, `identity_ambiguous`,
  `invalid_price`, `invalid_date`, `date_outside_period`, `column_count`, `malformed_row`, `missing_location`);
- solo acepta productos de una lista explícita que corresponde sin ambigüedad a una necesidad (arroz, frijol, huevo,
  leche pasteurizada/ultrapasteurizada/en polvo, aceite, azúcar, tortilla de maíz, atún, papel higiénico, pasta para
  sopa). «Leche condensada» o «Frijoles refritos» quedan fuera;
- lee variante y presentación con el mismo lector que las observaciones de Aventa;
- agrega por necesidad, variante, presentación, marca, cadena, estado y municipio (mínimo, mediana, máximo, registros
  y establecimientos distintos), con procedencia (URL, revisión, versión del parser, licencia);
- llave de idempotencia = parser + recurso + revisión + referencia: reprocesar no duplica; una revisión nueva es otra fila.

Etiqueta pública: «Referencia publicada por Profeco (QQP), {fecha}: {precio} en {cadena}, {municipio}, {estado}.»
Nunca «captura», nunca «ahorro». Solo se compara con una oferta del mismo producto, presentación y marca; «S/M» no se
compara.

Importación: `npx tsx scripts/profeco-qqp-import.ts --resource=b07_2026_q1.csv` emite NDJSON. Con
`--target=local --confirm-write` escribe en `price_references` (migración `20261013_price_references.sql`) solo si
la base es local. Muestra real (primeros 3 MB de julio q1, 9 392 filas): 579 aceptadas, 354 referencias, 182
comparables con ofertas; la mayoría de filas son otros productos (`not_in_catalog_map`).

Estado al cierre: el importador y la etiqueta están probados (esquema, idempotencia, procedencia y que nunca se
convierte en ahorro). La lectura en `/api/despensa` y la interfaz **no** se construyeron. No hay ninguna referencia
importada en ningún entorno (la tabla existe en staging desde el 13-oct-2026 y está vacía; en producción no existe),
así que la interfaz no tendría datos que mostrar ni forma de validarse. Para completarla: importar un periodo en
staging y entonces conectar la lectura y la etiqueta con la atribución.

## Estado del precio en Despensa

| Estado | Cuándo |
| --- | --- |
| Ahorro verificado | El motor (o, sin la migración, la regla legada) lo respalda |
| Precio observado | El motor confirmó el precio con una lectura de la tienda de < 48 h que coincide con el publicado |
| Precio publicado | Tienda identificable, sin lectura reciente de Aventa (hoy, todas las ofertas de producción) |
| Información insuficiente | Precio enviado sin tienda identificable |

Además, como avisos: «Precio en tienda distinto al publicado», «Precio de lista contradicho» y «Precio de lista sin
confirmar». Antes de este cierre, toda oferta de tienda identificable decía «Precio observado» sin lectura alguna.

## Costo estimado por corrida (configuración por defecto)

- Base de datos: ~30 consultas (config, sonda, lock ×2, recorrido de 1–4 páginas, estadísticas en lotes de 200,
  historial en lotes de 8, ≤24 inserts). Máximo ~100 con los topes duros (20 páginas de recorrido).
  El recorrido filtra `offers` sin índice dedicado; con decenas de miles de ofertas conviene medir el plan antes de
  subir `candidatePool`.
- Mercado Libre: 1 llamada `/items/bulk` por cada 20 items + 1 a 3 llamadas de precio por item → 21–61 llamadas/día. Sin costo
  monetario por la API.
- Cómputo: dentro de la invocación existente de `pm-freshness`, ≤ 60 s (≤ 120 s con el tope duro y nunca más allá
  del límite de la función), mayormente en espera de red. Menos de US$0.01 por corrida.
- Almacenamiento: ≤ 24 filas/día (~1 KB cada una) → ~9 MB/año. Sin borrado.
- Apagada: 1 lectura de `app_config`.

## Validar la primera corrida en un entorno autorizado

Nunca contra producción. Requiere autorización explícita para aplicar la migración en el entorno elegido.

1. **Local, sin Docker:** `npm i --no-save @electric-sql/pglite@0.3` y
   `node scripts/verify-offer-price-observations-local.mjs` → debe terminar en `TODO OK`.
2. **Local con Supabase** (si Docker funciona): `supabase start` y aplicar las migraciones en el orden de abajo con
   `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f <archivo>`.
3. **Staging (con autorización):** mismas migraciones y orden, con `psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -1 -f <archivo>`
   (`-1` = una transacción por archivo) o pegando cada archivo en el SQL Editor. No usar `supabase db push`.

   | Orden | Archivo | Depende de | Qué hace |
   | --- | --- | --- | --- |
   | 0 | `offer_price_snapshots.sql` | `offers` | Ya existe en producción (RLS activo, solo `service_role`) |
   | 1 | `20261012_offer_price_observations.sql` | 0 | Columnas, CHECK, índice único de idempotencia, guarda |
   | 2 | `20261013_offer_price_observations_product_series.sql` | 1 | Índice por producto, guarda de identidad |
   | 3 | `20261013_price_references.sql` | — | Tabla `price_references` (RLS, solo `service_role`) |
   | 4 | `20261014_price_observations_lifecycle.sql` | 1, 2 | FK RESTRICT, capturas no borrables, sin TRUNCATE, `price_capture_product_stats` |

   Todas son idempotentes (probado aplicándolas dos veces). Estado al 13-oct-2026:

   | Entorno | 0 | 1 | 2 | 3 | 4 |
   | --- | --- | --- | --- | --- | --- |
   | Staging (`oojshofrpbfwsiypcecr`) | aplicada (no existía) | aplicada | aplicada | aplicada | aplicada |
   | Producción (`mkgsrpsuvedwwlzmzmzh`) | existe (212 filas legado, FK ya `RESTRICT`) | no | no | no | no |

   En staging se comprobó contra Postgres 17 real, en una transacción revertida: captura inmutable (precio e item),
   estado de validación editable, borrado y TRUNCATE bloqueados (también para `service_role`), FK `RESTRICT`,
   idempotencia (23505), CHECK de fuente, moneda y captura completa, `price_capture_product_stats` solo para
   `service_role`, y sin lectura para `anon`/`authenticated`. Staging reveló que Supabase da a `service_role` todos
   los privilegios sobre tablas nuevas: la migración 3 ahora se los revoca y deja solo `SELECT, INSERT`.

   Verificar después de la 4:
   ```sql
   select column_name from information_schema.columns
   where table_name = 'offer_price_snapshots' and column_name in ('validation_status','idempotency_key','identity_key');
   select indexname from pg_indexes where tablename = 'offer_price_snapshots';
   select conname, confdeltype from pg_constraint
   where conrelid = 'public.offer_price_snapshots'::regclass and contype = 'f';          -- offer_id → 'r'
   select tgname from pg_trigger where tgrelid = 'public.offer_price_snapshots'::regclass and not tgisinternal;
   select has_function_privilege('anon', 'public.price_capture_product_stats(text, text[], timestamptz)', 'EXECUTE'); -- false
   select count(*) from offer_price_snapshots where validation_status is not null;      -- 0 antes de la primera captura
   ```

   **Rollback** (sin borrar datos; ninguna migración rellena ni reescribe filas):
   - Captura: `paused: true` o borrar la fila de `app_config`. No requiere despliegue.
   - Código: revertir el merge. Los lectores vuelven a la consulta legada si faltan columnas (42703) y la selección
     cae a la consulta de recientes si falta la función.
   - Esquema: no hace falta revertirlo; las columnas son `NULL`/`DEFAULT` y las filas legado no cambian. Si se exigiera,
     `DROP FUNCTION public.price_capture_product_stats(text, text[], timestamptz);`,
     `DROP TRIGGER trg_offer_price_snapshots_no_truncate ON public.offer_price_snapshots;` y
     `DROP INDEX IF EXISTS idx_offer_price_snapshots_capture_item_recorded;`. **No** volver la FK a CASCADE: la política
     de retención v2 la exige en RESTRICT.
4. Activar en staging con topes bajos:
   ```sql
   insert into app_config (key, value) values
     ('despensa_price_capture', '{"enabled":true,"maxCandidates":5,"maxPerSource":{"mercadolibre_mx":5},"budgetMs":30000}'::jsonb)
   on conflict (key) do update set value = excluded.value;
   ```
5. Dry-run: `npx tsx --env-file=.env.local scripts/price-capture-run-once.ts --target=staging`. Revisar `status`,
   `selected`, `skipped` e `inserted` (lo que se habría guardado). No escribe nada.
6. Corrida real: el mismo comando con `--confirm-write`, y repetirlo para comprobar que la segunda corrida da
   `captured_recently` y ninguna fila nueva.
7. Revisar:
   ```sql
   select validation_status, count(*) from offer_price_snapshots where source = 'capture' group by 1;
   select idempotency_key, count(*) from offer_price_snapshots where source = 'capture' group by 1 having count(*) > 1; -- vacío
   select * from offer_price_snapshots where validation_status = 'quarantined' order by recorded_at desc limit 20;
   ```
8. Pausar: `update app_config set value = jsonb_set(value, '{paused}', 'true'::jsonb) where key = 'despensa_price_capture';`

## Condiciones para activar en producción

Todas, con autorización explícita:

1. Migración aplicada y verificada en staging (pasos 3–7) y luego en producción.
2. Al menos 7 corridas en staging sin `failed`, sin duplicados y con cuarentenas revisadas. **Hoy no es posible**:
   staging no tiene `ingest_cycle_locks` (la captura toma ahí su lock) ni `mercadolibre_oauth_tokens`, y el contrato de
   entornos prohíbe copiar el token de producción. Hace falta una app OAuth de Mercado Libre propia de staging, o
   aceptar como primera prueba real una corrida en producción con topes mínimos.
3. Ofertas reales de Despensa en Mercado Libre. Al 13-oct-2026, de 69 ofertas de Mercado Libre dentro de la ventana
   de seguimiento, **una** es de Despensa y tiene item resoluble: Pinol Multiusos 5.1 L (`MLM3138313012`), vencida el
   22-sep (seguimiento hasta el 6-nov). Las 194 ofertas que llegaron por MCP son de Amazon, Soriana, Costco, Chedraui
   y City Club: ninguna capturable. Amazon solo volvería con Creators API verificada (decisión aparte).
4. Token OAuth de Mercado Libre: existe en producción y se renueva solo. Evidencia indirecta: Price Memory, en el
   mismo cron y con la misma `resolveMercadoLibrePrice`, guarda ~120 precios diarios de items de terceros
   (`product_price_snapshots`, 124 el 13-oct). La confirmación directa es la primera corrida: 3 respuestas 401/403
   seguidas cierran la fuente en esa corrida sin guardar nada.
5. Insertar la fila de `app_config` con topes conservadores (`maxCandidates` ≤ 24) y vigilar los registros
   `[price-capture]` durante una semana.
6. El primer «Ahorro verificado» real aparecerá, como pronto, 14 días después de la primera captura de cada producto
   (gracias a la continuidad por producto, ya no depende de que una sola oferta dure 14 días).

Desactivar: `paused: true` o `enabled: false` en la misma fila. No hace falta desplegar.

## Ofertas de Grok que generan historial

Una oferta que llega por MCP solo alimenta la captura si cumple todo esto (comprobado con `normalizeCandidateUrl`,
`strongProductFingerprintForUrl`, `despensaSourceForUrl`, `resolveCaptureItem` y `classifyDespensaText`):

| Clase | Condición | Ejemplo de URL |
| --- | --- | --- |
| `capture_eligible` | Mercado Libre con item en la ruta, título de Despensa | `https://articulo.mercadolibre.com.mx/MLM-3138313012-…-_JM` |
| `reference_only` | Producto de Despensa en una tienda sin captura (Soriana, Chedraui, Walmart, Bodega Aurrera) que Profeco cubre | `https://www.soriana.com/…` |
| `not_capture_eligible` | Catálogo de Mercado Libre sin item (`/p/MLM…`), `meli.la`, Amazon, Costco, City Club, o título que no clasifica | `https://www.mercadolibre.com.mx/…/p/MLM18980915` |

- El MCP rechaza URLs con query: `/p/MLM…?wid=MLM…` vuelve `INVALID_URL`. La única forma capturable es la de
  artículo (`articulo.mercadolibre.com.mx/MLM-<id>`).
- El título que cuenta es el de la página extraída. Debe nombrar el tipo: «Aceite vegetal Nutrioli» clasifica,
  «Aceite Nutrioli» no; «Sal» y «Croquetas» tampoco clasifican hoy.
- Cupos vigentes: 100 aceptados por `runId`, 20 candidatos por llamada, 200 por día y cliente, 10 llamadas por minuto.
  100 aceptadas requieren al menos 20 `runId` distintos.
- Aceptada por MCP no es publicada: cada oferta queda `pending` hasta la moderación. Del 5 al 13 de octubre, de 194
  ofertas MCP, moderación rechazó 164.

Consultas de seguimiento (solo lectura):

```sql
-- Cobertura y última observación por producto
select source_id, external_item_id, max(recorded_at) last_seen,
       count(*) filter (where validation_status = 'valid') valid,
       count(*) filter (where validation_status = 'quarantined') quarantined
from offer_price_snapshots where source = 'capture' group by 1, 2 order by last_seen;
-- Días distintos por producto (el ahorro verificado pide historial de ≥ 14 días)
select external_item_id, count(distinct (recorded_at at time zone 'UTC')::date) days
from offer_price_snapshots where source = 'capture' and validation_status = 'valid' group by 1 order by 2 desc;
```
