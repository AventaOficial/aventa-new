# Piloto Despensa — auditoría y arquitectura

Fecha: 2026-10-11 · Rama: `feat/despensa-pilot` · Estado: implementado y probado en local, sin merge ni despliegue.

## 1. Qué existe hoy (demostrado en código)

| Pieza | Dónde | Hecho verificado |
| --- | --- | --- |
| Feed único | `lib/offers/feedService.ts` (`getHomeFeed`) sobre la vista `ofertas_ranked_general` | Todas las pestañas leen la misma vista. Solo `approved`/`published` y no vencidas. |
| Día a día | `view=vitales`; categorías `vital` de `lib/categories.ts`; 7 días; orden `ranking_blend`; transformación en cliente `applyVitalesFeedTransform` | Las categorías vitales incluyen moda, viajes, servicios y jardín, no solo consumo doméstico. |
| Top | `view=top`, `up_votes >= 1`, orden `score_final` | Sin cambios en este piloto. |
| Recientes | `view=latest`, `created_at desc`, cursor | Sin regla de origen antes del piloto. |
| Para ti | `/api/feed/for-you` (afinidad por `preferred_categories`) y carril `user_product_interests` | Sin cambios en este piloto. |
| Intereses | `/me/intereses` → `user_product_interests` (label, alias, categoría, cadencia) | Única fuente de preferencias de producto. La tabla existe en producción con RLS activo (snapshot del Database Atlas, `lib/databaseAtlas/production.snapshot.json`, 2026-10-10). |
| Pipeline de ofertas | `ingestOfferObservation` es el único escritor; toda inserción máquina o comunidad nace `pending`; solo `app/api/admin/moderate-offer` aprueba | Ningún bot publica. |
| Fuentes | `HUNTER_SOURCES` (`lib/hunter/sources`) y `SUPPLY_SOURCES` (`canPublish:false`) | Walmart, Bodega y Chedraui tienen adaptador sitemap/JSON-LD con flags apagados. Soriana: solo metadatos. Tiendas 3B: no existe en el código. |
| Evidencia de precio | `offer_observations`, `offer_price_snapshots`, `product_price_snapshots`, `offer_health_state`, `offers.bot_meta` | Ninguna de estas tablas llega al feed. El feed no puede probar historial. |
| Unidades | `lib/hunter/offerStandard/unitEconomics.ts` | Solo lo usa adquisición; mezcla unidades y no calcula precio de un empaque único. No se reutiliza ni se modifica. |

### Fallos encontrados

1. **Insignia «Uso diario» rota.** `isDailyCategory` compara etiquetas en español contra ids de categoría; en el feed solo se activaba para `hogar`. Corregido: ahora sale del catálogo de necesidades.
2. **Origen manipulable.** `presentAuthor` decide «Hunter» también por una expresión regular sobre `display_name`, que el usuario puede editar. Para presentación es aceptable; para reglas de ranking no. El piloto usa solo ids de autor configurados en entorno (`isBotUserId`).
3. **Ruta MCP sin la compuerta S6.1.** `lib/mcp/submissions.ts` → `enqueueHunterOffer` → `ingestOfferObservation` no pasa por `machineWriteGate`/S6.1, que solo protege `insertIngestedOffer`. Es diseño desde #61 («llevar Hunter a moderación», cubierto por `tests/v1/productClosure.test.ts`): `MCP_INGEST_ENABLED` apagado por defecto, cliente activo, idempotencia, cuota, validación de candidato y estado `pending` con moderación humana. Le faltan, frente a la ruta de bots, el bloqueo de producción, la memoria negativa y S6.1. **No se tocó**; requiere decisión antes de encender MCP (ver `MCP_GROK_BOTS.md`).
4. **Clasificación de origen incompleta.** Un autor registrado solo en `machine_clients`, sin id en entorno, se clasifica como comunidad. Cerrarlo requiere leer `machine_clients` en el feed (consulta adicional) y queda pendiente.

## 2. Qué se construyó

Todo en `lib/despensa/`, sin dependencias nuevas, sin tablas nuevas y sin escrituras.

| Módulo | Responsabilidad |
| --- | --- |
| `catalog.ts` | Catálogo tipado y versionado (`DESPENSA_CATALOG_VERSION`). Cinco familias; ids estables; sinónimos normalizados; exclusiones; dimensión comparable; `basis` (`official_list` / `aventa_category` / `household_profile` / `hypothesis`). Ninguna entrada es lista oficial; «frescos» queda como hipótesis y no clasifica. |
| `classify.ts` | Una necesidad por texto, por frase completa; gana el sinónimo más temprano y luego el más largo. `despensaNeedIdsFromInterests` lee los intereses existentes: no crea otra fuente de preferencias. |
| `presentation.ts` | Presentación (masa, volumen, conteo, paquetes) y precio por kg, L o pieza. Lectura ambigua → `null`. Solo compara misma necesidad, misma dimensión y misma unidad de conteo. |
| `sources.ts` | Registro con `declared`, `implemented`, `status` y `verification` separados. Solo Mercado Libre tiene verificación registrada (run 38180320728 del worker, modo solo descubrimiento). Tiendas 3B: `pending_research`. |
| `evidence.ts` | Niveles `history_confirmed` (declarado, hoy inalcanzable), `published_with_validity`, `published_source`, `reported`, `incomplete`; frescura. `discountIsVerified` siempre es `false` con los datos actuales. |
| `rank.ts` | Reglas versionadas (`despensa-rank-v1`) y orden lexicográfico determinista: necesidad → evidencia → precio unitario → frescura → preferencia → votos → fecha → id. Evidencia vieja o incompleta deja de competir y va al final. Tope de 3 seguidas por necesidad. |
| `missions.ts` | Contrato de misiones para Grok: `candidates_only`, moderación humana obligatoria, `DESPENSA_MISSIONS_ENABLED = false`. No está conectado a `/api/mcp`. |
| `metrics.ts` | Métricas de un listado; lo que el feed no trae se reporta `null`, no cero. |

### Integración

- `lib/offers/homeFeedClient.ts`: `applyVitalesFeedTransform` conserva la exclusión de score alto (Top) y reemplaza el entrelazado por votos por `rankDespensa`. `view=vitales`, el periodo y el API no cambian. Nueva `limitConsecutiveMachineOffers` para Recientes.
- `lib/offers/feedService.ts`: añade `expires_at` (columna ya filtrada por la vista) y `origin` calculado con `isBotUserId(created_by)`.
- `lib/offers/transform.ts`: `dailyNeed`, `despensaNeedId`, `sourceHost` (solo el dominio; la card sigue sin URL), `expiresAt`, `origin`.
- `app/page.tsx`: aplica la regla de Recientes a la primera página y a cada página siguiente. El cursor sigue siendo el `created_at` del servidor.

## 3. Decisiones que requieren autorización

1. **Renombrar «Día a día» a «Despensa»: no se hizo.** Las categorías vitales incluyen moda, viajes, servicios y jardín; la etiqueta «Despensa» sería engañosa. Camino compatible: mantener id `vitales` y `view=vitales`, cambiar solo la etiqueta y restringir `homeFeedCategoryInList('vitales')` a supermercado, hogar, bebés y belleza. Es una decisión de producto.
2. **Preferencias en Día a día: conectadas** (ver sección 7).
3. **Compuerta S6.1 en la ruta MCP** (fallo 3).
4. **Historial de precio en el feed.** Exponer un resumen de `product_price_snapshots` en la vista sería necesario para `history_confirmed` y para hablar de ahorro. Requiere migración; no se preparó porque el piloto no la necesita para funcionar.

## 4. Línea base (producción, solo lectura, 2026-10-11)

Calculada con el clasificador sobre `GET https://aventaofertas.com/api/feed/home` (API pública).

| Métrica | Día a día (`vitales`) | Recientes (`latest`) |
| --- | --- | --- |
| Ofertas | 22 | 24 |
| Con necesidad del catálogo (v.1 → v.2) | 12 → 15 | 12 → 15 |
| Con precio unitario (v.2) | 14 | 14 |
| Productos duplicados | 0 | 0 |
| Tienda identificable | 22 (Amazon 17, Soriana 5) | 24 (Amazon 19, Soriana 5) |
| Con vigencia futura | 0 | 0 |
| Historial confirmado | 0 (no disponible) | 0 (no disponible) |
| Presentadas como Hunter | 22 | 23 |
| Proporción máquina por id | pendiente (campo no desplegado) | pendiente |

Observaciones:
- La línea base expuso dos fallos del catálogo v.1 que se corrigieron en v.2: «Quitamanchas Sin Cloro» se leía como cloro, y faltaban «limpiador de vidrios», «tostado y molido» y «pure tomate».
- Siguen sin clasificar alimentos para mascota que solo nombran la marca («Purina Beneful Adulto…»). No se añadieron marcas al catálogo a propósito.
- Casi todo el feed actual viene de Hunters. Con tan pocas ofertas de comunidad, la regla de Recientes casi no cambia el orden: no puede inventar ofertas de comunidad que no existen.
- «Soriana» se identifica por dominio, pero eso no significa integración: el registro la mantiene `metadata_only`.

## 5. Pruebas

- `tests/despensa/catalog.test.ts`: integridad del catálogo, clasificación, integración con intereses y preferencias vacías.
- `tests/despensa/presentation.test.ts`: presentaciones, precio unitario y rechazos de comparación.
- `tests/despensa/rank.test.ts`: evidencia, frescura, determinismo, votos frente a calidad, dato faltante, preferencias, saturación y métricas.
- `tests/despensa/sourcesMissions.test.ts`: registro frente a `HUNTER_SOURCES`, verificación, Tiendas 3B, dominios y misiones solo candidatos.
- `tests/offers/homeFeedDespensa.test.ts`: compatibilidad de `view=vitales`, regla de Recientes y origen por id.
- `tests/offers/feedDiversity.test.ts`: el fixture «un tope configurado cambia el inicio» cambió «Detergente líquido» por «Audífonos bluetooth». Con las reglas nuevas el detergente es una necesidad y sube primero; el cambio mantiene lo que la prueba verifica (el tope de duplicados).

## 6. Pendiente

- Decisiones de la sección 3.
- Investigación de Tiendas 3B (términos de uso, acuerdo o API) antes de cualquier adaptador.
- Medir la proporción de origen máquina en Recientes después de desplegar `origin`.
- Clasificar autores de `machine_clients` sin id en entorno.

## 7. Cierre del producto (2026-10-11)

### Preferencias reales

- `GET /api/me/interests?scope=despensa` (misma ruta, misma autenticación bearer, mismo rate limit `interests:<user>`, cliente con RLS del usuario) devuelve solo `needIds` ordenados y `catalogVersion`. No ejecuta el matching de ofertas. Error → 503 sin detalle interno.
- `app/page.tsx` las pide solo en «Día a día» y con sesión; caché de módulo de 60 s por token. Sin sesión o con error, el ranking corre sin preferencias.
- Las preferencias solo desempatan después de necesidad, evidencia, precio unitario y frescura. Top, Para ti y Recientes no las reciben (`tests/despensa/preferences.test.ts`).

### Inventario de bloqueos

| Prioridad | Hallazgo | Estado |
| --- | --- | --- |
| P0 | Ninguno encontrado. | — |
| P1 | Ninguno abierto en el alcance del release. Condicional: encender `MCP_INGEST_ENABLED` en producción sin memoria negativa ni equivalente de S6.1. | Cerrado por defecto; no se activa. |
| P2 | 7 hallazgos de ESLint en `app/page.tsx` heredados de `master`; lint no corre en CI. | Sin cambio. |
| P2 | `tests/discovery` y `tests/despensa` no están en `test:contracts`. | Se corren a mano; decidir si entran a CI. |
| P2 | El ahorro «Ahorras X» sale de precio de lista menos precio; no hay historial que lo confirme. | Previo al piloto; decisión de producto. |
| P2 | En producción todas las ofertas de Día a día son de la marca AVENTA DIARIAS, que oculta la insignia «Uso diario» (`cardAttribution.kind === 'brand'`). | Comportamiento de `master`; decisión de producto. |
| P3 | Varias pruebas exceden 5 s solo bajo carga paralela completa en Windows. | Pasan aisladas y en corrida limpia. |
| P3 | `/admin/owner/crecimiento/war-room` se prerenderiza en build y falla sin variables de Supabase. | Configuración local; CI tiene placeholders. |
| P3 | `/api/feed/home` devuelve el texto del error interno (`TypeError: fetch failed`). | Heredado. |
| P3 | La pestaña Día a día muestra el encabezado «Últimas ofertas». | Heredado; copy. |

### Pruebas corregidas (sin cambiar lo que verifican)

- `writerBoundaryS61.test.ts`: precarga de módulos en `beforeAll`. La importación en frío excedía el timeout y la promesa sobrante llamaba al mock de la prueba siguiente.
- `moderationQualityHardening.test.ts`: el avatar vive en `OfferAuthorCard` desde #91; la prueba ahora lee ese componente.
- `vitest.config.ts`: excluye `e2e/**` (Playwright), que vitest recogía por el patrón `*.spec.ts`.

### Checklist de release

1. Push de la rama y CI verde (`ci:verify`).
2. Preview de Vercel: home en las tres pestañas, detalle de oferta, `/me/intereses` con sesión.
3. Con un usuario de prueba que tenga intereses: Día a día cambia solo desempates; Top y Recientes no cambian.
4. Confirmar en Vercel que `MCP_INGEST_ENABLED` y `BOT_INGEST_MACHINE_PENDING_WRITES` siguen apagados en producción.
5. Merge y despliegue solo con autorización explícita.

### Solo verificable en staging o producción

- Valores reales de flags en Vercel (no hay CLI ni proyecto vinculado en local).
- Feed con datos reales sobre esta rama (en local no hay base de datos; se verificó el estado de error).
- Latencia de la lectura de intereses y su rate limit con tráfico real.
- Vista móvil de la rama.

## 8. Promesa de ahorro (auditoría, sin cambios de código)

Todas las superficies calculan el ahorro como `original_price − price`, sin leer procedencia ni historial:

| Superficie | Muestra | Fuente |
| --- | --- | --- |
| `OfferCard` (feed), `FeaturedOfferCard`, `OfferModal`, `OfferPageContent` (detalle) | «Ahorras X», precio tachado y «-N%» | `offers.original_price` |
| `ActionBar` (vista previa al publicar) | «Ahorras X» | Lo que escribe el usuario |
| `opengraph-image`, `lib/distribution/render/telegramMessage.ts`, `lib/email/templates.ts`, `RewardsOfferSelection` | «-N%» o precio tachado | `offers.original_price` |
| `OfferPriceInsightBlock` (detalle, «Información adicional») | Veredicto `strong` / `fair` / `label_only` / `insufficient` | `offer_price_snapshots` (90 días), vía `lib/offers/priceHistory.ts` |

Evidencia de `original_price`:
- Comunidad: lo escribe quien publica; no hay procedencia.
- Bots: `insertIngestedOffer` lo guarda siempre que sea mayor que el precio. La procedencia (`listing_card`, `source_explicit`, `api_quote` frente a `candidate_declared`) se calcula en ingesta (`lib/supply/intelligence/priceProvenance.ts`, `machinePriceProvenance.ts`), pero no llega a ninguna columna que lean el feed o el detalle.
- El único juicio con historial es `OfferPriceInsightBlock`, y solo en el detalle.

Corrección acotada propuesta (copy, sin datos nuevos ni migración), pendiente de decisión de producto:
1. Cambiar «Ahorras X» por «X menos que el precio de lista» en las cuatro superficies públicas; el precio tachado y «-N%» se quedan, porque ya se leen como precio de lista.
2. Cuando `OfferPriceInsightBlock` devuelva `label_only`, ocultar «-N%» en el detalle y dejar el veredicto.
3. Para hablar de ahorro confirmado hace falta persistir la procedencia o exponer el historial al feed; eso sí requiere migración y no se propone aquí.
