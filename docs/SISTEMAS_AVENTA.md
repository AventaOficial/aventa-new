# Sistemas de AVENTA — mapa actual

**Referencia:** Este mapa está basado en **archived/docs/SISTEMAS_Y_PROPUESTAS_POST_AUDITORIA.md** (auditorías Gemini + ChatGPT) y actualizado con lo añadido después. Sirve para tener la app “por partes” y saber qué tocar en cada área.

---

## 1. Mapa de sistemas (estado actual)

| Sistema | Qué es | Dónde vive | Estado |
|--------|--------|------------|--------|
| **Votos** | Like/dislike por oferta (value 2 / -1), ranking. | `offer_votes`, trigger, `/api/votes`, batchUserData (voteMap), OfferCard/OfferModal | ✅ Operativo |
| **Ofertas** | Creación, moderación, expiración, ranking, feed. | `offers`, `ofertas_ranked_general`, `/api/offers`, `/api/admin/moderate-offer`, `/api/admin/expire-offer`, home, /me, /u/[username] | ✅ Operativo |
| **Reportes** | Usuarios reportan; mods revisan / expiran oferta. | `offer_reports`, `/api/reports`, `/api/admin/reports`, admin/reports | ✅ Operativo. Pendiente: estado en /me (Expirada, Rechazada, etc.). |
| **Reputación** | Niveles y puntuación (ofertas, comentarios, likes). | `profiles` (reputation_level, reputation_score), ReputationBar | ✅ Operativo |
| **Eventos y métricas** | Vistas, outbound (clic a tienda), shares. CTR = outbound/views. | `offer_events`, `/api/events`, `/api/track-view`, `/api/track-outbound`, admin/metrics, **`/api/admin/offer-activity`** (service role para contar bien clics) | ✅ Operativo |
| **Notificaciones** | In-app (campana) + correos (digest, confirmación, reset). **Bolita morada** cuando hay no leídas. | `notifications`, `user_email_preferences`, `/api/notifications`, Navbar (bell + dot), settings | ✅ Operativo |
| **Auth** | Login Google (y email), sesión, reset password. | Supabase Auth, AuthProvider, /auth, settings | ✅ Operativo |
| **Configuración usuario** | Perfil (nombre, avatar), correos (digest), contraseña, PWA. | `/settings`, `profiles`, `/api/notifications/preferences` | ✅ Operativo |
| **Comentarios** | Comentarios y respuestas en ofertas, likes. | `comments`, `comment_likes`, `/api/offers/[id]/comments`, OfferModal | ✅ Operativo |
| **Favoritos** | Guardar ofertas; alimentan **Para ti**. | `offer_favorites`, batchUserData (favoriteMap), OfferCard/OfferModal, /me/favorites | ✅ Operativo |
| **Feed “Para ti”** | Ofertas priorizadas por afinidad (favoritos + votos: misma categoría o tienda). | **`/api/feed/for-you`**, home (tab Para ti) | ✅ Operativo |
| **Guía / onboarding** | Guía rápida (Subir, Votar, Guardar), onboarding post-registro. | OnboardingV1, UIProvider, Navbar “Guía” | ✅ Operativo |
| **PWA** | Añadir a pantalla de inicio. | settings (Instalar app), manifest | ✅ Disponible |
| **Configuración global** | Key/value (ej. show_tester_offers). Ofertas de testers en home cuando el owner activa el toggle. | `app_config`, `/api/app-config`, `/api/admin/app-config`, admin/moderation (toggle), home (MOCK_TESTER_OFFERS con imágenes placeholder) | ✅ Operativo |
| **Admin** | Equipo, moderación, reportes, métricas, salud, **Logs** (moderation_logs), **Usuarios** (listado con roles, baneos). | /admin/*, requireAdmin/requireModeration/requireUsersLogs, **`/api/admin/logs`**, **`/api/admin/users`** | ✅ Operativo |

---

## 2. Notificaciones: qué revisar en código

- **Listado y no leídas:** `GET /api/notifications` devuelve `notifications` y `unreadCount` (count donde `read_at` es null). Navbar hace fetch con auth y actualiza cada 60 s.
- **Bolita morada:** Cuando `unreadCount > 0`, en Navbar se muestra un `span` con clase `bg-violet-600` (bolita) encima del icono de campana. No hay número en el botón; el detalle se ve al abrir el panel.
- **Marcar como leídas:** `PATCH /api/notifications` con body `{ id?: string }` (si no id, marca todas). El panel de notificaciones agrupa por oferta y permite “Marcar como leídas” por grupo.
- **Creación de notificaciones:** Se insertan desde `moderate-offer` (aprobada/rechazada), `expire-offer` (oferta expirada), `reports` (reporte recibido), `votes` (notifyOfferOwnerLike). Revisar que en cada flujo el `user_id` sea el destinatario correcto y que el tipo/título/body/link tengan sentido.

Para comprobar que “hay pendientes”: tener al menos una fila en `notifications` con `read_at = null` para tu usuario; la bolita debe verse en la campana y al abrir el panel deben listarse.

---

## 3. Propuestas y detalle

Las **propuestas concretas** (configuración por secciones, cambio seguro de correo, estado en /me, avatar, comentarios con link a perfil, guía más visual, columna “Cazadas” en métricas, PWA) están en **archived/docs/SISTEMAS_Y_PROPUESTAS_POST_AUDITORIA.md**. Este doc es el mapa actual; el archivado es la referencia de mejoras sin romper lo actual.
