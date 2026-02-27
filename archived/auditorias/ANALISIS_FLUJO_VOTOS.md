# Análisis de flujo: voto desde API hasta base de datos

**Fecha:** 21 de febrero de 2025  
**Alcance:** Análisis de riesgo. Sin propuestas de mejora.

---

## 1. Flujo exacto paso a paso

### 1.1 Request HTTP → API

```
POST /api/votes
Body: { offerId: "uuid", value: 1 | -1 }
Headers: Authorization: Bearer <token>
```

### 1.2 Secuencia en el API (`app/api/votes/route.ts`)

| Paso | Acción | Destino | Transacción |
|------|--------|---------|-------------|
| 1 | Rate limit (IP) | Memoria/local | - |
| 2 | Parse body, validar offerId y value | - | - |
| 3 | `fetch(auth/v1/user)` | Supabase Auth (HTTP externo) | - |
| 4 | `supabase.from('offer_votes').select('value').eq(...).maybeSingle()` | PostgREST | **Tx1** (READ) |
| 5a | Si `!existing`: `supabase.from('offer_votes').insert(...)` | PostgREST | **Tx2** (WRITE) |
| 5b | Si `existing.value === value`: `supabase.from('offer_votes').delete(...)` | PostgREST | **Tx2** (WRITE) |
| 5c | Si distinto: `supabase.from('offer_votes').update({ value })` | PostgREST | **Tx2** (WRITE) |

### 1.3 Transacción Tx2 (PostgREST – request único)

PostgREST ejecuta cada request HTTP en una transacción implícita:

```
START TRANSACTION;  -- READ COMMITTED (default)
  -- Operación principal: INSERT | UPDATE | DELETE en offer_votes
  -- Trigger AFTER ... ON offer_votes se dispara
  --   → trigger_recalculate_offer_on_vote()
  --   → PERFORM recalculate_offer_metrics(offer_id)
  --   → WITH m AS (5 subconsultas) UPDATE offers SET ... WHERE id = offer_id
COMMIT;
```

### 1.4 Operaciones en base de datos por voto (caso INSERT)

| Orden | Operación | Tabla | Tipo |
|-------|-----------|-------|------|
| 1 | INSERT | `offer_votes` | Write |
| 2 | Trigger: 5× SELECT (COUNT) | `offer_votes`, `offer_events` | Read |
| 3 | Trigger: 1× UPDATE | `offers` | Write |

---

## 2. Número de UPDATEs sobre la misma fila de `offers` por voto

**Respuesta: 1 UPDATE por voto.**

Cada INSERT/UPDATE/DELETE en `offer_votes` dispara el trigger una vez (FOR EACH ROW, una fila por operación). El trigger ejecuta `recalculate_offer_metrics`, que hace un único `UPDATE offers ... WHERE id = p_offer_id`.

---

## 3. Lock contention: 1000 votos en 1 minuto

### 3.1 Modelo de locks en PostgreSQL

- **INSERT en `offer_votes`:** RowExclusiveLock en la fila insertada. No compite con otras filas.
- **UPDATE en `offers`:** RowExclusiveLock en la fila de la oferta. Varias transacciones que actualizan la misma fila se serializan.

### 3.2 Escenario: 1000 votos/minuto sobre la misma oferta

- 1000 transacciones intentan `UPDATE offers WHERE id = X`.
- Todas necesitan el lock de fila sobre la misma fila.
- Las transacciones se encolan y se ejecutan en serie sobre esa fila.

### 3.3 Estimación de tiempo

Si cada transacción (INSERT + trigger + UPDATE) tarda ~15–30 ms:

- 1000 × 25 ms ≈ **25 s** de tiempo de CPU solo en esa fila.
- Con concurrencia real, la cola puede alargarse por contención y latencia de red.

**Conclusión: sí hay posibilidad de lock contention.** Todas las transacciones compiten por el lock de la misma fila de `offers`.

---

## 4. Transacciones explícitas vs implícitas

| Componente | Tipo | Detalle |
|------------|------|---------|
| API (Node.js) | Sin transacción explícita | Cada llamada a Supabase es un request HTTP distinto |
| SELECT + INSERT | Transacciones separadas | Tx1 = SELECT, Tx2 = INSERT. No hay transacción que englobe ambas |
| INSERT + trigger | Transacción implícita | PostgREST ejecuta INSERT + trigger en la misma transacción |
| Trigger | Dentro de Tx2 | `recalculate_offer_metrics` corre en la misma transacción que el INSERT/UPDATE/DELETE |

**Resumen:** Transacciones implícitas por request. El API no usa transacciones explícitas; SELECT e INSERT son transacciones independientes.

---

## 5. Writes innecesarios dentro del mismo ciclo

### 5.1 Por voto

- 1 write en `offer_votes` (INSERT/UPDATE/DELETE) — necesario.
- 1 write en `offers` (UPDATE vía trigger) — necesario para mantener métricas.

### 5.2 Columnas actualizadas en `offers`

El trigger actualiza siempre estas 6 columnas:

- `votes_count`, `upvotes_count`, `downvotes_count` — cambian con el voto.
- `outbound_24h`, `ctr_24h`, `ranking_momentum` — derivadas de `offer_events`.

En un voto, `offer_events` no cambia. Las columnas de eventos se recalculan y se escriben con los mismos valores. Son writes redundantes en el sentido de que no cambian el resultado, pero no hay múltiples UPDATEs ni ciclos extra.

---

## 6. SELECT seguido de UPDATE y race conditions

### 6.1 En el API (SELECT → INSERT/UPDATE/DELETE)

```
Tx1: SELECT ... FROM offer_votes WHERE offer_id = X AND user_id = Y
Tx2: INSERT INTO offer_votes ...
```

- Dos usuarios distintos: no hay conflicto; cada uno inserta su fila.
- Mismo usuario, doble clic: si Tx1 de la segunda request no ve aún el INSERT de la primera, podría intentar INSERT de nuevo. Con `UNIQUE(offer_id, user_id)` habría violación de constraint y la segunda request fallaría. El API devuelve `ok: false` en ese caso.
- Sin UNIQUE: riesgo de filas duplicadas por usuario/oferta.

### 6.2 En el trigger

```sql
WITH m AS (
  SELECT (COUNT(*) ...) AS votes_count, ...
)
UPDATE offers o SET ... FROM m WHERE o.id = p_offer_id;
```

El CTE y el UPDATE forman una sola sentencia. La lectura y la escritura son atómicas dentro de la misma transacción. No hay race entre SELECT y UPDATE en el trigger.

### 6.3 Entre transacciones (200 votos simultáneos)

Cada transacción:

1. Hace su INSERT en `offer_votes` (filas distintas por usuario).
2. Dispara el trigger.
3. El trigger hace `COUNT(*)` sobre `offer_votes` (incluyendo el INSERT recién hecho, en la misma transacción).
4. Actualiza la fila de `offers`.

Con READ COMMITTED, cada transacción ve los commits previos. Los conteos son correctos. El único efecto es la serialización en el UPDATE de `offers`: las transacciones se encolan para actualizar la misma fila, pero el resultado final es consistente.

---

## 7. Idempotencia del trigger

**Definición:** Una operación es idempotente si repetirla con el mismo estado produce el mismo resultado.

**Análisis de `recalculate_offer_metrics`:**

- Entrada: `p_offer_id`.
- Lógica: `COUNT(*)` en `offer_votes` y `offer_events` → valores derivados.
- Salida: `UPDATE offers SET col1 = v1, col2 = v2, ...`.

Si se ejecuta dos veces sin cambios en `offer_votes` ni `offer_events`, el segundo run produce exactamente el mismo UPDATE. El estado final de la fila es el mismo.

**Conclusión: el trigger es idempotente.** Ejecutarlo varias veces con los mismos datos no altera el resultado.

**Nota:** No evita trabajo redundante. Con 200 votos se ejecuta 200 veces y se hacen 200 UPDATEs sobre la misma fila de `offers`, aunque el efecto lógico sea el mismo que un solo UPDATE al final.

---

## 8. Simulación: 200 usuarios votando la misma oferta

### 8.1 Supuestos

- 200 usuarios distintos.
- Todos votan la misma oferta (mismo `offer_id`).
- Requests llegan en una ventana de ~1–2 segundos.

### 8.2 Secuencia por request

```
Request i (i = 1..200):
  1. auth/v1/user                    ~50–100 ms
  2. SELECT offer_votes              ~5–20 ms   (Tx1)
  3. INSERT offer_votes              ~10–50 ms  (Tx2)
     - Trigger
     - 5× COUNT en offer_votes/offer_events
     - UPDATE offers
     - COMMIT
```

### 8.3 Contención

- Los INSERTs en `offer_votes` afectan filas distintas → poca contención entre ellos.
- Todos los triggers hacen `UPDATE offers WHERE id = X` sobre la misma fila → contención alta.
- Las transacciones se serializan en esa fila.

### 8.4 Tiempo estimado

- Por transacción completa (INSERT + trigger): ~20–40 ms.
- 200 transacciones en serie sobre la fila de `offers`: 200 × 30 ms ≈ **6 s** de tiempo mínimo de cola.
- Con latencia de red y conexiones: puede subir a **10–20 s** o más para que todas terminen.

### 8.5 Comportamiento observado

- Las primeras requests responden rápido.
- Las siguientes empiezan a esperar el lock.
- Posibles timeouts si el cliente o el proxy tienen límites bajos (p. ej. 5–10 s).
- Posible saturación del pool de conexiones de Supabase/PostgreSQL.

---

## 9. Resumen de riesgos

| Pregunta | Respuesta | Riesgo |
|----------|-----------|--------|
| ¿Cuántos UPDATE por voto en `offers`? | 1 | - |
| ¿Lock contention con 1000 votos/min? | Sí, serialización en la fila de `offers` | **Alto** |
| ¿Transacciones explícitas? | No; implícitas por request | Medio |
| ¿Writes innecesarios en el ciclo? | Columnas de eventos recalculadas sin cambio; 1 UPDATE necesario | Bajo |
| ¿SELECT→UPDATE con race? | En API: posible con doble clic; en trigger: no | Medio (API) |
| ¿Trigger idempotente? | Sí | - |

---

## 10. Cuello de botella más probable

**Fila de `offers` actualizada en serie.**

Cada voto provoca un UPDATE sobre la misma fila. Con muchos votos concurrentes sobre la misma oferta:

1. Todas las transacciones compiten por el RowExclusiveLock de esa fila.
2. Se serializan.
3. El tiempo total crece linealmente con el número de votos.
4. Pueden aparecer timeouts, lentitud y saturación de conexiones.

**Cuello de botella:** serialización en `UPDATE offers WHERE id = <offer_id>`.

---

## 11. Diagrama de flujo simplificado

```
[Cliente] POST /api/votes
    │
    ├─► [Auth] GET /auth/v1/user
    │
    ├─► [Tx1] SELECT offer_votes (offer_id, user_id)
    │         └─► Commit
    │
    └─► [Tx2] INSERT | UPDATE | DELETE offer_votes
              │
              └─► Trigger AFTER
                    │
                    └─► recalculate_offer_metrics(offer_id)
                          │
                          ├─► 5× SELECT (COUNT) offer_votes, offer_events
                          │
                          └─► 1× UPDATE offers SET ... WHERE id = offer_id
                              │
                              └─► Commit (incluye INSERT + trigger)
```

---

## 12. Niveles de riesgo consolidados

| Área | Nivel | Motivo |
|------|-------|--------|
| Lock contention en `offers` | **Alto** | Serialización en una fila con muchos votos concurrentes |
| Race en API (SELECT→INSERT) | **Medio** | Depende de UNIQUE; doble clic puede fallar o duplicar |
| Transacciones separadas | **Medio** | SELECT e INSERT en transacciones distintas |
| Writes redundantes | **Bajo** | Reescritura de columnas que no cambian |
| Consistencia del trigger | **Bajo** | Lógica atómica e idempotente |
