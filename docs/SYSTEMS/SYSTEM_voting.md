# SYSTEM — Voting (Sistema de votos)

## Architecture

- **Frontend:** OfferCard, OfferPageContent y OfferModal envían votos con fetch a POST /api/votes. El valor enviado es 2 (up) o -1 (down). Para anular, se reenvía el valor actual y la API borra la fila.
- **Backend:** app/api/votes/route.ts valida offerId y value (2 | -1), obtiene userId desde Bearer token, insert/update/delete en offer_votes. Triggers en Supabase actualizan upvotes_count, downvotes_count y reputation_weighted_score en offers.
- **Estado en UI:** batchUserData devuelve voteMap (offerId → 1 | -1); la UI mapea 2→1 para mostrar “votado arriba” y -1 para “votado abajo”.

## Data flow

1. Usuario hace clic en like/dislike → se calcula nuevo valor (1, -1 o 0 para quitar) → se envía a la API como 2 (up) o -1 (down); si es “quitar”, se envía el valor que tenía (2 o -1) y la API hace delete.
2. API: si no hay fila, insert; si hay fila y mismo value, delete; si hay fila y value distinto, update.
3. Triggers en BD actualizan ofertas (counts y reputation_weighted_score).
4. La UI actualiza el score local de forma optimista; en error muestra toast y revierte.

## Database usage

- **offer_votes:** (user_id, offer_id, value) con value = 2 o -1. Unique por (user_id, offer_id).
- **offers:** columnas upvotes_count, downvotes_count, reputation_weighted_score (actualizadas por triggers).
- No cambiar la semántica 2 = up, -1 = down sin migración y actualización de cliente y triggers.

## Edge cases

- **Sin sesión:** API devuelve 200 con ok: false (no lanza 401 para no revelar estado). La UI muestra toast pidiendo crear cuenta o no envía voto.
- **Anular voto:** Enviar el mismo value que ya tiene; la API borra la fila y los triggers restan del count.
- **Race:** Dos clics rápidos pueden generar dos requests; la API es idempotente por (user_id, offer_id).
- **Notificación like:** Si value === 2, la API opcionalmente inserta en notifications para el dueño de la oferta.
