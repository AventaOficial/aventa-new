# PRD — Share system (Compartir oferta)

## Feature name

**Share system** — Compartir ofertas en redes y copiar mensaje para comunidades externas.

---

## Goal

Permitir a los usuarios compartir una oferta desde la página de detalle mediante Telegram, WhatsApp, X (Twitter) y copiando un mensaje formateado al portapapeles, manteniendo el tracking de eventos `share` y sin modificar SEO.

---

## User flow

1. Usuario está en **`/oferta/[id]`**.
2. Debajo del CTA "Ver oferta en tienda" ve la fila **Compartir:** con Telegram, WhatsApp, X y **Copiar mensaje**.
3. Clic en Telegram / WhatsApp / X → se abre la app correspondiente con el texto generado (título, precio, enlace, #CazadoEnAventa).
4. Clic en **Copiar mensaje** → se copia el mismo texto; toast "Mensaje copiado. Listo para compartir.".
5. En cualquier acción de compartir se envía evento `share` a **POST /api/events** si hay sesión.

---

## UI components

| Componente | Ubicación | Descripción |
|------------|-----------|-------------|
| Bloque Compartir | `app/oferta/[id]/OfferPageContent.tsx` | Fila con etiqueta "Compartir:" y botones/enlaces: Telegram, WhatsApp, X, Copiar mensaje. Estilo compacto (texto pequeño, bordes). |
| Botón Reportar | Mismo archivo | Se mantiene debajo; no forma parte del share. |

---

## API endpoints

| Método | Ruta | Uso |
|--------|------|-----|
| POST | `/api/events` | Registrar evento. Body: `{ offer_id, event_type: 'share' }`. Opcional; usado para métricas (admin). |

---

## Files involved

- `app/oferta/[id]/OfferPageContent.tsx` — Botones de compartir, generación de texto, track share.
- `lib/shareText.ts` — `generateDealShareText(offer, dealUrl)`: plantilla con título, precio, antes, enlace, #CazadoEnAventa.
- `lib/formatPrice.ts` — Usado por shareText para precios en MXN.

---

## Share URLs (implementation)

- **Telegram:** `https://t.me/share/url?url={encodeURIComponent(dealUrl)}&text={encodeURIComponent(shareText)}`
- **WhatsApp:** `https://wa.me/?text={encodeURIComponent(shareText)}`
- **X (Twitter):** `https://twitter.com/intent/tweet?text={encodeURIComponent(shareText)}`

`dealUrl` = `origin + /oferta/[id]`. `shareText` = salida de `generateDealShareText()`.

---

## Database usage

- No escribe en BD. Solo lectura/escritura vía `offer_events` si el backend persiste eventos (event_type `share`).
