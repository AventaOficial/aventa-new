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
| Intereses | `/me/intereses` → `user_product_interests` (label, alias, categoría, cadencia) | Única fuente de preferencias de producto. Las migraciones del módulo dicen no estar aplicadas: no se asume que la tabla existe en producción. |
| Pipeline de ofertas | `ingestOfferObservation` es el único escritor; toda inserción máquina o comunidad nace `pending`; solo `app/api/admin/moderate-offer` aprueba | Ningún bot publica. |
| Fuentes | `HUNTER_SOURCES` (`lib/hunter/sources`) y `SUPPLY_SOURCES` (`canPublish:false`) | Walmart, Bodega y Chedraui tienen adaptador sitemap/JSON-LD con flags apagados. Soriana: solo metadatos. Tiendas 3B: no existe en el código. |
| Evidencia de precio | `offer_observations`, `offer_price_snapshots`, `product_price_snapshots`, `offer_health_state`, `offers.bot_meta` | Ninguna de estas tablas llega al feed. El feed no puede probar historial. |
| Unidades | `lib/hunter/offerStandard/unitEconomics.ts` | Solo lo usa adquisición; mezcla unidades y no calcula precio de un empaque único. No se reutiliza ni se modifica. |

### Fallos encontrados

1. **Insignia «Uso diario» rota.** `isDailyCategory` compara etiquetas en español contra ids de categoría; en el feed solo se activaba para `hogar`. Corregido: ahora sale del catálogo de necesidades.
2. **Origen manipulable.** `presentAuthor` decide «Hunter» también por una expresión regular sobre `display_name`, que el usuario puede editar. Para presentación es aceptable; para reglas de ranking no. El piloto usa solo ids de autor configurados en entorno (`isBotUserId`).
3. **Ruta MCP sin la compuerta S6.1.** `lib/mcp/submissions.ts` → `enqueueHunterOffer` → `ingestOfferObservation` no pasa por `machineWriteGate`/S6.1, que solo protege `insertIngestedOffer`. Hoy lo contiene `MCP_INGEST_ENABLED` apagado y el estado `pending`. **No se tocó** (fuera de alcance); requiere decisión antes de encender MCP.
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
2. **Preferencias en Día a día.** El ranking ya acepta `preferredNeedIds` (solo desempata). Conectarlo requiere leer `user_product_interests` en el cliente autenticado; el home es público y la tabla no está confirmada en producción.
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
