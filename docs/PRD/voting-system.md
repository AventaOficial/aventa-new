# PRD — Voting system (Sistema de votos)

## Feature name

**Voting system** — Votación positiva/negativa sobre ofertas para ordenar el feed y reflejar la valoración de la comunidad.

---

## Goal

Permitir a usuarios autenticados votar arriba (like) o abajo (dislike) en ofertas, desde la card del feed y desde la página de oferta. Los votos influyen en el ranking del feed (score y reputation_weighted_score). La API usa valores fijos: up = 2, down = -1.

---

## User flow

1. Usuario ve una oferta en el **feed** (OfferCard) o en **`/oferta/[id]`** (OfferPageContent).
2. Clic en pulgar arriba → voto positivo (score +2 si no había voto, o se quita si ya había positivo).
3. Clic en pulgar abajo → voto negativo (score -1; o se quita si ya había negativo).
4. Toggle: si ya votó positivo y vuelve a clic en positivo, se anula el voto (y viceversa).
5. El contador se actualiza en tiempo real en UI; persistencia en BD vía **POST /api/votes**.
6. Usuario no logueado: toast "Crea una cuenta para votar y ayudar a la comunidad" (card) o no envía voto (página).

---

## UI components

| Componente | Ubicación | Descripción |
|------------|-----------|-------------|
| OfferCard | `app/components/OfferCard.tsx` | Bloque de votos (ThumbsUp, score, ThumbsDown). sendVote(2 \| -1); onVoteChange opcional. |
| OfferPageContent | `app/oferta/[id]/OfferPageContent.tsx` | Botones de voto con contadores; handleVote envía 2 o -1 (o valor actual para anular). |
| OfferModal | `app/components/OfferModal.tsx` | Misma lógica de voto cuando el modal se usa (ej. en /me, perfil, favoritos). |

---

## API endpoints

| Método | Ruta | Uso |
|--------|------|-----|
| POST | `/api/votes` | Registrar o actualizar voto. Body: `{ offerId, value: 2 | -1 }`. Si value coincide con el voto actual, la API borra la fila (anular). Auth: Bearer; sin token responde 200 ok: false. |

---

## Files involved

- `app/components/OfferCard.tsx` — sendVote(2|-1), score local, toast en error.
- `app/oferta/[id]/OfferPageContent.tsx` — handleVote, apiValue 2|-1 o actual para anular.
- `app/components/OfferModal.tsx` — Misma API de votos.
- `app/api/votes/route.ts` — Validación offerId + value 2|-1; insert/update/delete en `offer_votes`; notificación like al dueño; triggers en BD actualizan counts y reputation_weighted_score.
- `lib/offers/batchUserData.ts` — fetchBatchUserData: obtiene voteMap (offerId → 1|-1) para pintar estado del usuario en cards y página.

---

## Database usage (reference)

- Tabla `offer_votes`: (user_id, offer_id, value) con value = 2 (up) o -1 (down). Un registro por usuario por oferta.
- Triggers en BD actualizan `offers.upvotes_count`, `downvotes_count`, `reputation_weighted_score` y métricas relacionadas.
- No modificar esquema ni lógica 2/-1 sin acuerdo explícito.
