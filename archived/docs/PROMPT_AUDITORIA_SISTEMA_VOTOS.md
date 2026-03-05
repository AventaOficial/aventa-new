# Prompt: Auditoría del sistema de votos (Supabase + código AVENTA)

Usa este texto como prompt para que una persona o una IA analice el sistema de votos en Supabase y en el código, y deje los votos bien definidos y funcionando antes de seguir con otras mejoras.

---

## Contexto

En AVENTA tenemos un sistema de votos sobre ofertas:

- **Like (positivo):** se guarda en BD como `value = 2`. Un like cuenta como 2 en el score.
- **Dislike (negativo):** se guarda como `value = -1`.
- **Score mostrado:** `upvotes_count * 2 - downvotes_count` (upvotes_count = número de filas con value IN (1,2); downvotes_count = filas con value = -1).

Hay reportes de que “los votos no se guardan”, “hay lag” o “no se marcan”. Antes de tocar configuración, perfil o guía, hay que auditar y corregir todo el flujo de votos.

---

## Tu tarea

1. **Revisar en Supabase** la parte de votos (tablas, triggers, RLS, datos).
2. **Revisar en el código** la API, el frontend y el realtime.
3. **Detectar incoherencias** entre BD y código (fórmulas, valores permitidos, permisos).
4. **Listar problemas** encontrados y proponer correcciones concretas (SQL o código).
5. **Comprobar** que no queden sitios que usen `value = 1` si el estándar es `value = 2` para like.

---

## 1. Supabase: qué revisar

### 1.1 Tabla `offer_votes`

- **Columnas esperadas:** al menos `id`, `offer_id`, `user_id`, `value`, `created_at`.
- **Tipos:** `value` debe aceptar 2 y -1 (y opcionalmente 1 por datos antiguos).
- **Índices / restricciones:**
  - ¿Existe **UNIQUE (offer_id, user_id)**? (Un usuario solo un voto por oferta.) Si no, puede haber duplicados.
  - ¿Hay índices para consultas por `offer_id` y por `user_id`?
- **RLS (Row Level Security):**
  - ¿Los usuarios autenticados pueden **INSERT** su propio voto (su `user_id`)?
  - ¿Pueden **UPDATE** y **DELETE** solo sus propias filas?
  - ¿Pueden **SELECT** solo lo necesario? (p. ej. sus votos para el voteMap; los contadores se sacan de `offers`, no leyendo todos los votos.)
- **Datos:** Ejecutar algo como:
  - `SELECT value, COUNT(*) FROM offer_votes GROUP BY value;`  
  ¿Hay valores distintos de 1, 2 y -1? ¿Hay muchos 1 que deberían ser 2?
  - ¿Hay filas con el mismo (offer_id, user_id) (duplicados)?

### 1.2 Tabla `offers`

- **Columnas usadas por votos:** `upvotes_count`, `downvotes_count`, `votes_count`, `ranking_momentum`.
- ¿Estas columnas existen y son numéricas (int o similar)?
- ¿`recalculate_offer_metrics` las actualiza correctamente cuando cambia `offer_votes`?

### 1.3 Función `recalculate_offer_metrics(p_offer_id uuid)`

- Debe:
  - `upvotes_count` = `COUNT(*)` en `offer_votes` donde `offer_id = p_offer_id` y `value IN (1, 2)`.
  - `downvotes_count` = `COUNT(*)` donde `offer_id = p_offer_id` y `value = -1`.
  - `ranking_momentum` = `(upvotes_count * 2) - downvotes_count`.
- ¿La función existe y tiene esta lógica? (Ver en el repo `docs/supabase-migrations/offer_votes_trigger_upvotes_value_2.sql`.)

### 1.4 Trigger en `offer_votes`

- Debe ejecutarse **AFTER INSERT OR UPDATE OR DELETE** en `offer_votes`, por fila.
- Debe llamar a `recalculate_offer_metrics(NEW.offer_id)` o `recalculate_offer_metrics(OLD.offer_id)` en DELETE.
- ¿El trigger existe y está habilitado?
- Probar: insertar/actualizar/borrar una fila en `offer_votes` y comprobar que `offers.upvotes_count`, `offers.downvotes_count` y `offers.ranking_momentum` cambian como corresponde.

### 1.5 Vista `ofertas_ranked_general`

- Debe exponer para el feed:
  - `up_votes` = `o.upvotes_count`
  - `down_votes` = `o.downvotes_count`
  - `score` = `(upvotes_count * 2) - downvotes_count`
- ¿La vista existe y usa esa fórmula para `score`? (Ver `docs/supabase-migrations/view_ranking_blend.sql`.)

### 1.6 Realtime

- ¿Está habilitado Realtime para la tabla `offers`?
- Al actualizar `offers` (p. ej. por el trigger de votos), ¿los clientes suscritos reciben el evento UPDATE con los nuevos `upvotes_count` y `downvotes_count`?

---

## 2. Código: qué revisar

### 2.1 API POST `/api/votes`

- **Request:** body con `offerId`, `value` (2 o -1). Header `Authorization: Bearer <token>`.
- **Flujo:** validar offerId y value; obtener userId del token; si no hay token/user, devolver 200 con `{ ok: false }`; buscar voto existente (offer_id + user_id); si no existe, INSERT; si existe y mismo value, DELETE (quitar voto); si existe y distinto value, UPDATE.
- **Comprobar:** que solo se acepte `value === 2` o `value === -1`; que se use el mismo Supabase (createServerClient) para leer/escribir; que los errores de Supabase no se traguen (log y respuesta coherente).

Archivo: `app/api/votes/route.ts`.

### 2.2 Frontend: envío del voto

- **OfferCard y OfferModal:** envían `value: 2` para like y `value: -1` para dislike.
- ¿Algún sitio sigue enviando `value: 1`?
- ¿Se envía siempre el header `Authorization: Bearer ${session?.access_token}` cuando hay sesión? Si no, la API devuelve ok: false y el voto no se guarda.

Archivos: `app/components/OfferCard.tsx`, `app/components/OfferModal.tsx`.

### 2.3 Frontend: respuesta de la API

- Solo si la respuesta tiene `res.ok && (await res.json())?.ok === true` se debe actualizar el estado local y el voteMap del padre (onVoteChange). Si no, revertir el optimista.
- Comprobar que en ambos componentes se haga esta comprobación y no solo `res.ok`.

### 2.4 VoteMap (votos del usuario por oferta)

- Se obtiene con `fetchBatchUserData(userId, offerIds)`, que lee de `offer_votes` con `value`.
- **Regla de mapeo:** `value === 2` o `value === 1` → mostrar como like (1); `value === -1` → dislike (-1). Así el usuario ve “ya voté” correctamente.
- Archivo: `lib/offers/batchUserData.ts`.

### 2.5 Fórmula del score en todo el frontend

- **Correcto:** `score = upvotes_count * 2 - downvotes_count` (porque un like vale 2).
- **Revisar:** en home, /me, modal, card y **en el hook de realtime** que el score se calcule con esta fórmula y no como `up - down`.
- Archivos: `app/page.tsx` (rowToOffer usa row.score de la vista), `lib/hooks/useOffersRealtime.ts` (al recibir UPDATE de offers debe hacer `score = up * 2 - down`).

### 2.6 Realtime: suscripción a `offers`

- El cliente se suscribe a UPDATE en la tabla `offers`. Cuando el trigger actualiza `upvotes_count`/`downvotes_count`, el payload trae el nuevo row.
- El handler debe actualizar el estado de la oferta en la lista (upvotes, downvotes, score) con la **misma fórmula** que el feed inicial. Si aquí se usa `score = up - down`, el score se mostrará mal tras un voto (bug conocido que debe estar corregido).

---

## 3. Checklist de coherencia

- [ ] En BD, `offer_votes.value` solo 1, 2 o -1; like = 2 (y 1 legacy).
- [ ] Trigger cuenta value IN (1,2) como upvote y value = -1 como downvote.
- [ ] Vista y código usan score = upvotes_count*2 - downvotes_count.
- [ ] API solo acepta value 2 o -1; escribe en offer_votes; trigger actualiza offers.
- [ ] Frontend envía 2/-1 y Bearer token; solo actualiza UI si API responde ok: true.
- [ ] batchUserData mapea value 2 y 1 → 1 (like), -1 → -1 (dislike) para voteMap.
- [ ] Realtime actualiza la lista con up/down/score usando la fórmula up*2-down.
- [ ] No hay duplicados (offer_id, user_id) en offer_votes (UNIQUE).
- [ ] RLS permite a cada usuario leer/escribir solo lo que le corresponde.

---

## 4. Salida esperada del análisis

1. **Lista de problemas** (BD y/o código) con descripción breve y archivo/línea o objeto de BD si aplica.
2. **Cambios recomendados** en orden de prioridad (p. ej. primero trigger/RLS, luego código).
3. **Scripts SQL** si hace falta (recalcular contadores, corregir datos, añadir constraint, etc.).
4. **Confirmación** de que la fórmula del score es la misma en: trigger, vista, page, realtime, modal y card.

---

## 5. Referencia rápida de archivos del repo

| Qué | Dónde |
|-----|--------|
| API votos | `app/api/votes/route.ts` |
| Trigger + recalculate | `docs/supabase-migrations/offer_votes_trigger_upvotes_value_2.sql` |
| Vista feed (score) | `docs/supabase-migrations/view_ranking_blend.sql` |
| VoteMap (batch) | `lib/offers/batchUserData.ts` |
| Realtime ofertas | `lib/hooks/useOffersRealtime.ts` |
| Card votos | `app/components/OfferCard.tsx` |
| Modal votos | `app/components/OfferModal.tsx` |
| Home (rowToOffer) | `app/page.tsx` |
| Reputation weighted | `docs/supabase-migrations/reputation_vote_weight.sql` |

---

## 6. Nota sobre un bug ya corregido en realtime

En `useOffersRealtime` el score al recibir un UPDATE se calculaba como `up - down`. Debe ser `up * 2 - down`. Ese fix ya está aplicado en el código. Verificar que en tu análisis no quede ningún otro sitio que use `up - down` para el score de ofertas.
