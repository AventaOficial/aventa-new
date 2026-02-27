# Auditoría técnica: Sistema de votos y métricas

**Fecha:** 21 de febrero de 2025  
**Alcance:** Diagnóstico arquitectónico. Sin propuestas de solución.

---

## 1. Funciones que escriben en cada destino

### 1.1 `offers.votes_count`

| Origen | Tipo | Archivo / Función |
|-------|------|-------------------|
| `recalculate_offer_metrics` | Función SQL | `017_offers_vote_counts_and_trigger.sql` (líneas 44) |
| Backfill migración 015 | UPDATE directo | `015_ofertas_ranking_columns.sql` (líneas 55-70) |
| Backfill migración 017 | UPDATE directo | `017_offers_vote_counts_and_trigger.sql` (líneas 13-25) — no escribe `votes_count`, solo `upvotes_count`/`downvotes_count` |
| `recalculate_offer_metrics` (016) | Función SQL | `016_recalculate_offer_metrics.sql` (líneas 15) — versión anterior, reemplazada por 017 |

**Nota:** La migración 017 añade `upvotes_count` y `downvotes_count`; `votes_count` sigue siendo escrita por `recalculate_offer_metrics` (017).

### 1.2 `offers.score`

| Origen | Tipo | Archivo / Función |
|-------|------|-------------------|
| `recalculate_offer_metrics` | Función SQL | `017_offers_vote_counts_and_trigger.sql` — **no escribe `score`** |
| Vista `ofertas_ranked_general` | Vista (lectura) | Calcula `score` como `upvotes_count - downvotes_count` en tiempo de consulta |

**Hallazgo:** No existe columna física `offers.score`. El score se deriva de `upvotes_count - downvotes_count` en la vista `ofertas_ranked_general`. La función `recalculate_offer_metrics` (017) no escribe `score` en `offers`.

### 1.3 `offers.hotness`

**Hallazgo:** No existe columna `offers.hotness` en el esquema. No hay escrituras.

### 1.4 `offer_events`

| Origen | Tipo | Archivo / Endpoint |
|-------|------|--------------------|
| `/api/track-view` | INSERT | `app/api/track-view/route.ts` (línea 49) |
| `/api/track-outbound` | INSERT | `app/api/track-outbound/route.ts` (línea 37) |
| `/api/events` | INSERT | `app/api/events/route.ts` (línea 35) |

**Solo INSERT.** No hay UPDATE ni DELETE en `offer_events` desde la aplicación.

### 1.5 `votes` / `offer_votes`

| Origen | Tipo | Archivo / Endpoint |
|-------|------|--------------------|
| `/api/votes` | INSERT | `app/api/votes/route.ts` (línea 77) |
| `/api/votes` | UPDATE | `app/api/votes/route.ts` (líneas 101-106) |
| `/api/votes` | DELETE | `app/api/votes/route.ts` (líneas 90-95) |

**Nota:** La tabla se llama `offer_votes`, no `votes`.

---

## 2. Escrituras en `offers` (columnas derivadas)

La función `recalculate_offer_metrics(p_offer_id)` escribe en una sola sentencia:

| Columna | Escritura |
|---------|-----------|
| `votes_count` | Sí |
| `upvotes_count` | Sí |
| `downvotes_count` | Sí |
| `outbound_24h` | Sí |
| `ctr_24h` | Sí |
| `ranking_momentum` | Sí |
| `score` | No (no existe columna) |

---

## 3. Triggers activos relacionados a votos

| Trigger | Tabla | Eventos | Función | Archivo |
|---------|-------|---------|---------|---------|
| `trg_offer_votes_recalculate` | `offer_votes` | AFTER INSERT OR UPDATE OR DELETE | `trigger_recalculate_offer_on_vote()` | `017_offers_vote_counts_and_trigger.sql` |

**No existe trigger en `offer_events`.** La migración 015 indica explícitamente que se deben crear triggers o jobs para actualizar métricas cuando cambien `offer_votes` u `offer_events`, pero solo se implementó el trigger para `offer_votes`.

---

## 4. Funciones SQL relacionadas

| Función | Propósito | Invocada por |
|---------|-----------|--------------|
| `recalculate_offer_metrics(p_offer_id uuid)` | Recalcula y escribe en `offers`: votes_count, upvotes_count, downvotes_count, outbound_24h, ctr_24h, ranking_momentum | Trigger `trg_offer_votes_recalculate` |
| `trigger_recalculate_offer_on_vote()` | Llama a `recalculate_offer_metrics` con OLD/NEW.offer_id | Trigger AFTER INSERT/UPDATE/DELETE en `offer_votes` |
| `refresh_offer_performance_metrics()` | REFRESH de la materialized view `offer_performance_metrics` | API admin (no relacionada directamente con votos) |

---

## 5. Endpoints API que tocan votos y eventos

| Endpoint | Operación | Tabla |
|----------|------------|-------|
| `POST /api/votes` | INSERT / UPDATE / DELETE | `offer_votes` |
| `POST /api/track-view` | INSERT | `offer_events` |
| `POST /api/track-outbound` | INSERT | `offer_events` |
| `POST /api/events` | INSERT | `offer_events` |

---

## 6. Estado primario vs derivado

### Estado primario (fuente de verdad)

| Entidad | Descripción |
|---------|-------------|
| `offer_votes` | Cada fila = un voto de un usuario en una oferta. Columnas: offer_id, user_id, value (1 | -1). |
| `offer_events` | Cada fila = un evento (view, outbound). Columnas: offer_id, user_id, event_type, created_at. |

### Estado derivado (calculado)

| Columna en `offers` | Depende de |
|--------------------|------------|
| `votes_count` | COUNT(*) en `offer_votes` WHERE offer_id |
| `upvotes_count` | COUNT(*) FILTER (value=1) en `offer_votes` |
| `downvotes_count` | COUNT(*) FILTER (value=-1) en `offer_votes` |
| `outbound_24h` | COUNT(*) FILTER (event_type='outbound') en `offer_events` WHERE created_at >= now() - 24h |
| `views_24h` | No se persiste; se usa para calcular ctr_24h |
| `ctr_24h` | outbound_24h / views_24h * 100 |
| `ranking_momentum` | score + (outbound_24h * 0.3) + (ctr * 0.5) |

### Dependencias

```
offer_votes (INSERT/UPDATE/DELETE)
    → trg_offer_votes_recalculate
        → recalculate_offer_metrics(offer_id)
            → UPDATE offers SET votes_count, upvotes_count, downvotes_count, outbound_24h, ctr_24h, ranking_momentum

offer_events (INSERT)
    → (ningún trigger)
    → offers.outbound_24h, ctr_24h, ranking_momentum NO se actualizan
```

---

## 7. Escrituras críticas

| Escritura | Cuándo ocurre | Consistencia |
|-----------|---------------|--------------|
| `offer_votes` INSERT/UPDATE/DELETE | Cada voto del usuario vía `/api/votes` | Correcta |
| `offers` UPDATE (métricas de votos) | Trigger tras cada cambio en `offer_votes` | Correcta para votos |
| `offer_events` INSERT | Cada view/outbound vía `/api/track-view`, `/api/track-outbound`, `/api/events` | Correcta |

---

## 8. Escrituras derivadas

| Escritura | Origen | Observación |
|-----------|--------|-------------|
| `offers.votes_count`, `upvotes_count`, `downvotes_count` | `recalculate_offer_metrics` (trigger en `offer_votes`) | Se actualizan solo cuando hay cambios en votos |
| `offers.outbound_24h`, `ctr_24h`, `ranking_momentum` | `recalculate_offer_metrics` | Se recalculan leyendo `offer_events`, pero **solo cuando hay un cambio en `offer_votes`** |

---

## 9. Riesgos detectados

### 9.1 Inconsistencia: `offer_events` sin trigger

**Descripción:** No hay trigger en `offer_events`. Cuando se inserta un view o outbound, `offers.outbound_24h`, `offers.ctr_24h` y `offers.ranking_momentum` no se actualizan.

**Impacto:** Las ofertas que reciben views/outbound pero no votos mantienen métricas de eventos desactualizadas hasta que alguien vote.

### 9.2 Lógica redundante

- **Vista `ofertas_scores`** (010): Calcula up_votes, down_votes, score desde `offer_votes` con LEFT JOIN. La home usa `ofertas_ranked_general` (017), que lee de `offers` (upvotes_count, downvotes_count). `ofertas_scores` queda como vista huérfana para el flujo principal.
- **Vista `offer_performance_metrics`** (013/014): Materialized view que calcula views, outbound, ctr, score desde `offer_events` y `offer_votes` directamente. Fuente distinta a las columnas en `offers`.

### 9.3 Funciones que recalculan votes_count

- `recalculate_offer_metrics`: Recalcula `votes_count` con `COUNT(*) FROM offer_votes`.
- Backfill 015: Escribió `votes_count` en migración inicial.
- Backfill 017: No escribe `votes_count`; solo `upvotes_count` y `downvotes_count`.

No hay duplicación de lógica de recálculo; la única fuente activa es `recalculate_offer_metrics`.

### 9.4 Ejecución del trigger por evento

El trigger es `FOR EACH ROW`. Cada INSERT/UPDATE/DELETE en `offer_votes` dispara una ejecución. La API de votos opera sobre una fila por request (un usuario, una oferta), por lo que no hay múltiples disparos por evento de negocio.

### 9.5 Riesgo de race conditions

- **Escenario:** Dos usuarios votan la misma oferta de forma concurrente.
- **Comportamiento:** Cada transacción ejecuta su trigger dentro del mismo tx. El `SELECT COUNT(*)` ve el estado en ese momento. El último `UPDATE` en `offers` gana; ambos cálculos son correctos si el conteo refleja el estado final.
- **Conclusión:** Riesgo bajo. El modelo “last write wins” es coherente para conteos.

### 9.6 Múltiples UPDATE sobre `offers` por evento

Un único voto (INSERT/UPDATE/DELETE) produce un único UPDATE en `offers` vía el trigger. No hay doble actualización por evento.

### 9.7 Rutas duplicadas para eventos

- Views: `/api/track-view` (body: `offerId`) y `/api/events` (body: `offer_id`, `event_type: 'view'`).
- Outbound: `/api/track-outbound` (body: `offerId`) y `/api/events` (body: `offer_id`, `event_type: 'outbound'`).

Misma operación (INSERT en `offer_events`) desde distintos endpoints. No genera duplicación de lógica de actualización de `offers` porque no existe trigger en `offer_events`.

---

## 10. Resumen de consistencia

| Área | Nivel | Comentario |
|------|-------|------------|
| Votos → offers | Alta | Trigger actualiza correctamente votes_count, upvotes_count, downvotes_count. |
| Eventos → offers | Baja | Sin trigger; outbound_24h, ctr_24h, ranking_momentum desactualizados cuando solo hay eventos y no votos. |
| Fuentes de score | Media | `ofertas_ranked_general` usa columnas de `offers`; `offer_performance_metrics` y `ofertas_scores` calculan desde tablas base. |
| API de votos | Alta | Un solo endpoint, lógica clara (INSERT/UPDATE/DELETE según estado previo). |
| API de eventos | Media | Tres endpoints para INSERT en `offer_events`; comportamiento equivalente pero fragmentado. |

---

## 11. Inventario de vistas que consumen votos/métricas

| Vista | Lee de | Uso |
|-------|--------|-----|
| `ofertas_ranked_general` | `offers` (upvotes_count, downvotes_count, ranking_momentum) | Home, búsqueda |
| `ofertas_scores` | `offer_votes` (LEFT JOIN) | No usada por home (017) |
| `ofertas_scores_ranked` | `ofertas_scores` | Posible uso en modo "top" |
| `offer_performance_metrics` | `offer_events`, `offer_votes` | Admin metrics |
| `daily_system_metrics` | `offer_votes`, `offer_events` | Métricas diarias |

---

## 12. Nota sobre `offer_votes`

La tabla `offer_votes` se referencia en migraciones (006, 009, 010, etc.) pero su `CREATE TABLE` no aparece en el directorio de migraciones analizado. Se infiere el esquema: `offer_id`, `user_id`, `value`. La restricción de unicidad (user_id, offer_id) no está documentada en migraciones.
