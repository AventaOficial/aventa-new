# Auditoría completa AVENTA — Producto, técnica, UX y crecimiento

**Fecha:** Marzo 2025  
**Fuente de verdad:** Documentación en `/docs` (GUIA_AVENTA, SEO_AUDIT_AND_ARCHITECTURE, AUDITORIA_PRE_LANZAMIENTO, FEEDBACK_Y_ROADMAP, SUPABASE_CONTEXTO).

---

## 1. Product inventory (inventario actual)

### Rutas

| Ruta | Tipo | Descripción | Indexable |
|------|------|-------------|-----------|
| `/` | Client | Feed: Día a día, Top, Para ti, Recientes; búsqueda; filtros tienda/categoría; período Hoy/Semana/Mes | Sí |
| `/oferta/[id]` | Server + Client | Detalle oferta: precio, votos, comentarios inline, CTA afiliado, reportar, compartir, favoritos | Sí |
| `/categoria/[slug]` | Server + Client | Listado por categoría macro (tecnologia, gaming, hogar, etc.) | Sí |
| `/tienda/[slug]` | Server + Client | Listado por tienda (slug desde nombre) | Sí |
| `/descubre` | Estático | Explicación del producto | Sí |
| `/u/[username]` | Server | Perfil público: ofertas del usuario, datos de perfil | Sí |
| `/me` | Client | Mis ofertas, acceso a favoritos/settings | No (protegido) |
| `/me/favorites` | Client | Favoritos | No |
| `/settings` | Client | Nombre, preferencias correo, reputación | No |
| `/mi-panel` | Client | Acceso rápido a mis ofertas / favoritos | No |
| `/privacy`, `/terms` | Estático | Legales | Sí |
| `/admin/*` | Client | Moderación, métricas, equipo, avisos, reports, logs, users, bans, health, owner, analista | No |
| `/communities` | Placeholder | "Próximamente" | No |
| `/auth/callback` | API | OAuth callback | No |
| `/auth/reset-password` | Página | Reset contraseña | No |

### Componentes principales

| Componente | Uso |
|------------|-----|
| **OfferCard** | Feed home, categoría, tienda, /me. Un solo CTA "Cazar oferta" (click → `/oferta/[id]`). Votos, favorito, compartir. |
| **OfferModal** | Home: al hacer click en card se navega a `/oferta/[id]`; el modal se usa cuando `selectedOffer` está fijado (p. ej. desde estado o realtime). Documentación indica que la oferta extendida es modal + página; actualmente home redirige a página y el modal sigue en el árbol si `selectedOffer` no es null. |
| **OfferPageContent** | Página oferta: detalle, votos, comentarios inline, reportar, compartir, favoritos. Sin dependencia del modal. |
| **Hero** | Búsqueda y línea de valor en home. |
| **ActionBar** | Tabs (Inicio, Comunidades, Favoritos, Perfil, Subir), modal de subir oferta (formulario completo). |
| **Navbar** | Logo, notificaciones, reputación, avatar. |
| **OnboardingV1** | Flujo de bienvenida: categorías, registro. |
| **ClientLayout** | Wrapper cliente (ActionBar, Navbar, etc.). |
| **CategoriaOfferList** / **TiendaOfferList** | Listados con OfferCard y navegación a `/oferta/[id]`. |
| **ModerationOfferCard** | Admin: vista completa oferta, acciones moderación. |

### Base de datos (Supabase)

| Área | Uso |
|------|-----|
| **offers** | Ofertas: title, price, store, category, status, expires_at, created_by, upvotes_count, downvotes_count, ranking_momentum, reputation_weighted_score, etc. |
| **ofertas_ranked_general** | Vista para feed: ranking_blend, score_final, filtros status/expires_at. |
| **offer_votes** | value 2 (up) o -1 (down); triggers recalculan counts y reputación. |
| **offer_favorites** | Favoritos por usuario. |
| **comments** | Comentarios en ofertas (status, parent_id para respuestas). |
| **comment_likes** | Likes en comentarios. |
| **offer_reports** | Reportes de ofertas (report_type, comment). |
| **profiles** | display_name, avatar_url, reputation_score, leader_badge, ml_tracking_tag, slug. |
| **user_roles** | owner, admin, moderator, analyst. |
| **user_bans** | Baneos. |
| **notifications** | In-app (offer_like, report_received, etc.). |
| **user_email_preferences** | Digest diario/semanal. |
| **offer_events** | track-view, outbound, share para métricas/CTR. |
| **app_config** | show_tester_offers, etc. |
| **moderation_logs** | Log de acciones de moderación. |

### Sistema de votos

- **Score:** up×2 − down (en BD y vista).
- **API:** `POST /api/votes` con `{ offerId, value }`. **Valores aceptados:** `2` (up) o `-1` (down). Toggle = mismo value → borrar fila.
- **OfferCard:** envía 2 o -1 correctamente.
- **OfferPageContent:** envía `1 | -1 | 0` → **inconsistencia**: la API no acepta 1 ni 0; el upvote desde la página puede fallar en silencio.

### Comentarios

- **API:** `GET/POST /api/offers/[offerId]/comments`, `POST .../comments/[commentId]/like`, `POST .../comments/[commentId]/report`.
- **UX:** En `/oferta/[id]` comentarios inline (OfferPageContent). En home, OfferModal incluye comentarios si se abre el modal.
- **Estados:** pending/approved/rejected; solo aprobados visibles.

### Perfiles de usuario

- **Público:** `/u/[username]` (slug desde display_name).
- **Datos:** ofertas del usuario, avatar, leader_badge (cazador_estrella, cazador_aventa), ml_tracking_tag para URLs afiliado.

### Envío de ofertas

- **Flujo:** ActionBar → modal "Subir oferta" (titulo, URL, precios, categoría, tienda, pasos, condiciones, cupones, imagen).
- **API:** `POST /api/offers`, `POST /api/upload-offer-image`.
- **Validación:** precios 2 decimales, imagen obligatoria, rate limit.
- **Estado:** pending → moderación (aprobado/rechazado/expirado).

### Moderación

- **Rutas:** /admin/moderation (pendientes), approved, rejected, comments, bans.
- **Acciones:** aprobar, rechazar (con motivo), marcar expirada, comentario de mod.
- **APIs:** moderate-offer, update-offer, expire-offer, admin/comments, bans, reports.
- **Ofertas de testers:** toggle en app_config (solo owner); 15 ofertas mock en home.

### Enlaces afiliados

- **buildOfferUrl(offerUrl, creatorMlTag):** añade parámetro ML si existe.
- **Track:** `POST /api/track-outbound` (event_type outbound) para CTR.
- **CTA en página oferta:** "Ver oferta en tienda" (único CTA en detalle; en card solo "Cazar oferta").

### SEO

- **Canonical:** `/oferta/[id]`, categoría, tienda en generateMetadata.
- **Redirect:** `/?o=id` → 301 `/oferta/id` (middleware).
- **Open Graph / Twitter:** título, descripción, imagen absoluta en oferta.
- **metadataBase:** NEXT_PUBLIC_APP_URL o aventaofertas.com.

### Sitemap

- **app/sitemap.ts:** un solo sitemap (estáticas + categorías + tiendas + ofertas).
- **lib/sitemap.ts:** getSitemapStatic(), getSitemapCategories(), getSitemapStores(), getSitemapOffers(limit, offset). OFFERS_PAGE_SIZE = 10_000; SITEMAP_INDEX_THRESHOLD = 50_000.
- **Ofertas:** solo primeras 10k ofertas aprobadas no expiradas; no hay sitemap index implementado aún.

### JSON-LD

- **En `/oferta/[id]/page.tsx`:** Product (name, description, image), Offer (url canonical, price, priceCurrency MXN, availability, seller), AggregateRating (ratingValue derivado de up/total, ratingCount, bestRating 5, worstRating 1).

### Categorías y tiendas

- **Categorías:** ALL_CATEGORIES (tecnologia, gaming, hogar, supermercado, moda, belleza, viajes, servicios, other). Filtro feed con getValidCategoryValuesForFeed (solo valores válidos en BD para evitar 400).
- **Tiendas:** lista desde API /api/stores; slug desde nombre (lib/slug.ts).

### Búsqueda y filtrado

- **Búsqueda:** en home, sobre título/tienda/descripción (getSearchTerms, ilike).
- **Filtros:** tienda, categoría (dropdown).
- **Vistas:** Día a día (vitales, score &lt; cap), Top (score_final, período Hoy/Semana/Mes), Para ti (API for-you por afinidad), Recientes (created_at).

### Paginación

- **Home:** "Cargar más" aumenta limit o llama fetchNextPage (solo en Recientes/Para ti con cursor por created_at).
- **Categoría/tienda:** listados con límite fijo (no infinite scroll documentado en detalle).

### Admin

- **Métricas:** comunidad (nuevos hoy, activos 24h, retención 48h, mejor hora), actividad ofertas (vistas, clics, CTR), refresh métricas.
- **Equipo:** roles, invitaciones.
- **Avisos:** announcements CRUD.
- **Reports:** listado reportes ofertas.
- **Logs:** moderation_logs (últimos 200).
- **Users:** listado usuarios, roles, baneos, última actividad.
- **Health:** comprobación básica.

---

## 2. Bug & architecture audit (riesgos técnicos)

### Inconsistencias de estado

- **Voto en página oferta vs API:** OfferPageContent envía `value: 1 | -1 | 0`; la API `/api/votes` solo acepta `2 | -1`. El upvote desde `/oferta/[id]` envía 1 y la API lo rechaza (body.value no 2 ni -1) → **bug crítico**: upvote en página no persiste.
- **VoteMap vs localVote:** En OfferPageContent, localVote se inicializa desde voteMap tras fetchBatchUserData; si la API de votos devuelve 2/-1 y el cliente mapea a 1/-1, la UI puede estar alineada pero el envío desde la página sigue roto mientras se envíe 1 en lugar de 2.
- **selectedOffer en home:** Si el usuario llega por `/` y hace click en una card, se navega a `/oferta/[id]`. selectedOffer puede quedar no null si antes se abrió modal; al volver atrás el modal podría reabrirse (depende del flujo). Duplicación lógica oferta en modal vs página.

### Modal vs página

- **Home:** Click en card → `router.push(\`/oferta/${offer.id}\`)`; no se setea selectedOffer para abrir modal. OfferModal se renderiza si `selectedOffer != null` (p. ej. si algo más lo setea o realtime). La documentación habla de "modal (descripción, pasos, condiciones), CAZAR OFERTA"; en la práctica la navegación va a página. Coexistencia modal + página puede confundir (misma oferta en dos sitios).
- **Comentarios:** Lógica duplicada en OfferModal y OfferPageContent (fetch, lista, respuestas, like, reportar comentario). No hay componente compartido.

### Hidratación

- **Server vs client:** `/oferta/[id]` es server component que pasa offer a OfferPageContent (client). El primer render del cliente usa props; comentarios y voteMap se cargan en cliente. Riesgo bajo si no se hace setState con datos del servidor que difieran del cliente en el primer paint.
- **Feed:** Todo el feed es client (page.tsx 'use client'); no hay SSR del listado, por tanto no hay mismatch servidor/cliente en el feed.

### Errores de API no manejados en UI

- **Patrón .catch(() => setOffers([]))** o similar en: page.tsx (feed, for-you, búsqueda), settings, OfferModal, admin (métricas, logs, users, etc.). El usuario ve lista vacía o estado por defecto sin mensaje de error.
- **Excepción:** En page.tsx existe feedError y mensaje "No pudimos cargar las ofertas. Revisa tu conexión" + "Reintentar" cuando feedError === 'load'.
- **Otras rutas:** Muchas llamadas a API sin toast ni mensaje en fallo (stores, app-config, notifications, etc.).

### Race conditions

- **fetchOffers + visibilitychange:** Al volver a la pestaña se llama fetchOffers(undefined); si el usuario cambia de vista o filtro muy rápido, múltiples fetches pueden terminar fuera de orden (setOffers del último podría no ser el correcto sin cancelación o timestamp).
- **Votos:** Optimistic update + una sola petición por acción; riesgo bajo si no se hace doble click rápido (no hay debounce explícito en el botón).

### Client/server mismatch

- **Votos:** API espera 2/-1; OfferPageContent envía 1/-1/0 → fallo silencioso en upvote desde página.
- **Auth:** Unas rutas usan createServerClient + getUser(token), otras fetch a auth/v1/user; funciona pero es frágil ante cambios de Supabase.

### Base de datos

- **Categorías:** getValidCategoryValuesForFeed restringe a valores que existen en la vista (electronics, fashion, home, sports, books, other); si la BD tiene solo esos, ofertas con categoria legacy (tecnologia, electrones) no aparecen en filtros que usan el mapeo actual (mapeo macro → solo esos 6).
- **Vista ofertas_ranked_general:** No materializada; con muchas filas puede ser lenta sin índices adecuados.
- **Sitemap ofertas:** getSitemapOffers() se invoca sin offset; solo entran las primeras 10k ofertas. Con >10k ofertas, el resto no están en el sitemap.

### Consultas lentas potenciales

- **Feed:** Query con .in('category', ...), .gte('created_at', ...), orden por ranking_blend; depende de índices en la vista/subyacente.
- **/api/offers/similar:** ilike sobre título sin rate limit ni índice de texto (GIN) → coste y riesgo de abuso.

### Componentes no usados o redundantes

- **OfferModal en home:** Sigue montado cuando selectedOffer != null; el flujo principal es navegar a `/oferta/[id]`. Si en ningún flujo se setea selectedOffer, el modal no se abre; si se setea en algún flujo legacy o realtime, hay duplicación con la página.
- **Onboarding / FavoriteOnboarding / GuideButton:** Uso depende de UIProvider y flujos; no eliminados pero conviene revisar si todos los paths están vivos.

---

## 3. UX & product consistency (vs documentación)

### Idioma (español)

- **Documentación:** Plataforma en español (FRASES_AVENTA, AUDITORIA).
- **Estado:** Hero, page (empty state, error, CTA), OfferModal (comentarios vacíos), OfferCard (estados Pendiente/Aprobada/Rechazada/Expirada) están en español.
- **Posibles restos:** Mensajes de API en inglés (p. ej. "Too Many Requests" en votes); labels internos o toasts deben revisarse en todos los flujos.

### CTA único "Cazar oferta"

- **Documentación:** OfferCard debe tener un solo CTA, "Cazar oferta" (no "Ver oferta" / "Ir a oferta").
- **Estado:** OfferCard tiene un solo botón "Cazar oferta" (click → onCardClick → navegación a `/oferta/[id]`). Correcto.

### Layout de la card

- **Documentación:** Una CTA por card.
- **Estado:** Una CTA; imagen, votos, precio, autor, descripción breve. Correcto.

### Renderizado de pasos

- **Documentación:** Oferta extendida muestra descripción, pasos, condiciones, cupones.
- **Estado:** En OfferPageContent y OfferModal se muestran description, steps, conditions, coupons cuando existen. Correcto.

### Comentarios

- **Documentación:** Empty state "Nadie ha comentado. ¡Sé el primero!" (AUDITORIA).
- **Estado:** OfferModal y OfferPageContent tienen copy equivalente en español. Correcto.

### Votos

- **Documentación:** Votación up/down, score up×2−down.
- **Estado:** UI correcta; **bug**: en página oferta se envía value 1 en lugar de 2 para upvote → no cumple comportamiento esperado.

### Móvil y navegación

- **DocumentBar/Navbar:** Tabs y navegación coherentes; Comunidades lleva a "Próximamente" (documentado como placeholder).
- **Responsive:** Layouts con breakpoints (max-[400px], md:, etc.); oferta y feed adaptados a móvil.

### Desviaciones

1. **Voto en `/oferta/[id]`:** La API no recibe el valor correcto (1 en vez de 2) → desviación funcional crítica.
2. **Comunidades en barra principal:** Documentación sugiere quitar o mover a footer; sigue en ActionBar como tab principal.

---

## 4. Comparación con Promodescuentos

### Componentes principales de Promodescuentos (referente)

| Área | Promodescuentos | Fuente |
|------|-----------------|--------|
| **Deal discovery** | Recomendado, Top por período (Hoy/Semana/Mes), Recientes, personalizado | FEEDBACK_Y_ROADMAP, web |
| **Community interaction** | Votación (grados), comentarios, reportes | Web, docs |
| **User reputation** | Puntos por ofertas Hot y comentarios útiles; niveles Silver/Gold/Platinum; recompensas (iconos, códigos, estadísticas) | Web (puntos y recompensas) |
| **Moderation** | Código de conducta, reportes, advertencias, suspensiones, bloqueo de votos, bans | Web (conducta) |
| **Deal ranking** | Hot a partir de ~100 votos; visibilidad y secciones populares por votación | Web |
| **Category navigation** | Navegación por categorías | Estándar |
| **Search** | Búsqueda de ofertas | Estándar |
| **Notifications** | Notificaciones in-app y probablemente email | Asumido |
| **Gamification** | Puntos, niveles, recompensas, referral codes | Web (puntos y recompensas) |

### Tabla comparativa

| Feature | Promodescuentos | AVENTA | Gap |
|---------|-----------------|--------|-----|
| **Deal discovery** | Recomendado, Top (período), Recientes, Para ti | Día a día, Top (Hoy/Semana/Mes), Para ti, Recientes | Bajo; lógica equivalente. |
| **Community voting** | Votos (grados), Hot a 100 | up×2−down, ranking_blend, score_final | Sin umbral "Hot" explícito; sin badge "Hot"/"Trending". |
| **User reputation** | Puntos, niveles Silver/Gold/Platinum, recompensas | reputation_score, leader_badge (cazador_estrella/aventa), niveles mostrados en UI | Sin programa de puntos ni recompensas tangibles; reputación más simple. |
| **Moderation** | Reportes, advertencias, suspensiones, bans | Pendiente/Aprobado/Rechazado/Expirado, reportes, bans, roles | Cubierto para beta. |
| **Deal ranking** | Hot + secciones populares | ranking_blend, score_final, decay temporal | Sin "Hot" ni "Trending" explícitos. |
| **Category navigation** | Sí | Categorías macro + filtro en feed | Cubierto. |
| **Search** | Sí | Título, tienda, descripción | Cubierto. |
| **Notifications** | In-app + email | In-app + digest diario/semanal | Falta notificación al autor por comentario (doc). |
| **Gamification** | Puntos, niveles, recompensas, referidos | Badges y reputación visual | Sin puntos canjeables ni recompensas; crítico para retención de contribuidores a medio plazo. |

### Elementos críticos para crecer como comunidad de ofertas

- **Transparencia y confianza:** Estado claro de "Mis ofertas" (Pendiente/Aprobada/Rechazada/Expirada) y feedback cuando falla la carga → ya abordado en docs y parcialmente en UI (OfferCard con dealStatus); asegurar que /me muestre estado en todas las listas.
- **Incentivos a contribuir:** En Promodescuentos, puntos y recompensas animan a subir ofertas y comentar. En AVENTA solo reputación y badges; para crecer hace falta algún tipo de gamificación o beneficio tangible (P2/P3).
- **Descubrimiento y urgencia:** "Hot" o "Trending" aumenta engagement; en AVENTA es P2 (doc).
- **Engagement en comentarios:** Notificación al autor cuando comentan en su oferta (P1 en doc).

---

## 5. Community growth loops

### Loops presentes

- **Votación:** Usuario vota → oferta sube/baja → más visibilidad → más votos. Débil si el upvote desde la página no persiste (bug de value 1 vs 2).
- **Comentarios:** Comentarios y respuestas en oferta; like a comentarios. Falta notificación al autor por comentario.
- **Reputación/estatus:** leader_badge y reputación visibles; incentivo suave para aportar.
- **Ranking:** ranking_blend y score_final ordenan ofertas; decay temporal da novedad.
- **Descubrimiento:** Día a día, Top, Para ti, Recientes; filtros por categoría y tienda.

### Loops faltantes o débiles

- **Incentivo a publicar ofertas:** No hay puntos ni recompensas; solo reputación. Loop "subo oferta → gano estatus" es débil frente a Promodescuentos.
- **Notificación por comentario:** No hay vuelta al producto cuando alguien comenta en tu oferta.
- **Hot/Trending:** No hay señal de "esta oferta está subiendo fuerte" → menos urgencia y menos loop de descubrimiento.
- **Digest por categorías:** Digest global, no por preferencias de categorías → menor relevancia y menor retorno.
- **Sincronizar categorías onboarding:** Si el usuario cierra sin registrarse, las categorías elegidas no se sincronizan al registrarse después → personalización "Para ti" más débil.

---

## 6. SEO scale check (100k+ páginas)

### Lo que está listo

- **Páginas de oferta:** Canonical, OG, JSON-LD (Product, Offer, AggregateRating); URL estable `/oferta/[id]`.
- **Categorías y tiendas:** Canonical, listados con enlaces a ofertas.
- **Enlaces internos:** Oferta → categoría, tienda, autor; categoría/tienda → ofertas e inicio.
- **Sitemap dinámico:** Estáticas, categorías, tiendas, ofertas (hasta 10k).
- **Helpers para escalar:** getSitemapOffers(limit, offset), getOffersCount(), SITEMAP_INDEX_THRESHOLD (50k).

### Limitaciones para 100k+ páginas

- **Sitemap único:** `app/sitemap.ts` devuelve un solo array; solo se incluyen las primeras 10k ofertas (getSitemapOffers() sin paginación en la invocación). Para 100k ofertas hace falta **sitemap index**: varios sitemaps de ofertas (p. ej. 10k por archivo) y un index que los referencie.
- **Crawl depth:** Con sitemap index y enlaces desde categoría/tienda a ofertas, la profundidad es aceptable; home → categorías/tiendas → ofertas.
- **Structured data:** Implementado por oferta; escala con el número de páginas.
- **Rendimiento:** Sin caché de sitemap; cada request genera todo. Con 100k URLs puede ser pesado; considerar caché o generación estática/background.

### Conclusión SEO

- **Hasta ~10k ofertas:** La arquitectura actual es suficiente.
- **Para 100k+:** Hace falta implementar sitemap index (rutas tipo `/sitemaps/offers-1.xml`, ...) y que el sitemap principal sea un index que enlace a esos + estáticos + categorías + tiendas. No hay páginas producto (`/producto/[slug]`); es opcional para escala de contenido pero no para índice de URLs.

---

## 7. Priority roadmap

### P0 — Critical bugs

1. **Voto en página oferta:** Corregir envío de valor de voto desde OfferPageContent: la API espera `2` para up y `-1` para down (y borrar para "0"). Ajustar handleVote para enviar `value: newVote === 1 ? 2 : newVote` (y no enviar 0; para "quitar voto" enviar el mismo valor que ya tiene para que la API borre, o extender API para aceptar 0 y borrar).
2. **Verificar E2E:** Registro → subir oferta → votar (en card y en página) → comentar → reportar → moderar; confirmar que no hay regresiones.

### P1 — Product improvements

3. **Estado de ofertas en /me:** Asegurar que en todas las listas de "Mis ofertas" se muestre badge/estado (Pendiente/Aprobada/Rechazada/Expirada) y, si aplica, motivo de rechazo (ya iniciado en OfferCard con dealStatus; revisar que todas las fuentes de datos pasen status y rejectionReason).
4. **Comunidades:** Quitar de la barra principal o mover a footer / menú secundario según documentación.
5. **Sincronizar categorías al primer login:** Si hay categorías en localStorage de un onboarding previo (sin registro), enviarlas a preferred-categories al primer login.
6. **Rate limit en `/api/offers/similar`:** Evitar abuso y coste.
7. **Mensajes de error en más flujos:** Toasts o mensajes cuando fallen stores, app-config, notificaciones, etc., sin sustituir por silencio.
8. **Notificación al autor por comentario:** Aumentar engagement (documentado como P1/P2).

### P2 — Growth features

9. **Hot / Trending:** Señal de ofertas que suben rápido en votos o "Terminando pronto" (expires_at cercano).
10. **Digest por categorías preferidas:** Filtrar digest por preferred_categories.
11. **Caché en cliente:** React Query o SWR para feed/home con revalidación.
12. **Unificar obtención de usuario en APIs:** Un helper para auth (getUser desde token) en lugar de mezclar createServerClient y fetch a auth/v1/user.
13. **Error boundaries por ruta:** p. ej. admin para aislar fallos.

### P3 — Long-term scaling

14. **Sitemap index:** Para >50k URLs: sitemap index + múltiples sitemaps de ofertas (p. ej. 10k por archivo).
15. **Páginas producto:** `/producto/[slug]` para agrupar ofertas por producto (requiere modelo de datos).
16. **Slug legible en ofertas:** Opcional: `/oferta/slug-oferta` con redirect desde UUID.
17. **Normalización de tienda:** Slug único para evitar colisiones (ej. Amazon vs Amazon MX).
18. **Gamificación/recompensas:** Puntos o beneficios tangibles por ofertas Hot o comentarios útiles (referencia Promodescuentos).
19. **Virtualización:** Listas muy largas en categoría/tienda si hace falta rendimiento.

---

*Auditoría generada a partir del análisis del codebase y de la documentación en `/docs`. Las prioridades P0–P3 deben alinearse con la GUIA_AVENTA y el estado actual de la beta.*
