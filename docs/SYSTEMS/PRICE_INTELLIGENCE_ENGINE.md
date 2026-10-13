# Motor de inteligencia de precios (Canasta Básica)

Estado: implementado, **apagado**. Migración `20261012_offer_price_observations.sql` sin aplicar en ningún entorno remoto.
Política: `price-observation-v1` (`lib/offers/priceObservations/policy.ts`).

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
        ├─ candidatos: offers aprobadas/publicadas, vigentes, de Canasta Básica, en MXN
        ├─ adaptadores: Mercado Libre (API oficial) · Amazon (PA-API, sus propios flags)
        ├─ validación (validate.ts) con historial previo leído por lotes (read.ts)
        └─ INSERT en offer_price_snapshots (source = capture, idempotency_key única)

/api/despensa → loadDespensaOffers → readOfferObservations (lotes de 8) → evaluatePriceHistory → savingEvidence
```

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
- disparador: la evidencia de una captura es inmutable (solo avanza el estado) y no se borra mientras la oferta exista.
  El borrado en cascada de una oferta sigue funcionando.

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
2. observación actual `valid`, en MXN, no agotada, con presentación y alcance conocidos, de hace < 48 h, y con el mismo
   precio (±$0.01) que la oferta publicada;
3. al menos 4 ventanas de 24 h previas de la **misma serie** (identidad + alcance), repartidas en ≥ 14 días, dentro de 90 días
   y posteriores a la última corrección de moderación (`update`/`manual`);
4. bajada ≥ 5 % frente a la **mediana** de esas observaciones.

Nunca alcanza una sola fila y nunca se usa el precio de lista como referencia. Los umbrales son los de
`OBSERVATION_RULES` (Despensa).

Etiquetas (una por oferta, en este orden):

| Etiqueta | Regla |
| --- | --- |
| Ahorro verificado | Se cumplen las 4 condiciones |
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
{ "enabled": true, "paused": false, "maxCandidates": 24, "maxPerSource": { "mercadolibre_mx": 20, "amazon_mx": 10 },
  "budgetMs": 60000, "minHoursBetweenCaptures": 20, "candidatePool": 300, "sources": ["mercadolibre_mx", "amazon_mx"] }
```

Topes duros en código: 60 candidatos, 40 por fuente, 120 s, 400 ofertas en el pool.

Por candidato, en orden: necesidad de Canasta Básica → precio > 0 → MXN → fuente identificable → adaptador
existente → fuente en la configuración → fuente habilitada por sus flags → item externo resoluble → no capturada en las
últimas 20 h → topes → historial previo completo → lectura → validación → `INSERT`. Cada omisión queda con motivo
en `skipped` y en `events` (máximo 200).

Concurrencia: lock `despensa_price_capture` en `ingest_cycle_locks` (TTL = presupuesto + 60 s, mínimo 5 min). El lock
falla abierto por diseño; si eso pasa, el índice único impide duplicados (probado).

Fallas: una tienda abre su cortocircuito tras 3 errores seguidos (Mercado Libre) o un lote fallido (Amazon). Las demás
tiendas siguen. Presupuesto agotado → los candidatos restantes quedan `time_budget_exhausted`.

Observabilidad: una línea `[price-capture] {json}` por corrida con `runId`, estado, presupuesto, conteos por estado,
motivos, resumen por fuente y hasta 50 eventos. Sin credenciales, tokens ni URLs firmadas.

## Fuentes

| Fuente | Captura | Restricción |
| --- | --- | --- |
| Mercado Libre | `/items/bulk` (título, estado, stock) + `resolveMercadoLibrePrice` (`/items/{id}/prices`, `sale_price`, `products/items`) | OAuth existente. Enlaces `meli.la` sin huella `ml:` no se resuelven |
| Amazon México | PA-API GetItems (título, precio, moneda, disponibilidad) | Requiere `BOT_INGEST_AMAZON_PAAPI_ENABLED`, `BOT_INGEST_AMAZON_SOURCE=paapi` y credenciales. Hoy apagado. `amzn.to` sin huella `amz:` no se resuelve |
| Walmart, Bodega Aurrera, Chedraui | No | Adaptadores de sitemap con compliance DEGRADED; no se usan para capturar precios |
| Soriana | No | Sin adaptador ni acceso validado |
| Tiendas 3B | No | Sin API autorizada; no se hace scraping |

## Costo estimado por corrida (configuración por defecto)

- Base de datos: ~30 consultas (config, sonda, lock ×2, pool, recientes, historial en lotes de 8, ≤24 inserts).
  Máximo ~80 con los topes duros.
- Mercado Libre: 1 llamada `/items/bulk` por cada 20 items + 1 a 3 llamadas de precio por item → 21–61 llamadas/día. Sin costo
  monetario por la API.
- Amazon PA-API: 1 GetItems por cada 10 ASIN → 1/día. Sin costo; cuenta contra la cuota de Associates.
- Cómputo: dentro de la invocación existente de `pm-freshness`, ≤ 60 s mayormente en espera de red. Menos de US$0.01 por corrida.
- Almacenamiento: ≤ 24 filas/día (~1 KB cada una) → ~9 MB/año. Sin borrado.
- Apagada: 1 lectura de `app_config`.

## Validar la primera corrida en un entorno autorizado

Nunca contra producción. Requiere autorización explícita para aplicar la migración en el entorno elegido.

1. **Local, sin Docker:** `npm i --no-save @electric-sql/pglite@0.3` y
   `node scripts/verify-offer-price-observations-local.mjs` → debe terminar en `TODO OK`.
2. **Local con Supabase** (si Docker funciona): `supabase start`, aplicar `offer_price_snapshots.sql` y
   `20261012_offer_price_observations.sql` con `psql` contra `127.0.0.1:54322`.
3. **Staging (con autorización):** aplicar la migración con el procedimiento habitual de migraciones manuales (SQL Editor
   o `psql` con la URL de staging). No usar `supabase db push`. Verificar:
   ```sql
   select column_name from information_schema.columns
   where table_name = 'offer_price_snapshots' and column_name in ('validation_status','idempotency_key','identity_key');
   select indexname from pg_indexes where tablename = 'offer_price_snapshots';
   ```
4. Activar en staging con topes bajos:
   ```sql
   insert into app_config (key, value) values
     ('despensa_price_capture', '{"enabled":true,"maxCandidates":5,"maxPerSource":{"mercadolibre_mx":5,"amazon_mx":0},"budgetMs":30000}'::jsonb)
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
2. Al menos 7 corridas en staging sin `failed`, sin duplicados y con cuarentenas revisadas.
3. Una fuente capturable con ofertas reales de Despensa. Hoy producción tiene 19 ofertas (11 Amazon, 8 Soriana): Soriana
   no es capturable y Amazon requiere encender PA-API (flags y credenciales, decisión aparte). Sin eso, la captura en
   producción terminaría con 0 filas.
4. Confirmar que la cuota de PA-API y la de Mercado Libre aguantan la carga diaria.
5. Insertar la fila de `app_config` con topes conservadores (`maxCandidates` ≤ 24) y vigilar los registros
   `[price-capture]` durante una semana.
6. El primer «Ahorro verificado» real aparecerá, como pronto, 14 días después de la primera captura de cada producto.

Desactivar: `paused: true` o `enabled: false` en la misma fila. No hace falta desplegar.
