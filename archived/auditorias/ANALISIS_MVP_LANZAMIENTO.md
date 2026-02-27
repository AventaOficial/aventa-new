# Análisis MVP — AVENTA

## Resumen

Documento de análisis para el lanzamiento mínimo viable. Qué está conectado, qué falta, qué está mal y qué contexto adicional se necesita.

---

## 1. Cambios aplicados en esta sesión

### OfferModal — scroll
- **Problema:** Dos scrolls (página + modal).
- **Solución:** Al abrir el modal se aplica `position: fixed` al body, se guarda `scrollY` y se restaura al cerrar. Solo el contenido del modal hace scroll.

### ChatBubble — visibilidad
- **Problema:** El FAB de Luna seguía visible con el modal abierto.
- **Solución:** El FAB no se renderiza cuando `isOfferOpen`. El panel de Luna (z-1100) se muestra encima del modal cuando el usuario pulsa "Preguntar a Luna sobre esta oferta".

### admin/health — build
- **Problema:** `Property 'finally' does not exist on type 'PromiseLike<void>'`.
- **Solución:** Refactor a `async/await` con `try/finally`.

---

## 2. Estado del OfferModal

### Conectado
- Votos (API `/api/votes`)
- Comentarios (API `/api/offers/[offerId]/comments`)
- Eventos de vista (API `/api/events`)
- Track outbound (API `/api/track-outbound`)
- Favoritos (Supabase `offer_favorites` vía OfferCard, no persistido en modal)
- Botón Luna (`openLuna` desde UIProvider)

### Mock / no conectado
- **Reseñas:** `mockReviews` estático. No hay tabla `reviews` ni API.
- **Autor "hace 2h":** Tiempo fijo, no usa `created_at` de la oferta.
- **Favoritos en modal:** `isLiked` es estado local; no se sincroniza con `offer_favorites` al abrir.

### Pendiente de revisar
- Sincronizar `isLiked` del modal con `favoriteMap` (igual que en OfferCard).
- Pasar `created_at` al modal para mostrar tiempo real del autor.

---

## 3. Tablas Supabase (según migraciones)

| Tabla/Vista | Uso |
|-------------|-----|
| `profiles` | display_name, avatar_url, onboarding_completed |
| `offers` | Ofertas (title, price, original_price, store, offer_url, image_url, status, expires_at, ranking_momentum, etc.) |
| `offer_votes` | Votos (offer_id, user_id, value) |
| `offer_favorites` | Favoritos (offer_id, user_id) |
| `offer_comments` | Comentarios |
| `offer_events` | Views, outbound |
| `offer_images` | Bucket para imágenes |
| `daily_system_metrics` | Métricas diarias (admin) |
| `ofertas_ranked_general` | Vista con ranking, scores, profiles |

**Contexto que ayudaría:** Esquema actual de `offers` (columnas), si existe tabla `reviews`, y si `public_profiles_view` expone `display_name` o `username`.

---

## 4. APIs y rutas

| Ruta | Estado |
|------|--------|
| `/api/votes` | Conectado |
| `/api/offers/[offerId]/comments` | Conectado |
| `/api/events` | Conectado |
| `/api/track-view` | Conectado |
| `/api/track-outbound` | Conectado |
| `/api/upload-offer-image` | Existe |
| `/api/admin/moderate-offer` | Existe |
| `/api/admin/refresh-metrics` | Existe |
| `/api/reputation/increment-offers` | Existe |
| `/api/reputation/increment-approved` | Existe |

---

## 5. Feed "Para ti"

- **Estado:** Misma query que "Recientes" (`order by created_at`).
- **Falta:** Lógica de personalización (favoritos, historial, categorías).
- **Para MVP:** Se puede lanzar como "Recientes para usuarios logueados" y mejorar después.

---

## 6. Luna (ChatBubble)

- **Estado:** Mock. Respuestas aleatorias, sin backend.
- **Para MVP:** Aceptable como "en desarrollo". El botón dentro del modal ya está.

---

## 7. Checklist mínimo para lanzar

### Crítico
- [x] Scroll del modal corregido
- [x] ChatBubble oculto cuando modal abierto
- [x] Build sin errores (admin/health)
- [ ] Favoritos del modal sincronizados con `offer_favorites`
- [ ] Verificar que las ofertas se cargan correctamente desde Supabase

### Importante
- [ ] Revisar RLS de `ofertas_ranked_general` y `public_profiles_view`
- [ ] Variables de entorno: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Moderación: flujo de aprobación de ofertas

### Opcional para MVP
- [ ] Feed "Para ti" con personalización real
- [ ] Reseñas conectadas a BD
- [ ] Luna con backend

---

## 8. Contexto Supabase (recibido)

### 8.1 Esquema `public.offers`
- `id`, `title`, `price`, `original_price`, `image_url`, `store`, `offer_url`, `description`
- `status` (default 'published') — **nota:** la app filtra por `status = 'approved'`; revisar si BD usa `published` o `approved`
- `created_by` (FK → profiles.id), `created_at`, `expires_at`, `rejection_reason`
- `votes_count`, `upvotes_count`, `downvotes_count`, `outbound_24h`, `ctr_24h`, `ranking_momentum`

### 8.2 RLS sugerido
- **anon:** SELECT solo ofertas publicadas y no expiradas
- **authenticated:** SELECT + ver propias ofertas (todas las status); INSERT con `created_by = auth.uid()`; UPDATE propia o si moderador

### 8.3 Flujo ofertas
- Estados: `draft`, `pending`, `in_review`, `approved`/`published`, `rejected`
- Creación → `status = 'pending'` → moderación → `approved` o `rejected` + `rejection_reason`

### 8.4 Imágenes
- **Recomendación:** preferir bucket `offer_images`, guardar ruta relativa en `image_url`
- URLs externas: validar solo https, considerar copiar al bucket al aprobar

### 8.5 `public_profiles_view`
- `profiles` tiene `username` y `display_name`
- Vista: usar `COALESCE(display_name, username)` para mostrar
- La app usa `display_name` en profiles; confirmar que la vista expone lo correcto

---

## 9. Posibles problemas

1. **status:** App usa `status = 'approved'`; BD puede usar `published`. Unificar.
2. **Favoritos en modal:** Ya sincronizado con `favoriteMap` y `offer_favorites`.
3. **Reseñas:** Mock; puede confundir. Considerar ocultar o marcar "próximamente".
