# SYSTEM — Subir oferta (Upload offer)

## Architecture

- **Frontend:** Modal dentro de ActionBar (client component). Formulario controlado con estado local; envío vía fetch a /api/offers. Imágenes previas desde parse-offer-url (URL externa) o upload a Supabase Storage.
- **Backend:** Next.js Route Handlers (app/api/offers, upload-offer-image, parse-offer-url). Supabase como BD y Storage; RPC para contadores de perfil.
- **Entrada alternativa:** Ruta /subir recibe query params (extensión o deep link) y redirige a /?upload=1&...; home abre el modal y ActionBar prellena desde params.

## Data flow

1. Usuario abre modal → opcionalmente pega URL → parse-offer-url devuelve title, image, store → se rellenan campos (sin pisar los ya rellenados).
2. Usuario sube imagen → POST /api/upload-offer-image → Storage devuelve URL → se asigna a image_url / image_urls.
3. Submit → POST /api/offers con body JSON → API valida auth, rate limit, bans, campos → insert en `offers` → RPC increment_offers_submitted_count → respuesta { id, ok }.
4. Modal se cierra; cooldown 60 s.

## Database usage

- **offers:** insert con title, price, original_price, store, category, status, created_by, expires_at (opcional), image_url, image_urls, offer_url, description, steps, conditions, coupons, moderator_comment, msi_months.
- **profiles:** RPC increment_offers_submitted_count actualiza contador (si existe).
- **user_bans:** select para bloquear usuarios baneados.

## Edge cases

- **Sin sesión:** Botón Subir puede abrir modal de registro o redirigir; el POST /api/offers devuelve 401 si no hay token.
- **Rate limit:** 429 si se envían demasiadas ofertas en poco tiempo.
- **Usuario baneado:** 403 y mensaje claro.
- **Reputación ≥ 3:** status = approved y expires_at = now + 7 días; si no, status = pending.
- **Categoría:** El form envía valores macro (tecnologia, moda…); el feed filtra por valores BD (electronics, fashion…). Ofertas con category macro pueden no coincidir en filtros hasta mapeo en backend.
- **/subir sin params:** Redirige a /?upload=1; el modal se abre vacío.
