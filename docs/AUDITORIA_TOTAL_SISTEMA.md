# Auditoría total del sistema AVENTA

Documento interno para entender el producto de punta a punta. Generado a partir del análisis del código del repositorio.

---

## 1. Visión general del proyecto

### Qué es este producto según el código

**AVENTA** es una **comunidad de cazadores de ofertas**: una plataforma donde los usuarios comparten ofertas (descuentos, promociones) que encuentran, las votan y comentan. El producto se define explícitamente en `app/layout.tsx` como:

- *"AVENTA - Comunidad de cazadores de ofertas"*
- *"Las mejores ofertas que la comunidad encuentra. Ofertas nuevas cada día. No vendemos nada — somos cazadores de ofertas."*

No es un marketplace ni una tienda: **no vende productos**. Es un agregador social de ofertas enlazadas a tiendas externas (Mercado Libre, Amazon, etc.), con posibilidad de enlaces de afiliados para líderes (badge + `ml_tracking_tag`).

### Qué problema intenta resolver

- **Para usuarios:** Encontrar ofertas reales y útiles, filtradas y rankeadas por la comunidad, sin ruido comercial.
- **Para la comunidad:** Dar visibilidad a quienes aportan buenas ofertas (reputación, badges, “Cazado por X”) y moderar contenido para mantener calidad.
- **Para el negocio:** Crecer con contenido generado por usuarios y, opcionalmente, atribución/afiliados vía líderes (cazador_estrella, cazador_aventa).

### Tipo de plataforma

- **Comunidad UGC** (contenido generado por usuarios).
- **Sistema de votación** (like/dislike) que determina ranking y visibilidad.
- **Moderación humana** (pendientes → aprobadas/rechazadas).
- **Elementos de afiliados:** perfiles con `leader_badge` y `ml_tracking_tag` para enlaces con atribución (ej. Mercado Libre).

### Flujo principal del usuario

1. **Anónimo:** Ve el feed (Día a día, Top, Recientes), busca, filtra por tienda/categoría, abre ofertas y puede ver comentarios. Para votar, guardar favoritos o subir ofertas debe registrarse.
2. **Registro/login:** OAuth (Google) o email/contraseña; se sincroniza perfil en `profiles` vía `/api/sync-profile`.
3. **Onboarding (opcional):** Elección de categorías/marcas para personalización; se guarda en `profiles.preferred_categories` y marca `onboarding_completed`.
4. **Consumir:** Feed (Día a día / Top / Para ti / Recientes), búsqueda, filtros, clic en oferta → detalle (`/oferta/[id]`), votar, favoritos, compartir.
5. **Contribuir:** Subir oferta (modal desde home o `/subir` con params para extensión); si nivel de reputación ≥ 3, se auto-aprueba; si no, pasa a cola de moderación.
6. **Perfil:** `/me` (mis ofertas, favoritos), `/u/[username]` (perfil público), `/settings` (nombre, avatar, categorías preferidas, notificaciones).
7. **Admin/Moderador:** Si tiene rol (owner, admin, moderator, analyst), accede a `/admin/*`: moderación, reportes, baneos, usuarios, logs, métricas, equipo, avisos.

---

## 2. Arquitectura del sistema

### Stack tecnológico completo

| Capa | Tecnología |
|------|------------|
| Frontend | Next.js 16, React 19, TypeScript |
| Estilos | Tailwind CSS 4, Framer Motion |
| Backend | Next.js App Router (API Routes en `app/api/`) |
| Base de datos | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email/password + OAuth Google) |
| Almacenamiento | Supabase Storage (bucket `offer-images`) |
| Rate limiting | Upstash Redis + `@upstash/ratelimit` |
| Despliegue | Compatible Vercel (NEXT_PUBLIC_APP_URL, VERCEL_URL) |

### Estructura del proyecto

```
aventa-new/
├── app/                    # Next.js App Router
│   ├── api/                # API Routes (backend)
│   ├── admin/              # Panel admin (moderación, usuarios, métricas, etc.)
│   ├── auth/               # Callback OAuth, reset password
│   ├── me/, u/[username]/  # Perfil propio y público
│   ├── oferta/[id]/        # Detalle de oferta
│   ├── categoria/[slug]/   # Feed por categoría
│   ├── tienda/[slug]/      # Feed por tienda
│   ├── communities/        # Listado y detalle de comunidades
│   ├── subir/              # Redirección a home con modal de subida
│   ├── settings/           # Configuración de cuenta
│   ├── providers.tsx       # Auth, UI, Theme
│   ├── layout.tsx          # Root layout, metadata, footer
│   └── page.tsx            # Home (feed principal)
├── lib/                    # Lógica compartida y servidor
│   ├── supabase/           # Cliente y servidor Supabase
│   ├── server/             # requireAdmin, rateLimit, reputation, validateUuid
│   ├── admin/              # roles.ts (permisos admin)
│   ├── offers/             # batchUserData (votos/favoritos por usuario)
│   ├── hooks/              # useOffersRealtime
│   ├── categories.ts       # Categorías macro y mapeo BD
│   ├── reputation.ts       # Niveles y labels de reputación (UI)
│   ├── shareText.ts, slug.ts, formatPrice.ts, offerUrl.ts, searchGroups.ts, sitemap.ts
│   └── email/              # templates (digest)
├── middleware.ts           # Rutas protegidas, redirect ?o=id → /oferta/id
├── docs/                   # Documentación y migraciones SQL
│   └── supabase-migrations/
└── browser-extension/      # Extensión para compartir ofertas (manifest, popup, content, background)
```

### Carpetas principales y su propósito

| Carpeta | Propósito |
|---------|-----------|
| `app/` | Páginas, layouts y API routes. Todo el front y la API en un solo árbol. |
| `app/api/` | Endpoints REST: ofertas, votos, comentarios, reportes, notificaciones, admin, cron, feed “Para ti”, etc. |
| `app/components/` | Componentes reutilizables: Navbar, Hero, OfferCard, ActionBar (modal subir), OfferModal, ReputationBar, Onboarding, ChatBubble, etc. |
| `lib/` | Lógica pura, clientes Supabase, hooks, helpers; sin JSX (salvo que se importe en app). |
| `lib/server/` | Código que debe ejecutarse en servidor: requireAdmin, rateLimit, reputation (recalculateUserReputation), validateUuid. |
| `docs/supabase-migrations/` | Scripts SQL para crear/modificar tablas, vistas, funciones y triggers en Supabase. |

### Cómo se comunican frontend, backend y base de datos

- **Frontend → Backend:** Fetch a rutas bajo `app/api/*` (por ejemplo `POST /api/offers`, `POST /api/votes`, `GET /api/feed/for-you`). El token se envía en `Authorization: Bearer <access_token>` cuando hace falta autenticación.
- **Backend → Base de datos:** Uso de `createServerClient()` desde `lib/supabase/server.ts` para llamadas desde API Routes y Server Components; RPC para funciones como `recalculate_user_reputation`, `increment_offers_submitted_count`.
- **Frontend → Base de datos (directo):** El cliente Supabase (`lib/supabase/client.ts`) se usa en el navegador para: lectura del feed (vista `ofertas_ranked_general`), favoritos, suscripción en tiempo real a cambios en `offers` (`useOffersRealtime`). RLS en Supabase restringe qué filas puede ver/modificar cada usuario.
- **Realtime:** Suscripción a `postgres_changes` en la tabla `offers` (UPDATE) para actualizar votos/ranking en el feed sin recargar.

---

## 3. Mapa de funcionalidades

Lista de funcionalidades implementadas en el código y cómo funcionan.

### Autenticación

- **Login:** Email/contraseña y OAuth Google vía Supabase Auth.
- **Registro:** Sign up con email o Google; opcional `displayName`; sync a `profiles` con `/api/sync-profile`.
- **Sesión:** Persistida por Supabase (cookies); `AuthProvider` expone `user`, `session`, `signIn`, `signUp`, `signOut`, `resetPassword`, `signInWithOAuth`.
- **Rutas protegidas:** `middleware.ts` redirige a `/` si no hay usuario en `/me`, `/settings`, `/mi-panel` y todo `/admin/*`.
- **Callback:** `app/auth/callback/route.ts` procesa el redirect de OAuth. Reset de contraseña en `app/auth/reset-password/page.tsx`.

### Subir ofertas

- **Dónde:** Modal global abierto desde la ActionBar (botón “Subir” / “+”); también entrada por `/subir?title=...&url=...&store=...` (extensión o deep link).
- **Flujo:** Formulario en `app/components/ActionBar.tsx`: título, URL, tienda, precios, categoría, descripción, pasos, condiciones, cupones, imagen(es). Opcional: parseo de URL vía `GET /api/parse-offer-url?url=...` (Amazon, Mercado Libre, etc.) para rellenar título/imagen/tienda.
- **API:** `POST /api/offers` (`app/api/offers/route.ts`). Comprueba rate limit, usuario, que no esté baneado; si `reputation_level >= 3` (REPUTATION_LEVEL_AUTO_APPROVE_OFFERS) la oferta se crea con `status: 'approved'` y `expires_at` 7 días; si no, `status: 'pending'`. Inserta en `offers`; si viene `community_id`, inserta en `community_offers`. Llama a `increment_offers_submitted_count` (RPC).
- **Imagen:** Subida opcional a Supabase Storage vía `POST /api/upload-offer-image`; se guarda URL en `image_url` / `image_urls`.

### Votar ofertas

- **Valores:** Like = `value: 2`, dislike = `value: -1` (guardado en `offer_votes`). Un like cuenta como +2 en el score bruto.
- **API:** `POST /api/votes` con `{ offerId, value: 2 | -1 }`. Si ya existe voto del usuario, se actualiza o se borra (toggle). Al dar like se notifica al creador de la oferta (`notifications` tipo `offer_like`).
- **Trigger en BD:** Tras INSERT/UPDATE/DELETE en `offer_votes`, el trigger `trg_offer_votes_recalculate` llama a `recalculate_offer_metrics`: actualiza en `offers` los campos `upvotes_count`, `downvotes_count`, `votes_count`, `ranking_momentum`. Otro trigger actualiza `reputation_weighted_score` (peso por nivel de reputación del votante).

### Comentarios

- **Dónde:** En el modal de oferta (`OfferModal`) y en la página de detalle (`OfferPageContent`). Listado y alta en `GET/POST /api/offers/[offerId]/comments`.
- **Lógica:** Comentarios con `status: 'pending' | 'approved' | 'rejected'`. Usuarios con `reputation_level >= 2` pueden tener comentarios auto-aprobados. Respuestas vía `parent_id`. Likes en comentarios (`comment_likes`); reportes en comentarios.
- **Admin:** `GET/POST /api/admin/comments` para listar y aprobar/rechazar; like en comentario en `POST .../comments/[commentId]/like`; report en `.../comments/[commentId]/report`.

### Perfiles

- **Tabla:** `profiles` (y vista pública `public_profiles_view`): display_name, avatar_url, slug, reputation_score, reputation_level, is_trusted, leader_badge, ml_tracking_tag, preferred_categories, onboarding_completed.
- **Público:** `/u/[username]` (por slug) y `GET /api/profile/[username]` para datos públicos. En ofertas se muestra “Cazado por {display_name}” con avatar y badge.
- **Propio:** `/me` lista ofertas del usuario (y estados); `/me/favorites` lista favoritos desde `offer_favorites`. `/settings` para editar nombre, avatar, categorías preferidas y preferencias de notificaciones/email.

### Sistema de reputación

- **Cálculo:** Función SQL `recalculate_user_reputation(p_user_id)`: +10 por oferta aprobada, -15 rechazada, +2 comentario aprobado, -5 rechazado, +1 like recibido en comentario. Resultado en `reputation_score`; nivel con `reputation_level_from_score` (1–4). `is_trusted = (level >= 2)`.
- **Cuándo se recalcula:** Tras aprobar/rechazar oferta en `POST /api/admin/moderate-offer` (llama a `recalculateUserReputation(createdBy)`). Las rutas `increment-approved` / `increment-rejected` usan RPCs separados que podrían ser legacy; el flujo principal de reputación es la recalculación completa.
- **UI:** `ReputationBar` en modal de oferta y en perfil; labels por nivel en `lib/reputation.ts` (Nuevo, Contribuidor, Cazador Pro, Elite).

### Gamificación (resumida; detalle en §4)

- Niveles de reputación (1–4) con etiquetas.
- Badges de líder: `cazador_estrella`, `cazador_aventa` (asignación manual en BD).
- Peso del voto según nivel (backend): nivel alto suma más al score ponderado de la oferta.
- Sin puntos visibles al usuario ni misiones/achievements en código.

### Categorías

- **Macro (UI):** Definidas en `lib/categories.ts`: tecnología, gaming, hogar, supermercado, moda, belleza, viajes, servicios, other. “Vitales” son las que aparecen en el tab “Día a día” (las 5 primeras + other según mapeo).
- **En BD:** `offers.category` y vista `ofertas_ranked_general.category` con valores como electronics, fashion, home, sports, books, other. `LEGACY_CATEGORY_MAP` y `getValidCategoryValuesForFeed` mapean macro → valores de BD para filtros.
- **Filtros:** En home (Día a día por categoría vital; Top por período; Recientes); en categoría `/categoria/[slug]` y tienda `/tienda/[slug]`.

### Enlaces de afiliados

- **Datos:** En `profiles`: `leader_badge` ('cazador_estrella' | 'cazador_aventa') y `ml_tracking_tag` (ej. 'aventa_capitanjeshua'). Asignación manual (UPDATE en BD o futura UI admin).
- **Uso:** `lib/offerUrl.ts` construye la URL de la oferta; si el autor tiene `ml_tracking_tag`, se añade el parámetro de tracking (ej. para Mercado Libre). En la UI, “Ir a la oferta” usa esa URL.
- **Badges:** Se muestran junto al nombre del autor en OfferCard, OfferModal y OfferPageContent (tooltips: “Cazador reconocido por la comunidad” / “Cazador destacado”).

### Paneles

- **Usuario:** `/me` (mis ofertas), `/me/favorites` (favoritos), `/settings`.
- **Mi panel (owner):** `/mi-panel` redirige a `/admin/owner` que a su vez redirige a `/mi-panel`; página de resumen para owner con enlaces a equipo, avisos, comunidades, privacidad.
- **Admin:** Bajo `/admin/*` con layout en `app/admin/layout.tsx`. Roles: owner, admin, moderator, analyst. Moderación (pendientes, aprobadas, rechazadas, comentarios, reportes, baneos), usuarios, logs, equipo, avisos, métricas, health. La ruta `/admin/communities` está en el menú pero no existe `app/admin/communities/page.tsx` (probable 404).

### Moderación

- **Ofertas:** Cola en `/admin/moderation` (pendientes); acciones aprobar/rechazar con motivo vía `POST /api/admin/moderate-offer`. Aprobación puede incluir mensaje del mod y `expires_at` (por defecto +7 días si no existía). Rechazo guarda `rejection_reason`; se registra en `moderation_logs` y se notifica al creador.
- **Comentarios:** Lista en `/admin/moderation/comments`; aprobar/rechazar desde API admin.
- **Reportes:** Ofertas y comentarios reportados; lista en `/admin/reports`; resolución desde panel.
- **Baneos:** Tabla `user_bans` (user_id, reason, expires_at). Usuarios baneados no pueden publicar ofertas (comprobado en `POST /api/offers`). Gestión en `/admin/moderation/bans`.

### Notificaciones y avisos

- **In-app:** Tabla `notifications` (user_id, type, title, body, link, read_at). Tipos: offer_approved, offer_rejected, offer_like, etc. La campana en Navbar lista notificaciones y marca leídas.
- **Avisos del sitio:** Tabla `announcements`; CRUD por owner en `/admin/announcements`; se muestran en la pestaña “Avisos” del dropdown de notificaciones.
- **Email:** `user_email_preferences` (email_daily_digest, email_weekly_digest). Cron `daily-digest` y `weekly-digest` en `app/api/cron/` envían resúmenes (top ofertas, top cazadores) según preferencias.

### Comunidades

- **Público:** `/communities` lista comunidades; `/communities/[slug]` muestra una comunidad y sus ofertas (vía `community_offers` + `ofertas_ranked_general`).
- **Creación de oferta en comunidad:** Al subir oferta se puede enviar `community_id`; se inserta en `community_offers`. No hay en el código flujo completo de “crear comunidad” ni página admin de comunidades (solo enlace en sidebar).

### Favoritos

- Tabla `offer_favorites` (user_id, offer_id). Añadir/quitar desde OfferCard, OfferModal y OfferPageContent; también desde API (las mutaciones se hacen con el cliente Supabase en el cliente). Usados para el feed “Para ti” (afinidad por categoría/tienda).

### Búsqueda

- En el home, el input de búsqueda filtra por título, tienda y descripción sobre `ofertas_ranked_general`. `lib/searchGroups.ts` define grupos de términos (ej. “apple” → incluir “iphone”, “mac”) para ampliar búsquedas.

### Tracking y analítica

- **Vistas:** `POST /api/track-view` registra evento tipo `view` en `offer_events` (offer_id, user_id opcional).
- **Clicks outbound:** `POST /api/track-outbound` registra `event_type: 'outbound'`. Usado para CTR 24h en métricas de oferta (recalculate_offer_metrics usa offer_events).

### Configuración global

- Tabla `app_config` (key, value jsonb). Clave usada: `show_tester_offers`. Si es true, el home añade ofertas mock “tester” al final del feed (solo relleno). Lectura pública; escritura vía API admin.

### Extensión de navegador

- Carpeta `browser-extension/`: manifest, popup, content script, background. Permite enviar a AVENTA la oferta actual (título, URL, imagen, tienda) y abrir `/subir` o home con `?upload=1&...`.

---

## 4. Sistema de gamificación

Todo lo encontrado relacionado con medallas, badges, niveles, reputación y puntos.

### Niveles de reputación

| Nombre (label) | Nivel | Rango de score | Dónde se define |
|----------------|-------|----------------|-----------------|
| Nuevo | 1 | 0–49 | `lib/reputation.ts` (REPUTATION_LEVELS) y SQL `reputation_level_from_score` |
| Contribuidor | 2 | 50–199 | Idem |
| Cazador Pro | 3 | 200–499 | Idem |
| Elite | 4 | 500+ | Idem |

- **Cómo se obtiene:** El score sube/baja con ofertas y comentarios aprobados/rechazados y likes en comentarios (ver §3). El nivel se deriva del score en la función SQL y se guarda en `profiles.reputation_level`.
- **Lógica en código:** `lib/reputation.ts` y `lib/server/reputation.ts` exportan `REPUTATION_LEVELS`, `getReputationLabel(level)`, `getReputationProgress(score, level)`. Umbrales: nivel ≥ 2 auto-aprueba comentarios; nivel ≥ 3 auto-aprueba ofertas (`REPUTATION_LEVEL_AUTO_APPROVE_OFFERS`).

### Badges (leader_badge)

| Nombre | Valor en BD | Cómo se obtiene | Dónde se usa en UI |
|--------|-------------|------------------|--------------------|
| Cazador reconocido | `cazador_estrella` | Asignación manual en `profiles.leader_badge` | OfferCard, OfferModal, OfferPageContent (tooltip “Cazador reconocido por la comunidad”) |
| Cazador destacado | `cazador_aventa` | Idem | Idem (tooltip “Cazador destacado”) |

- **Definición en BD:** `docs/supabase-migrations/profiles_leader_badge_ml_tag.sql`: columna `leader_badge` con CHECK en ('cazador_estrella', 'cazador_aventa'). La vista `public_profiles_view` debe incluirla (`public_profiles_view_leader_ml.sql`).
- No hay lógica automática que asigne badges; es manual (UPDATE o futura pantalla admin).

### Puntos (reputación)

- **Score de reputación:** Entero en `profiles.reputation_score`. Reglas: +10 oferta aprobada, -15 rechazada, +2 comentario aprobado, -5 rechazado, +1 like en comentario. Implementado en la función `recalculate_user_reputation` (migración `reputation_trust_score.sql`).
- **Peso del voto por nivel:** En backend, el voto de un usuario con mayor nivel cuenta más para el score ponderado de la oferta (`reputation_weighted_score`). Valores en `lib/server/reputation.ts`: VOTE_POINTS_BY_LEVEL (nivel 1: +2/-1, 2: +2.2/-1.1, 3: +2.5/-1.2, 4: +3/-1.5). La función SQL `recalculate_offer_reputation_weighted_score` y el trigger en `offer_votes` actualizan `offers.reputation_weighted_score`.
- No hay “puntos” mostrados al usuario como moneda; la barra de reputación muestra nivel y progreso dentro del nivel.

### Logros / misiones

- No hay tablas de achievements, misiones ni recompensas automáticas en el código analizado. La gamificación se reduce a niveles de reputación y badges manuales.

---

## 5. Modelo de datos

Resumen de tablas, columnas clave, relaciones y propósito. Las definiciones exactas están en `docs/supabase-migrations/*.sql`.

### Tablas principales

| Tabla | Propósito | Columnas clave |
|-------|-----------|-----------------|
| **offers** | Ofertas publicadas | id, title, price, original_price, image_url, image_urls, msi_months, store, category, offer_url, description, steps, conditions, coupons, status (pending/approved/rejected/published), created_by, created_at, expires_at, rejection_reason, moderator_comment, upvotes_count, downvotes_count, votes_count, ranking_momentum, reputation_weighted_score, outbound_24h, ctr_24h |
| **profiles** | Perfil extendido por usuario (auth.users) | id (FK auth.users), display_name, avatar_url, slug, reputation_score, reputation_level, is_trusted, leader_badge, ml_tracking_tag, preferred_categories, onboarding_completed |
| **offer_votes** | Voto por oferta y usuario | offer_id, user_id, value (2 = like, -1 = dislike). UNIQUE(offer_id, user_id) |
| **offer_favorites** | Favoritos de usuario | user_id, offer_id |
| **comments** | Comentarios en ofertas | id, offer_id, user_id, body, status (pending/approved/rejected), parent_id (respuestas), image_url, created_at |
| **comment_likes** | Like en comentario | comment_id, user_id. UNIQUE(comment_id, user_id) |
| **offer_reports** | Reportes de ofertas (o comentarios) | offer_id (o comment_id), reporter_id, reason, etc. |
| **user_bans** | Baneos | user_id, banned_by, reason, expires_at. UNIQUE(user_id) |
| **user_roles** | Roles admin | user_id, role (owner, admin, moderator, analyst) |
| **notifications** | Notificaciones in-app | user_id, type, title, body, link, read_at |
| **user_email_preferences** | Preferencias de email | user_id, email_daily_digest, email_weekly_digest |
| **announcements** | Avisos del sitio | id, title, body, link, created_at, etc. |
| **moderation_logs** | Log de moderación | offer_id, user_id (mod), action, previous_status, new_status, reason |
| **offer_events** | Eventos por oferta (vistas, outbound) | offer_id, user_id?, event_type, created_at |
| **app_config** | Configuración global | key, value (jsonb) |
| **user_activity** | Actividad reciente (first_seen_at, last_seen_at) | user_id, first_seen_at, last_seen_at |
| **communities** | Comunidades | id, name, slug, ... |
| **community_offers** | Ofertas asociadas a comunidad | community_id, offer_id |

### Vistas

- **ofertas_ranked_general:** Vista sobre `offers` que expone up_votes, down_votes, score (up*2 - down), score_final (score con decay temporal), ranking_momentum, reputation_weighted_score, ranking_blend (ranking_momentum + reputation_weighted_score). Incluye category. Usada en el feed y listados.
- **public_profiles_view:** Vista de perfiles públicos con display_name, avatar_url, leader_badge, ml_tracking_tag (y slug si está) para joins en ofertas y comentarios sin exponer datos sensibles.

### Relaciones resumidas

- offers.created_by → auth.users.id (y profiles).
- offer_votes (offer_id, user_id) → offers, auth.users.
- offer_favorites (offer_id, user_id) → offers, auth.users.
- comments (offer_id, user_id) → offers, auth.users; parent_id → comments.
- comment_likes → comments, auth.users.
- user_roles.user_id, user_bans.user_id, notifications.user_id → auth.users.
- moderation_logs.offer_id → offers; user_id → moderador.
- offer_events.offer_id → offers.
- community_offers → communities, offers.

### Flujo de datos relevante

- **Voto:** Insert/Update/Delete en `offer_votes` → triggers actualizan `offers` (upvotes_count, downvotes_count, ranking_momentum, reputation_weighted_score) → la vista `ofertas_ranked_general` refleja ranking_blend.
- **Moderación:** Update status en `offers` → insert en `moderation_logs` → recalculate_user_reputation(created_by) actualiza `profiles` (reputation_score, reputation_level, is_trusted).
- **Comentario:** Insert en `comments` (status según nivel) → opcional recálculo de reputación si hay moderación de comentarios.

---

## 6. Flujo completo de una oferta

Pasos y archivos implicados.

1. **Usuario publica la oferta**
   - UI: Modal en `app/components/ActionBar.tsx` (formulario de subida). Opcional: `GET /api/parse-offer-url?url=...` para rellenar datos desde URL.
   - Envío: `POST /api/offers` con body (title, store, price, offer_url, category, description, image_url, etc.).

2. **Validación y guardado**
   - `app/api/offers/route.ts`: Rate limit, auth, comprobación de user_bans. Si `profiles.reputation_level >= 3`, status = 'approved' y expires_at = now + 7 días; si no, status = 'pending'. Insert en `offers`. Si hay community_id, insert en `community_offers`. RPC `increment_offers_submitted_count(uuid)`.

3. **Aparece en el home (si está aprobada)**
   - Home lee de la vista `ofertas_ranked_general` (Supabase desde cliente en `app/page.tsx`), filtrando por status approved/published y expires_at. Orden por ranking_blend (o score_final en Top, o created_at en Recientes). “Día a día” filtra por categorías vitales y score < 90, con orden intercalado.
   - Si está pendiente, solo aparece en `/me` del creador y en la cola de moderación (`/admin/moderation`).

4. **Otros usuarios votan**
   - `POST /api/votes` con { offerId, value: 2 | -1 }. Insert/Update/Delete en `offer_votes`. Trigger `trg_offer_votes_recalculate` ejecuta `recalculate_offer_metrics(offer_id)` → actualiza upvotes_count, downvotes_count, ranking_momentum en `offers`. Trigger de reputation_weighted_score actualiza `offers.reputation_weighted_score`. Si value === 2 se inserta notificación “offer_like” al creador.

5. **Cálculo de scores y ranking**
   - **En BD:** La vista `ofertas_ranked_general` calcula score = up_votes*2 - down_votes, score_final con decay temporal (divisor por (horas desde creación + 2)^1.5), ranking_blend = ranking_momentum + reputation_weighted_score.
   - **En cliente:** useOffersRealtime se suscribe a UPDATE de `offers` y actualiza en memoria upvotes, downvotes y ranking_momentum de la oferta en la lista, reordenando por ranking_momentum.

Archivos clave por paso: ActionBar.tsx (subida), app/api/offers/route.ts (creación), app/api/votes/route.ts (votos), app/page.tsx (feed y filtros), docs/supabase-migrations/offer_votes_trigger_upvotes_value_2.sql y view_ranking_blend.sql (métricas y vista), lib/hooks/useOffersRealtime.ts (realtime).

---

## 7. Sistema de puntuación y ranking

### Cómo funciona

- **Score bruto por oferta:** `score = upvotes_count * 2 - downvotes_count` (cada like cuenta +2, cada dislike -1). Se expone en la vista como `score`.
- **Score con decay temporal (score_final):** `score / POWER(GREATEST(horas_desde_creación/3600 + 2, 2), 1.5)`. Así las ofertas nuevas no dominan solo por antigüedad; el tiempo suaviza el impacto.
- **Ranking momentum:** En la tabla `offers`, `ranking_momentum = upvotes_count*2 - downvotes_count` (mismo valor que score bruto); se actualiza en el trigger al cambiar votos.
- **Reputation-weighted score:** Suma ponderada de los votos según el nivel de reputación del votante (nivel 1: +2/-1, 2: +2.2/-1.1, 3: +2.5/-1.2, 4: +3/-1.5). Se guarda en `offers.reputation_weighted_score` y se recalcula con trigger en cada cambio de `offer_votes`.
- **Ranking blend:** `ranking_blend = ranking_momentum + reputation_weighted_score`. Es el criterio principal de ordenación en el feed (Día a día, Recientes sin orden por fecha) y en “Para ti” (después de priorizar por afinidad).
- **Top:** Orden por `score_final` (desc), filtro por período (hoy, semana, mes) con `created_at >= fechaLimite`.
- **Día a día:** Solo categorías “vitales”, score < 90 (DIA_A_DIA_SCORE_CAP), orden por score y luego intercalado (mitad alta, mitad baja) para variedad.
- **Destacada:** En la UI, ofertas con `ranking_blend >= 15` (DESTACADA_RANKING_BLEND_MIN) muestran badge “Destacada”.

### Dónde está implementado

- **SQL:** Vista `ofertas_ranked_general` (fix_ofertas_ranked_general_category.sql, view_ranking_blend.sql). Funciones `recalculate_offer_metrics`, `recalculate_offer_reputation_weighted_score` y triggers en offer_votes (offer_votes_trigger_upvotes_value_2.sql, reputation_vote_weight.sql).
- **Frontend:** app/page.tsx (filtros Día a día / Top / Recientes / Para ti, orden y límites). Constantes DIA_A_DIA_SCORE_CAP y DESTACADA_RANKING_BLEND_MIN en page.tsx y usadas en OfferCard.

---

## 8. Páginas y rutas

Todas las rutas de página (page.tsx) y su función.

| Ruta | Archivo | Qué hace |
|------|---------|----------|
| `/` | app/page.tsx | Home: feed (Día a día, Top, Para ti, Recientes), búsqueda, filtros por tienda/categoría, lista de ofertas con OfferCard, ChatBubble. Soporta ?upload=1&title=... para abrir modal de subida. |
| `/descubre` | app/descubre/page.tsx | Página estática “Descubre” con texto sobre la comunidad. |
| `/subir` | app/subir/page.tsx | Redirige a `/?upload=1` y pasa query params (title, image, url, store) para abrir el modal de subida (extensión / deep link). |
| `/oferta/[id]` | app/oferta/[id]/page.tsx + OfferPageContent.tsx | Detalle de oferta: datos, autor, votos, favorito, compartir, comentarios, reportar. |
| `/categoria/[slug]` | app/categoria/[slug]/page.tsx | Feed de ofertas filtrado por categoría (slug macro). |
| `/tienda/[slug]` | app/tienda/[slug]/page.tsx | Feed de ofertas filtrado por tienda. |
| `/communities` | app/communities/page.tsx | Listado de comunidades. |
| `/communities/[slug]` | app/communities/[slug]/page.tsx | Detalle de comunidad y ofertas asociadas. |
| `/u/[username]` | app/u/[username]/page.tsx | Perfil público por username (slug). |
| `/me` | app/me/page.tsx | Perfil propio: mis ofertas (estados pendiente/aprobada/rechazada/expirada). Protegida. |
| `/me/favorites` | app/me/favorites/page.tsx | Lista de ofertas favoritas. Protegida. |
| `/settings` | app/settings/page.tsx | Configuración: nombre, avatar, categorías preferidas, notificaciones. Protegida. |
| `/privacy` | app/privacy/page.tsx | Política de privacidad. |
| `/terms` | app/terms/page.tsx | Términos y condiciones. |
| `/auth/reset-password` | app/auth/reset-password/page.tsx | Formulario de restablecimiento de contraseña. |
| `/mi-panel` | app/mi-panel/page.tsx | Panel resumen para owner (enlaces a equipo, avisos, comunidades, etc.). Protegida. |
| `/admin/owner` | app/admin/owner/page.tsx | Redirige a /mi-panel. |
| `/admin/moderation` | app/admin/moderation/page.tsx | Moderación: ofertas pendientes, buscar, aprobar/rechazar. |
| `/admin/moderation/approved` | app/admin/moderation/approved/page.tsx | Lista de ofertas aprobadas. |
| `/admin/moderation/rejected` | app/admin/moderation/rejected/page.tsx | Lista de ofertas rechazadas. |
| `/admin/moderation/comments` | app/admin/moderation/comments/page.tsx | Moderación de comentarios. |
| `/admin/moderation/bans` | app/admin/moderation/bans/page.tsx | Gestión de baneos. |
| `/admin/reports` | app/admin/reports/page.tsx | Lista de reportes. |
| `/admin/users` | app/admin/users/page.tsx | Lista de usuarios (y roles/bans/actividad). |
| `/admin/logs` | app/admin/logs/page.tsx | Logs de moderación. |
| `/admin/team` | app/admin/team/page.tsx | Gestión de roles (solo owner). |
| `/admin/announcements` | app/admin/announcements/page.tsx | CRUD de avisos del sitio (owner). |
| `/admin/metrics` | app/admin/metrics/page.tsx | Métricas de producto (ofertas, usuarios, etc.). |
| `/admin/health` | app/admin/health/page.tsx | Health check (roles, métricas diarias). |
| `/admin/analista` | app/admin/analista/page.tsx | Panel analista (entrada a métricas/health). |
| `/admin/communities` | — | Enlace en sidebar admin pero no existe page.tsx; probable 404. |

---

## 9. Componentes importantes

| Componente | Ubicación | Propósito |
|------------|-----------|-----------|
| **ClientLayout** | app/ClientLayout.tsx | Envuelve el contenido con Navbar y ActionBar (y posiblemente otros wrappers). |
| **Navbar** | app/components/Navbar.tsx | Logo, búsqueda (en algunas vistas), usuario, notificaciones (campana con pestañas ofertas/avisos), menú usuario (perfil, favoritos, configuración, panel admin, cerrar sesión), tema. |
| **Hero** | app/components/Hero.tsx | Sección superior del home con título y búsqueda. |
| **OfferCard** | app/components/OfferCard.tsx | Card de oferta: imagen, precios, descuento, autor (avatar, nombre, badge), votos, favorito, compartir, “Cazar oferta”; estados Destacada/Tester. |
| **OfferCardSkeleton** | app/components/OfferCardSkeleton.tsx | Skeleton de carga para cards. |
| **ActionBar** | app/components/ActionBar.tsx | Barra inferior/móvil con navegación (Home, Comunidades, Favoritos, Perfil, Subir) y **modal completo de subir oferta** (formulario, parseo de URL, imágenes, categoría, precios, pasos, condiciones). |
| **OfferModal** | app/components/OfferModal.tsx | Modal de detalle de oferta (mismo contenido que página de oferta pero en overlay): imagen, datos, autor, votos, favorito, comentarios, reportar. |
| **ReputationBar** | app/components/ReputationBar.tsx | Barra de nivel de reputación con label y progreso; mensaje por nivel (ej. “Todo lo que publicas pasa por moderación…”). |
| **Onboarding / OnboardingV1** | app/components/Onboarding.tsx, OnboardingV1.tsx | Flujo de onboarding: elección de categorías/marcas, registro/login. |
| **ChatBubble** | app/components/ChatBubble.tsx | Burbuja flotante de ayuda/chat (UI; sin backend de chat real en lo revisado). |
| **DarkModeToggle / ThemeProvider** | app/components/DarkModeToggle.tsx, app/providers/ThemeProvider.tsx | Tema claro/oscuro (localStorage `aventa-theme`). |
| **AuthProvider** | app/providers/AuthProvider.tsx | Contexto de autenticación (user, session, signIn, signUp, signOut, etc.). |
| **UIProvider** | app/providers/UIProvider.tsx | Estado global de UI: modal de subida, modal de registro, toasts, guía, onboarding. |
| **ModerationOfferCard** | app/admin/components/ModerationOfferCard.tsx | Card de oferta en panel de moderación con acciones aprobar/rechazar y motivo. |

---

## 10. Sistemas automáticos

- **Triggers en BD:** Al insertar/actualizar/borrar en `offer_votes`: recálculo de upvotes_count, downvotes_count, ranking_momentum y de reputation_weighted_score en `offers`.
- **Realtime:** Suscripción a cambios en `offers` para actualizar el feed en vivo (useOffersRealtime).
- **Reputación:** Recalculada al aprobar/rechazar una oferta (moderate-offer llama a recalculateUserReputation). No hay cron que recalcule reputación de todos los usuarios.
- **Cron (digest):** Rutas `app/api/cron/daily-digest/route.ts` y `weekly-digest/route.ts` para enviar correos de resumen; deben ser invocadas por un scheduler externo (Vercel Cron o similar).
- **Ranking:** No hay job que “recalcule” ranking; el ranking es calculado en la vista SQL y en triggers sobre votos.
- **Misiones / recompensas automáticas:** No implementadas.

---

## 11. Partes incompletas o prototipos

- **Ofertas “tester”:** Array fijo MOCK_TESTER_OFFERS en app/page.tsx; solo se muestran si app_config.show_tester_offers es true. Son datos de relleno, no afectan métricas.
- **Página /admin/communities:** El layout admin tiene enlace a “Comunidades” pero no existe `app/admin/communities/page.tsx`; la ruta puede devolver 404.
- **RPCs increment_offers_approved_count / increment_offers_rejected_count:** Usados desde `/api/reputation/increment-approved` y `increment-rejected`; el flujo principal de reputación usa `recalculate_user_reputation` en moderate-offer. Posible duplicidad o legacy.
- **Placeholders de texto:** En mi-panel se menciona “sustituir placeholder” en privacidad; en layout se usan iconos “/placeholder.png” para favicon/apple; en ofertas sin imagen se usa “/placeholder.png”.
- **ChatBubble:** Interfaz presente pero sin integración con un backend de chat real en el código revisado.
- **Comunidades:** Existe listado y detalle públicos y relación community_offers al crear oferta, pero no hay flujo completo de creación/edición de comunidades ni página admin de gestión.
- **Categorías en BD vs UI:** Hay mapeo entre macro (tecnología, hogar, etc.) y valores de BD (electronics, home, other); algunos valores “vital” pueden no existir en la vista si las migraciones no están todas aplicadas (riesgo 400 si category no existe en vista).

---

## 12. Riesgos y complejidad

- **Código duplicado:** Lógica de “row a Offer” y de selección de ofertas con profiles (display_name, avatar_url, leader_badge, ml_tracking_tag) repetida en page.tsx, feed/for-you, categoria, tienda, communities. Un módulo compartido (ej. lib/offers/transform.ts) reduciría divergencias.
- **Dependencias:** Pocas; Tailwind, Framer Motion, Supabase, Upstash. Nada innecesario evidente.
- **Fragilidad:** Si la vista `ofertas_ranked_general` no tiene la columna `category` o no está alineada con el esquema esperado, las queries del feed pueden fallar con 400. La existencia de fix_ofertas_ranked_general_category.sql indica que esto ya pasó. Mantener una única fuente de verdad para la definición de la vista (y migraciones aplicadas) es crítico.
- **Mapeo de categorías:** LEGACY_CATEGORY_MAP y DB_CATEGORY_WHITELIST en lib/categories.ts deben coincidir con lo que realmente existe en la BD; si se añaden categorías en BD sin actualizar el código, filtros pueden devolver vacío o error.
- **Mantenibilidad:** ActionBar.tsx es muy grande (formulario de subida + navegación); separar el formulario de subida en un componente o página dedicada mejoraría legibilidad y tests.
- **Rate limit:** Depende de Upstash Redis; si no está configurado o falla, el comportamiento debe estar definido (degradar o rechazar).

---

## 13. Diagrama del sistema

```
                    USUARIOS (auth.users + profiles)
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    [Subir oferta]  [Votar/Favorito]  [Comentar]
         │               │               │
         ▼               ▼               ▼
      OFFERS  ←──  offer_votes   comments / comment_likes
         │         offer_favorites
         │               │
         ▼               ▼
   [Moderación]    [Triggers BD]
   status,         upvotes_count,
   expires_at      downvotes_count,
         │         ranking_momentum,
         │         reputation_weighted_score
         ▼               │
   moderation_logs       │
   notifications         ▼
         │         ofertas_ranked_general (vista)
         │               │
         │               ▼
         │         RANKING_BLEND = ranking_momentum + reputation_weighted_score
         │               │
         │               ▼
         └────────► VISIBILIDAD EN FEED
                   (Día a día / Top / Para ti / Recientes)
```

---

## 14. Resumen ejecutivo

### Qué es realmente este producto

AVENTA es una **red social de ofertas**: la comunidad publica ofertas (enlaces a tiendas), vota y comenta. El contenido se ordena por votos y reputación de los votantes; la moderación humana asegura calidad. Quienes tienen nivel alto pueden publicar sin cola; los “líderes” (badge manual) pueden enlazar con tracking de afiliado. No es tienda: es agregador con UGC y señales sociales (votos, reputación, badges).

### Qué tan completo está

- **Muy completo:** Feed, subida de ofertas, votos, favoritos, comentarios, moderación (ofertas, comentarios, reportes, baneos), perfiles, reputación y niveles, badges, notificaciones, avisos, panel admin por roles, feed “Para ti”, cron de digest por email, extensión de navegador, parseo de URLs de tiendas.
- **Parcial:** Comunidades (solo lectura y asociación oferta-comunidad; sin CRUD de comunidades ni página admin). Página /admin/communities no existe. ChatBubble sin backend.
- **Intencionalmente mock:** Ofertas tester en home (configurables por app_config).

### Qué falta para usuarios reales

- Asegurar que todas las migraciones SQL estén aplicadas en el proyecto de Supabase (sobre todo ofertas_ranked_general con category y public_profiles_view con leader_badge/ml_tracking_tag).
- Definir y documentar el cron para daily/weekly digest (Vercel Cron o similar).
- Sustituir placeholders (favicon, textos legales si hace falta).
- Opcional: UI en admin para asignar leader_badge y ml_tracking_tag; página /admin/communities si se quiere gestionar comunidades desde el panel.
- Revisar que rate limit (Upstash) esté configurado en producción.

### Partes críticas para el crecimiento

- **Calidad del feed:** Ranking (ranking_blend, score_final) y moderación; mantener la vista y los triggers bien definidos y desplegados.
- **Onboarding y retención:** Onboarding de categorías, feed “Para ti”, notificaciones y digest por email.
- **Contribución:** Flujo de subida (modal + extensión + parseo de URL) y auto-aprobación por reputación para reducir fricción.
- **Confianza y líderes:** Reputación visible, badges y enlaces con atribución para incentivar a los mejores cazadores y posible monetización por afiliados.
- **Escalabilidad operativa:** Panel de moderación, reportes y baneos; métricas y health para monitorear el producto.

---

*Documento generado por auditoría del repositorio. Fecha de referencia: marzo 2025.*
