# Sistemas de AVENTA y propuestas post-auditoría (Gemini + ChatGPT)

Documento que: (1) identifica todos los sistemas del producto, (2) resume lo que ya está alineado con las auditorías, (3) propone mejoras sin romper lo actual, y (4) aclara métricas y retención (incl. comparación con Promodescuentos).

---

## 1. Mapa de sistemas (partir la app “por partes”)

| Sistema | Qué es | Dónde vive (código / datos) | Estado |
|--------|--------|-----------------------------|--------|
| **Sistema de votos** | Like/dislike por oferta (value 2 / -1), trigger actualiza `offers.upvotes_count`/`downvotes_count`, ranking. | `offer_votes`, trigger, `/api/votes`, `batchUserData` (voteMap), OfferCard/OfferModal, home/me/u/[username] | ✅ Operativo; feedback visual y persistencia corregidos en este chat. |
| **Sistema de ofertas** | Creación, moderación (pending→approved/rejected), expiración, ranking (ofertas_ranked_general), feed. | `offers`, `ofertas_ranked_general`, `/api/offers`, `/api/admin/moderate-offer`, `/api/admin/expire-offer`, home, /me, /u/[username], descubre | ✅ Operativo. |
| **Sistema de reportes** | Usuarios reportan ofertas; mods revisan y marcan “revisado”/“descartado” o “marcar oferta como expirada”. | `offer_reports`, `/api/reports`, `/api/admin/reports`, admin/reports, expire-offer | ✅ Operativo. **Gap:** al aceptar reporte (expirar oferta) la oferta sale del feed pero en **perfil propio (/me)** y en **perfil público** el dueño no ve que está vetada/expirada (ver propuestas). |
| **Sistema económico / reputación** | Niveles y puntuación por ofertas aprobadas/rechazadas, comentarios, likes. | `profiles` (reputation_level, reputation_score), `/api/reputation/*`, ModerationOfferCard, ReputationBar | ✅ Operativo. |
| **Sistema de eventos y métricas** | Vistas, outbound (clic a tienda), shares. CTR = outbound/views. | `offer_events` (event_type: view, outbound, share), `/api/events`, `/api/track-view`, `/api/track-outbound`, admin/metrics, admin/health | ✅ Operativo. **Nota:** “Clics a tienda” = **outbound** (botón “Ir a la tienda”), **no** “Cazar oferta” (eso es voto); si en videos vieron “cazar” y no “ir a tienda”, los 0 clics son coherentes. Opción: añadir columna “Cazadas” (votos) en métricas. |
| **Sistema de notificaciones** | In-app (navbar) + correos (digest diario/semanal, confirmación, reset password). | `notifications`, `user_email_preferences`, `/api/notifications/*`, Resend, Navbar, settings | ✅ Operativo. |
| **Sistema de autenticación** | Login (Google, email), sesión, verificación correo, reset password. | Supabase Auth, AuthProvider, sync-profile, /auth, settings (restablecer contraseña) | ✅ Operativo. **Propuesta:** cambio seguro de correo (confirmar en correo antiguo y nuevo) en configuración. |
| **Sistema de configuración de usuario** | Perfil (nombre visible, avatar*), correos (digest), contraseña, PWA (instalar app). | `/settings`, `profiles`, `/api/notifications/preferences` | ✅ Operativo. **Propuesta:** reestructurar en General / Seguridad / Notificaciones; avatar si entró por email; opción “cambio seguro de correo”. |
| **Sistema de comentarios** | Comentarios y respuestas en ofertas, likes a comentarios. | `comments`, `comment_likes`, `/api/offers/[id]/comments`, OfferModal | ✅ Operativo. **Propuesta:** que el nombre del autor en comentarios sea link a perfil público `/u/[slug]`. |
| **Sistema de favoritos** | Guardar ofertas para “ver después”. | `offer_favorites`, batchUserData (favoriteMap), OfferCard/OfferModal, /me/favorites | ✅ Operativo. |
| **Sistema de guía / onboarding** | Guía rápida (Subir oferta, Votar, Guardar), onboarding post-registro. | OnboardingV1 (GUIDE_STEPS), UIProvider (showGuide, openGuideModal), Navbar “Guía”, GuideButton | ✅ Operativo. **Propuesta:** meter en la guía toda la info que el usuario necesita, poco texto y más visual. |
| **App instalable (PWA)** | Añadir a pantalla de inicio, icono, experiencia app-like. | settings (sección Instalar app), manifest, service worker si existe | ✅ Disponible (settings móvil). **Revisar:** si la app está alineada con la web o desactualizada (rutas, datos). |
| **Admin** | Equipo, moderación (ofertas/comentarios/baneos), reportes, métricas, salud. | /admin/*, requireAdmin/requireModeration, RLS/roles | ✅ Operativo. |

\* Avatar: si el usuario entra por email (no Google), puede no tener foto; hoy no hay flujo en configuración ni en perfil propio para subir/editar avatar.

---

## 2. Alineación con auditorías (Gemini + ChatGPT) sin romper nada

- **Efecto “gamer” / identidad:** No cambiar estilo; asegurar que el hero diga claro “comunidad de ofertas” (o similar). Ya acordado; solo copy si falta.
- **Cazar vs Ir directo:** No quitar “Cazar”; dar feedback fuerte al votar. Hecho en código (voto se marca al instante, se valida `ok` en API). Opcional: micro-texto “Ayudaste a validar esta oferta” o similar.
- **Patrón espectador (90% consume, 9% interactúa, 1% crea):** Aceptado. Enfoque: que creadores tengan recompensa y que espectadores **vuelvan**; no obligar a subir ofertas. Comunidad de cazadores de ofertas = encontrar mejor precio, no “todos creadores”.
- **Imagen / peso:** Ya resuelto (límite, mensaje, compresión si aplica). No tocar.
- **Navegación / back / modal mobile:** Ya mejorado. No tocar.
- **Métrica norte:** Definir una (ej. % retención 48h) y medir. No es código; es decisión y dashboard.
- **Quick wins ya hechos o propuestos:**  
  - Feedback al votar ✅  
  - Claridad en hero (copy)  
  - Guía con más contenido visual (propuesta abajo)  
  - Configuración más clara (General / Seguridad / Notificaciones) y cambio seguro de correo (propuesta abajo)

---

## 3. Propuestas concretas (orden sugerido)

### 3.1 Configuración: estructura y nuevas opciones

- **Reestructurar** la página `/settings` en secciones claras:
  - **General:** Perfil (nombre visible, **avatar**: subir/editar foto si no tiene — sobre todo para quien entró por email).
  - **Seguridad:** Contraseña (restablecer), **Cambio seguro de correo** (ver abajo).
  - **Notificaciones:** Resumen diario y semanal (lo que hoy está en “Correos”).
  - **App:** Instalar en dispositivo (mantener como está, o mover a General si prefieres).

- **Cambio seguro de correo electrónico**
  - Opción en configuración (ej. toggle): “Requerir confirmación en correo antiguo y nuevo”.
  - Si está **activado:** el usuario debe confirmar en el correo actual y en el nuevo (flujo tipo Supabase: email al actual con link “¿Cambiaste de correo?” y al nuevo con link de confirmación).
  - Si está **desactivado:** solo se requiere confirmar el correo nuevo (comportamiento típico actual).
  - Implementación: Supabase permite flujos de cambio de email; hay que exponer la preferencia en `profiles` o `user_email_preferences` y, en el flujo de cambio de email, enviar o no el paso “confirmar en correo antiguo” según esa preferencia.

### 3.2 Perfil propio (/me) y reportes

- En **perfil propio** (/me): las ofertas del usuario deben mostrar **estado** (ej. badge o texto): Pendiente, Aprobada, Rechazada, Expirada/Vetada). Hoy /me lista todas las ofertas del usuario sin filtrar por `status` ni `expires_at`, así que ofertas expiradas por reporte siguen viéndose y el usuario no sabe que están fuera del feed.
- Opciones:
  - **A:** Filtrar en /me igual que el feed (solo approved/published y no expiradas); entonces las vetadas “desaparecen” de su lista (puede confundir).
  - **B (recomendada):** Mostrar todas sus ofertas en /me y añadir un indicador claro: “Expirada (no visible en el feed)”, “Rechazada”, “Pendiente de revisión”, “Aprobada”.
- En **perfil público** (/u/[username]): ya se filtran por status y expires_at, así que las expiradas no se muestran. No cambiar.
- Al **aceptar un reporte** (marcar oferta como expirada): la oferta ya sale del feed (expires_at = ahora). Solo falta que el dueño lo vea en /me (estado “Expirada” o similar).

### 3.3 Avatar para quien entró por email

- En **Configuración → General** (o Perfil): si el usuario no tiene `avatar_url` (p. ej. registro por email), mostrar opción “Añadir foto de perfil” (subida a Supabase Storage, actualizar `profiles.avatar_url`). Misma opción en **perfil propio** (/me) si quieres que desde ahí también pueda editar foto.

### 3.4 Comentarios: nombre de usuario → perfil público

- En comentarios y respuestas del OfferModal, hacer que el **nombre del autor** (`comment.author.username`, `reply.author.username`) sea un **link** a `/u/[slug]` (slug derivado de username, ej. `slugFromUsername(comment.author.username)`). Si la API de comentarios no devuelve slug, usar el mismo criterio que en “Cazado por” (slug desde display_name/username).

### 3.5 Guía (“Guía” en el menú)

- Usar el botón/modal de **Guía** para concentrar la info que el usuario necesita: qué es AVENTA, para qué sirve “Cazar”, qué es “Ir a la tienda”, por qué votar (ayudar a otros a no caer en falsas ofertas), que no es obligatorio subir ofertas. **Poco texto, más visual** (ilustraciones, iconos, pasos cortos). Contenido actual de GUIDE_STEPS en OnboardingV1 se puede ampliar o duplicar aquí con más pasos y más visuales.

### 3.6 Métricas: “Cazar” vs “Clics a tienda”

- **Aclaración:** En admin, “Clics a tienda” = eventos **outbound** (botón “Ir a la tienda”). “Cazar oferta” = voto (tabla `offer_votes`). Si en los videos la gente daba a “Cazar” y no a “Ir a la tienda”, es normal ver 0 clics a tienda.
- **Propuesta:** En la vista de actividad de ofertas (admin/metrics), añadir una columna **“Cazadas”** (o “Votos”) = número de votos (up/down o solo up) por oferta, leyendo de `offer_votes` o de `offers.upvotes_count`/`downvotes_count`, para no depender solo del CTR de outbound.

### 3.7 App (PWA / app instalada)

- Revisar si la experiencia “app” (manifest, rutas, datos) está **alineada** con la web actual (mismas vistas, mismos endpoints). Si hay rutas o lógica antigua, documentar y planificar una pasada de alineación sin romper lo que ya funciona.

---

## 4. Retención y comparación con Promodescuentos

- **Patrón espectador:** Es ley de internet; el trabajo no es convertir a todos en creadores, sino que creadores tengan recompensa y que **espectadores vuelvan** (ChatGPT).
- **Promodescuentos:** Tiene problemas de retención similares (mucho consumo, poco creación). La diferencia que puedes explotar:
  - **Claridad de valor:** “Comunidad de cazadores de ofertas” = encontrar el mejor precio con señales sociales (votos, comentarios), sin obligar a subir.
  - **Notificaciones y ritmo:** Que el usuario reciba “algo útil” (digest, notificaciones de ofertas que le interesan) para que vuelva; el motor de notificaciones como corazón de la app (Gemini).
  - **Densidad de contenido:** “La usaría seguido si hubiera más cosas” se resuelve con más ofertas de calidad y constancia, no con rediseño (ChatGPT).
- **Métrica clave en beta:** % que vuelve en 48h (retención > actividad). Definir una acción concreta para la primera sesión (ej. votar 3 ofertas o guardar 1 favorita) y medir sin obsesionarse con que “todo sea perfecto” antes de lanzar.

---

## 5. Resumen de prioridades (sin romper lo actual)

| Prioridad | Qué | Dónde |
|----------|-----|-------|
| Alta | Reestructurar configuración (General / Seguridad / Notificaciones) | `/settings` |
| Alta | Cambio seguro de correo (opción + flujo confirmar antiguo y nuevo) | Settings → Seguridad + Supabase/auth |
| Alta | Perfil propio: mostrar estado de ofertas (Expirada, Rechazada, Pendiente, Aprobada) | `/me` + posiblemente ofertas en admin para estado |
| Media | Avatar en configuración (y/o en /me) para usuarios sin foto | Settings, /me, `profiles.avatar_url` |
| Media | Comentarios: nombre de usuario → link a `/u/[slug]` | OfferModal (comentarios y respuestas) |
| Media | Guía: más contenido visual y claro (qué es AVENTA, Cazar, Ir a tienda) | OnboardingV1 / GuideModalStandalone |
| Baja | Métricas admin: columna “Cazadas” (votos) por oferta | admin/metrics |
| Baja | Revisar PWA/app instalada vs web actual | Manifest, rutas, docs |

---

## 6. Notas técnicas rápidas

- **Feed:** `ofertas_ranked_general` + `.or('status.eq.approved,status.eq.published')` + `.or('expires_at.is.null,expires_at.gte.<now>')`. Perfil público usa lo mismo. /me hoy no filtra por status ni expires_at.
- **Expirar oferta (reportes):** `/api/admin/expire-offer` pone `expires_at = now`; el reporte se marca “reviewed” en `offer_reports`. La oferta deja de salir en feed y en perfil público; en /me sigue saliendo sin indicador de estado.
- **Eventos:** `view` (vista), `outbound` (clic a tienda), `share` (compartir). CTR = outbound / views. Los votos (“Cazar”) no son outbound.

Si quieres, el siguiente paso puede ser implementar solo la reestructura de settings (secciones) y el indicador de estado en /me, y dejar el cambio seguro de correo y el avatar para una segunda iteración.
