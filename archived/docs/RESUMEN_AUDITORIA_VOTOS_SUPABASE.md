# Resumen: auditoría de votos en Supabase

Resultado del análisis que ejecutaste en Supabase sobre `offer_votes`, triggers, RLS y vista. Incluye la **causa raíz** de que los votos no se guardaran y qué hacer a continuación.

---

## 1. Hallazgo principal: CHECK en `offer_votes.value`

- La tabla `offer_votes` tiene un **CHECK** que solo permite `value IN (1, -1)`.
- La **API y el frontend envían `value = 2`** para like (un like cuenta como 2 en el score).
- Por eso **todo INSERT con value = 2 falla en la base de datos**. El usuario hace clic en like, la API intenta insertar, Supabase rechaza por el CHECK, la API recibe error y devuelve `ok: false`, y en el cliente el voto se revierte o no se marca.

**Conclusión:** El sistema de votos en código está pensado para `value = 2` (y -1), pero el esquema de BD no lo permitía. Corregir el CHECK soluciona que los likes se persistan.

---

## 2. Resumen del resto del análisis (Supabase)

| Qué | Estado |
|-----|--------|
| **Tabla offer_votes** | Existe con columnas: id, offer_id, user_id, value, created_at. |
| **CHECK value** | Solo (1, -1) → **hay que permitir 2** (y mantener 1 por legacy). |
| **UNIQUE (offer_id, user_id)** | No confirmado en la lista de constraints; el repo tiene migración `offer_votes_unique_and_count_note.sql` con `idx_offer_votes_offer_user`. Si en tu proyecto no está aplicada, conviene aplicarla para evitar duplicados. |
| **RLS offer_votes** | Políticas correctas: owner_modify (INSERT/UPDATE/DELETE solo propias filas), select_own_or_admin para SELECT. |
| **RLS offers** | SELECT anónimo/autenticado con filtros; UPDATE/DELETE creador o mod; INSERT con created_by = auth.uid(). |
| **offers** | Columnas upvotes_count, downvotes_count, ranking_momentum existen y son numéricas. |
| **Función y trigger** | No se pudo probar el trigger porque el INSERT con value=2 fallaba. Tras corregir el CHECK, hay que volver a probar INSERT/UPDATE/DELETE y comprobar que `recalculate_offer_metrics` actualiza bien los contadores. |
| **Vista ofertas_ranked_general** | Pendiente de verificar definición; típicamente usa upvotes_count, downvotes_count y score = up*2 - down. |

---

## 3. Qué ejecutar (en orden)

### Paso 1: Permitir `value = 2` en la BD

Ejecutar en **Supabase SQL Editor** la migración:

**`docs/supabase-migrations/offer_votes_allow_value_2.sql`**

- Quita el CHECK actual sobre `value` (nombre típico: `offer_votes_value_check`).
- Añade un nuevo CHECK: `value IN (1, 2, -1)`.

Si al hacer `DROP CONSTRAINT` dice que el constraint no existe, buscar el nombre real con:

```sql
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.offer_votes'::regclass AND contype = 'c';
```

y usar ese nombre en el `DROP CONSTRAINT`.

### Paso 2: Responder a Supabase

Puedes contestar con:

**"Modificar y probar."**

Así Supabase puede:

- Ajustar el CHECK para aceptar 2 (o tú ya lo habrás hecho con la migración de arriba).
- Hacer pruebas de INSERT/UPDATE/DELETE en `offer_votes` y comprobar que:
  - `recalculate_offer_metrics` actualiza `offers.upvotes_count`, `downvotes_count` y `ranking_momentum`.
  - Realtime emite UPDATE en `offers` (según triggers).

### Paso 3: Confirmar UNIQUE (offer_id, user_id)

Si en el listado de constraints no aparece un UNIQUE en (offer_id, user_id), aplicar también:

**`docs/supabase-migrations/offer_votes_unique_and_count_note.sql`**

(solo la parte del índice único; el resto son comentarios):

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_offer_votes_offer_user
  ON public.offer_votes (offer_id, user_id);
```

### Paso 4: Recalcular contadores de ofertas existentes

Después de cambiar el CHECK, si ya hay filas en `offer_votes` con value = 1 o -1, los contadores deberían estar bien. Si en algún momento hubo datos inconsistentes, puedes forzar un recálculo:

```sql
SELECT public.recalculate_offer_metrics(id)
FROM public.offers
WHERE id IN (SELECT DISTINCT offer_id FROM public.offer_votes);
```

(Solo si la función `recalculate_offer_metrics` existe y está creada según `offer_votes_trigger_upvotes_value_2.sql`.)

---

## 4. Resumen ejecutivo

| Problema | Causa | Solución |
|----------|--------|----------|
| Los likes no se guardan | CHECK en `offer_votes.value` solo permite 1 y -1; la API envía 2 | Ejecutar `offer_votes_allow_value_2.sql` (permitir value 1, 2, -1). |
| Posibles duplicados (offer_id, user_id) | Falta o no confirmado UNIQUE | Aplicar índice único `idx_offer_votes_offer_user`. |
| Trigger / recalculate no probados | INSERT con value=2 fallaba antes | Tras corregir CHECK, decir "Modificar y probar" a Supabase para que ejecute INSERT/UPDATE/DELETE y verifique contadores y Realtime. |

Después de aplicar el CHECK y, si toca, el UNIQUE y las pruebas que haga Supabase, el flujo de votos (like = 2, dislike = -1) debería quedar alineado entre BD, API y frontend.

---

## 5. Resultado tras aplicar cambios (Supabase)

Supabase aplicó los cambios y reportó lo siguiente.

### Hecho

- **CHECK en `offer_votes.value`:** Ahora permite `value IN (2, 1, -1)`. Constraint: `offer_votes_value_check`.
- **UNIQUE (offer_id, user_id):** Creado como `offer_votes_offer_user_unique`. No hay duplicados.
- **Índices:** Existen `idx_offer_votes_offer_id`, `idx_offer_votes_user_id` (y otros).
- **RLS:** Políticas correctas (owner_modify, select_own_or_admin). Columnas en `offers` (upvotes_count, downvotes_count, ranking_momentum) presentes y numéricas.
- **Datos actuales:** value = -1 → 2 filas; value = 1 → 12 filas; aún no hay value = 2 en el dataset (los nuevos likes ya podrán guardarse).

### No hecho (por no tocar datos de producción)

- No se ejecutaron pruebas reales de INSERT/UPDATE/DELETE para comprobar que el trigger actualiza `offers`.
- Pendiente: verificar definición de `recalculate_offer_metrics`, trigger en `offer_votes`, vista `ofertas_ranked_general` y Realtime en `offers`.

---

## 6. Pendientes y qué pedir a Supabase

Conviene que Supabase (o tú en el SQL Editor) haga solo **lecturas** para cerrar la auditoría:

| Verificación | Qué hacer |
|--------------|-----------|
| **Función `recalculate_offer_metrics`** | Mostrar definición con `pg_get_functiondef(oid)`. Debe: upvotes_count = COUNT donde value IN (1,2), downvotes_count = COUNT donde value = -1, ranking_momentum = (upvotes_count * 2) - downvotes_count. |
| **Trigger en `offer_votes`** | Comprobar que existe AFTER INSERT OR UPDATE OR DELETE y que llama a `recalculate_offer_metrics`. |
| **Vista `ofertas_ranked_general`** | Confirmar que existe y que score = (upvotes_count * 2) - downvotes_count (y que usa up_votes / down_votes desde offers). |
| **Realtime en `offers`** | En el panel de Supabase → Database → Replication, confirmar que la tabla `offers` tiene Realtime habilitado para que el cliente reciba UPDATEs al votar. |

Las pruebas de INSERT/UPDATE/DELETE de prueba son opcionales: puedes validar el flujo completo desde la app (dar like y ver que el número sube y que no revierte).

### Respuesta sugerida para Supabase

Puedes contestar algo así:

**"Gracias. Para cerrar la auditoría, ejecuta solo lecturas: 1) Definición de la función recalculate_offer_metrics (pg_get_functiondef). 2) Definición del trigger en offer_votes (pg_get_triggerdef). 3) Confirmar que la vista ofertas_ranked_general existe y que score = (upvotes_count * 2) - downvotes_count. 4) Indicar si la tabla offers tiene Realtime habilitado en el panel. No hace falta hacer INSERT/UPDATE/DELETE de prueba; lo probaremos desde la app."**

---

## 7. Resumen ejecutivo (actualizado)

| Estado | Detalle |
|--------|---------|
| **Resuelto** | CHECK permite value = 2. UNIQUE(offer_id, user_id) creado. Índices y RLS correctos. Los likes desde la app ya pueden guardarse. |
| **Pendiente (solo lectura)** | Verificar definición de recalculate_offer_metrics, trigger, vista y Realtime en offers. |
| **Prueba final** | En la app: dar like a una oferta y comprobar que el número se actualiza y no revierte (y, si aplica, que Realtime actualiza la lista sin recargar). |
