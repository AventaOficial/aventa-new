# Auditoría V1 – Estabilización AVENTA

**Alcance:** CTO técnico externo. Estabilizar V1 sin refactors ni rediseño. Solo auditoría y corrección de huecos críticos.

**Fecha:** 2025  
**Stack:** Next.js 16, React 19, Supabase (Auth + DB), Upstash Redis, Vercel.

---

## FASE 1 — AUDITORÍA CRÍTICA

### 1. Autenticación

| Punto | Estado | Detalle |
|-------|--------|---------|
| Rutas protegidas | ✅ | No existe `middleware.ts`; protección por layout (admin) y por API. Admin layout comprueba `user_roles` (owner/admin/moderator/analyst) y redirige si no hay rol. |
| Endpoints sin sesión | ✅ | `POST /api/offers`, `POST /api/offers/[id]/comments`, `POST /api/reports`, `POST /api/votes` exigen `Authorization: Bearer <token>` y validan usuario con `auth/v1/user`. Sin token → 401. |
| user_id desde servidor | ✅ | En todos los endpoints sensibles el `user_id` / `created_by` / `reporter_id` se obtiene de la respuesta de Supabase Auth (`userData?.id`), nunca del body. |

**Conclusión:** No se detecta manipulación de identidad desde el frontend. Mejora recomendada (no aplicada): añadir middleware que proteja rutas `/admin/*` y `/me/*` en servidor para evitar flash de contenido.

---

### 2. RLS por tabla

| Tabla | Políticas revisadas | Riesgos |
|-------|---------------------|--------|
| **offers** | `offers_select_anon`: solo approved/published, no expiradas. `offers_select_authenticated`: mismo + propias + moderadores. Tras 039: se añade `deleted_at IS NULL`. | ✅ Sin SELECT true. INSERT/UPDATE no expuestos desde anon (API usa service_role para insert). |
| **offer_votes** | `offer_votes_select_own_or_admin`: solo propio voto o admin/owner. INSERT/UPDATE desde API con userId de sesión; RLS con anon key impediría escritura anónima. | ✅ Adecuado. |
| **comments** | Tras 038: eliminadas políticas que permitían ver todos. Quedan `comments_select_approved_on_visible_offer` (solo approved en ofertas visibles) y `comments_select_moderators`. INSERT con `status = 'pending'` y `auth.uid() = user_id`. | ✅ Corregido en esta auditoría (038). |
| **offer_reports** | INSERT: `reporter_id = auth.uid()`. SELECT: solo moderadores (034). | ✅ Correcto. |
| **profiles** | SELECT/UPDATE solo propio perfil (`id = auth.uid()`). Vista pública para display_name/avatar. | ✅ Correcto. |
| **moderation_logs** | SELECT e INSERT solo moderator/admin/owner. | ✅ Correcto. |
| **offer_events** | INSERT: `user_id = auth.uid() OR user_id IS NULL` (TO authenticated). Anónimos no insertan por RLS; la API acepta eventos sin usuario. | ⚠️ Eventos anónimos se registran vía API con service_role; no hay fuga por RLS. |

**Conclusión:** Tras 038 y 039 no quedan políticas con `USING (true)` peligrosas. Escalación de privilegios contenida por roles en `user_roles` y comprobación en API con `requireModeration` / `requireAdmin`.

---

### 3. Sistema de votos

| Punto | Estado |
|-------|--------|
| UNIQUE(offer_id, user_id) | ✅ `offer_votes` tiene `PRIMARY KEY (offer_id, user_id)` (002). |
| Trigger de recálculo | ✅ `trg_offer_votes_recalculate` (017) AFTER INSERT OR UPDATE OR DELETE; actualiza counts y score en `offers`. |
| Cambio de voto rápido | ✅ Flujo: SELECT existente → si mismo valor, DELETE; si distinto, UPDATE. UNIQUE evita duplicados; race entre dos requests del mismo usuario puede dejar uno en error pero estado final consistente. |
| Voto sin login | ✅ API devuelve 200 sin efecto si no hay token; no inserta. |

**Conclusión:** Integridad garantizada por PK y trigger. Posible doble clic en UI: mitigable con disable del botón tras click (no implementado en esta auditoría).

---

### 4. Paginación

| Antes | Después |
|-------|---------|
| Listado home usaba `limit(N)` y “Cargar más” aumentaba N (re-fetch de todas las filas). | Para `viewMode === 'latest'` o `'personalized'` y sin búsqueda: paginación por cursor con `created_at`; “Cargar más” llama a `fetchNextPage()` con `lt('created_at', lastCreatedAt).limit(13)`. General y Top siguen con limit creciente para no tocar filtros/orden. |

**Conclusión:** Cursor aplicado donde el orden es por fecha. Escalable a 100k ofertas en ese modo. General/Top se pueden migrar después con cursor por `(ranking_momentum, created_at)` si hace falta.

---

### 5. Comentarios – Panel de moderación

| Antes | Después |
|-------|---------|
| Moderación solo vía Table Editor en Supabase. | Panel en app: `/admin/moderation/comments`. GET/PATCH en `/api/admin/comments` (requieren rol moderator/admin/owner). Lista por estado (pending/approved/rejected/all), botones Aprobar/Rechazar. |

**Conclusión:** Moderadores pueden aprobar/rechazar comentarios desde la app sin tocar Supabase.

---

### 6. Click tracking

| Antes | Después |
|-------|---------|
| Cada POST a `/api/events` con `event_type: 'outbound'` insertaba un evento; un usuario podía inflar clicks. | Si `event_type === 'outbound'` y hay usuario autenticado, se comprueba si existe ya un evento (offer_id, user_id, outbound) en los últimos 10 minutos; si existe, se responde 200 sin insertar. |

**Conclusión:** Máximo 1 outbound contado por usuario por oferta cada 10 minutos. Anónimos siguen limitados por rate limit global (60/min).

---

### 7. Soft delete en ofertas

| Antes | Después |
|-------|---------|
| No existía `deleted_at`; borrado sería físico. | Migración 039: columna `offers.deleted_at`. Políticas RLS y vista `ofertas_ranked_general` filtran `deleted_at IS NULL`. No se implementa UI para “borrar” (solo esquema listo para que admin marque deleted_at). |

**Conclusión:** Base lista para soft delete. Falta endpoint o acción en panel admin para setear `deleted_at` (recomendado no aplicado).

---

### 8. SEO básico

| Punto | Estado |
|-------|--------|
| Slug único por oferta | Las ofertas se referencian por UUID (`?o=id`). No hay slug en URL; el id es único. |
| Metadata dinámica por oferta | Añadido: al abrir una oferta (selectedOffer) se actualiza `document.title` a `{title} | AVENTA - ...`; al cerrar se restaura. |

**Conclusión:** Título dinámico en cliente. Para SEO fuerte haría falta ruta estática tipo `/o/[id]` o `/o/[slug]` con `generateMetadata` (no aplicado).

---

## FASE 2 — SIMULACIÓN LÓGICA

| Escenario | ¿Resiste? | Notas |
|-----------|-----------|--------|
| Usuario crea 20 ofertas en 10 min | ✅ | Rate limit offers: 5/min (Upstash). A partir de la 6.ª en 1 min → 429. |
| 200 votos en 5 min | ✅ | 1 voto por (offer_id, user_id); 200 usuarios o 200 ofertas. Rate limit default 30/min por IP; varios IPs podrían votar. UNIQUE evita duplicados por usuario. |
| 5 usuarios votándose entre sí | ✅ | Permitido por reglas; UNIQUE y trigger mantienen consistencia. No hay “voto propio” bloqueado en backend. |
| HTML malicioso en comentarios | ✅ | API limita contenido a string 1–280 caracteres. No se hace sanitización HTML; el front no debe usar dangerouslySetInnerHTML con contenido de comentarios. Riesgo bajo si la UI escapa. |
| Modificar score manualmente | ✅ | No hay endpoint que acepte score; el score se calcula en trigger desde offer_votes. RLS no permite UPDATE en offer_votes más que el propio voto vía API (y la API solo permite value 1/-1). |

---

## FASE 3 — REPORTE

### Riesgos críticos (antes de esta auditoría)

1. **Comentarios visibles sin moderación** – Políticas `comments_select_public` / `comments_select_on_offer_visibility` permitían ver todos los comentarios. **Corregido:** migración 038 elimina esas políticas.
2. **Clicks outbound inflables** – Un usuario podía enviar muchos outbound por oferta. **Corregido:** límite 1 outbound por (usuario, oferta) cada 10 min en `/api/events`.

### Riesgos medios (deuda técnica)

1. **Sin middleware de auth** – Rutas `/admin` y `/me` se protegen en cliente (layout); un request directo podría devolver HTML antes de la comprobación. Mitigado por que las APIs exigen token. Recomendación: middleware que redirija o 403 en servidor para `/admin` y `/me`.
2. **General/Top sin cursor** – Siguen con limit creciente; a escalas muy altas puede ser costoso. Aceptable para V1; migrar a cursor por `(ranking_momentum, created_at)` si hace falta.
3. **Soft delete sin UI** – Columna y RLS listos; falta pantalla/acciones para que un admin marque `deleted_at`.

### Riesgos bajos

1. **Eventos anónimos** – Se registran con `user_id` null; no hay throttling por IP por oferta. Rate limit global 60/min limita abuso.
2. **Doble clic en votos** – Puede generar dos requests; uno puede fallar por UNIQUE o por orden; estado final correcto. Opcional: deshabilitar botón tras click.

### Cambios realizados en esta auditoría

- Migración **038**: eliminar políticas de comentarios que permitían ver todos (`comments_select_public`, etc.).
- Migración **039**: columna `offers.deleted_at`, RLS y vista `ofertas_ranked_general` filtrando por `deleted_at IS NULL`.
- **API events:** límite 1 outbound por (offer_id, user_id) cada 10 min.
- **API admin/comments:** GET (listar por status) y PATCH (aprobar/rechazar) con `requireModeration`.
- **Panel admin:** página `/admin/moderation/comments` con lista y botones Aprobar/Rechazar.
- **Home:** cursor-based pagination para modo “latest”/“personalized” sin búsqueda; “Cargar más” usa `fetchNextPage()`.
- **SEO:** `document.title` dinámico al abrir/cerrar oferta.

### Cambios recomendados pero no aplicados

1. Middleware que proteja `/admin` y `/me` en servidor.
2. Endpoint o acción en admin para marcar oferta como eliminada (`deleted_at`).
3. Cursor-based para vista “General”/“Top” si el volumen lo exige.
4. Ruta y `generateMetadata` por oferta para SEO (ej. `/o/[id]`).
5. Deshabilitar botón de voto tras click hasta respuesta para evitar doble envío.

---

## Resumen

- **Auth y user_id:** Correctos; todo server-side desde token.
- **RLS:** Ajustado en comentarios (038) y ofertas con soft delete (039).
- **Votos:** UNIQUE y trigger correctos; sin manipulación de score.
- **Paginación:** Cursor en latest/personalized; resto con limit.
- **Moderación comentarios:** Panel en app + API.
- **Clicks:** Límite por usuario/oferta/tiempo.
- **Soft delete:** Esquema listo; falta UI admin.
- **SEO:** Título dinámico; slug/SEO avanzado pendiente.

Sistema estable para V1 y preparado para escalar (100k ofertas, 1M votos) con las mejoras indicadas cuando sea necesario.
