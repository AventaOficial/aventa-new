# SYSTEM — Compartir (Share)

## Architecture

- **Frontend:** OfferPageContent (y posiblemente OfferCard) con botón Compartir. lib/shareText.ts genera mensaje e URLs para Telegram, WhatsApp, X (Twitter), y “Copiar mensaje”.
- **Tracking:** Al compartir se envía evento POST /api/events con type: 'share', offerId, channel (telegram | whatsapp | twitter | copy).

## Data flow

1. Usuario hace clic en Compartir → se muestra menú (Telegram, WhatsApp, X, Copiar).
2. Se construye texto con shareText (título, precio, link a /oferta/[id]).
3. Se abre URL del canal (wa.me, t.me, twitter.com/intent/tweet) o se copia al portapapeles.
4. POST /api/events { type: 'share', offerId, channel } para analytics.

## Database usage

- **events** (o tabla equivalente): type, offer_id, channel, user_id, created_at. Uso analítico; no crítico para funcionalidad.

## Edge cases

- **Sin offerId:** No enviar evento o enviar sin offerId.
- **Copiar en HTTPS:** navigator.clipboard.writeText; fallback para entornos no seguros.
