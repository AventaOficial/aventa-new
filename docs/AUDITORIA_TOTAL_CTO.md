# Auditoría total AVENTA — CTO / preparación para inversión

**Fecha:** 28 febrero 2026  
**Rol:** Auditor técnico y estratégico externo. No se asume que nada está correcto.  
**Objetivo:** Evaluar riesgos, deuda técnica, legal, escalabilidad y preparación para tráfico real.

---

## 0. WebSocket en consola (aviso del usuario)

**Síntoma:**  
`WebSocket connection to 'wss://...supabase.co/realtime/v1/websocket...' failed: WebSocket is closed before the connection is established.`

**Causa probable:**  
- El hook `useOffersRealtime` se suscribe a `postgres_changes` en la tabla `public.offers`.  
- En las migraciones solo está añadida a la publicación Realtime la tabla `offer_votes` (009), **no** `offers`.  
- Si `offers` no está en la publicación `supabase_realtime`, el canal se abre pero el servidor puede cerrarlo o no enviar eventos, generando el mensaje en consola.  
- También puede deberse a cierre rápido de pestaña, red inestable o Realtime deshabilitado en el proyecto Supabase.

**Recomendación:**  
1. En Supabase Dashboard → Database → Replication → añadir la tabla `public.offers` a la publicación `supabase_realtime` si se quieren actualizaciones en vivo del ranking.  
2. O bien no usar Realtime para ofertas: eliminar/condicionar `useOffersRealtime` y usar solo polling o refetch al volver a la pestaña (se evita el error de consola y se reduce dependencia de Realtime).

---

## 1. Arquitectura general

| Aspecto | Estado | Detalle |
|--------|--------|---------|
| Stack | Next.js 16, React 19, Supabase (Auth + DB), Upstash Redis, Vercel | Coherente para V1. |
| Auth | Solo Google OAuth; sesión en cookies (SSR); PKCE. | Un solo proveedor; bien acotado. |
| API | Rutas bajo `app/api/`; cliente servidor con `SUPABASE_SERVICE_ROLE_KEY`; rutas sensibles validan JWT y roles. | Service role solo en servidor; no expuesto al cliente. |
| RLS | Habilitado en ofertas, votos, comentarios, reportes, perfiles, roles, logs, eventos. APIs con service_role no están limitadas por RLS; la autorización es en código. | Diseño correcto: RLS protege uso directo con anon/authenticated; las APIs aplican su propia lógica. |
| Rate limit | Upstash por IP: default 30/min, offers 5/min, comments 20/min, events 60/min, reports 10/min. | Si Redis no está configurado, `getRatelimit` devuelve `null` y **no se aplica límite** (comportamiento silencioso). |

**Riesgo:** En producción sin Upstash configurado, no hay rate limiting efectivo.

---

## 2. Supabase: tablas, RLS, triggers, vistas, índices

### 2.1 Tablas principales

- **profiles:** id (FK auth.users), username, avatar_url, created_at, display_name, onboarding_completed, offers_submitted_count, offers_approved_count, offers_rejected_count, display_name_updated_at. Trigger `handle_new_user` crea fila al INSERT en auth.users (041).
- **offers:** id, title, price, original_price, image_url, image_urls, msi_months, store, offer_url, description, steps, conditions, coupons, status, created_by, created_at, expires_at, deleted_at (039), upvotes_count, downvotes_count, ranking_momentum, risk_score, etc. FK created_by → profiles(id).
- **offer_votes:** (offer_id, user_id) PK, value 1|-1. Trigger recalcula métricas en offers.
- **comments:** offer_id, user_id, content, status (pending|approved|rejected). Solo se muestran approved; moderación vía admin.
- **offer_events:** offer_id, user_id (nullable), event_type (view|outbound|share).
- **offer_reports, moderation_logs, user_roles:** presentes y usados.

### 2.2 RLS (resumen)

- **offers:** anon ve solo approved/published no expiradas y `deleted_at IS NULL` (039). Authenticated ve además propias y moderadores. No hay política INSERT/UPDATE para anon/authenticated; la API usa service_role.
- **offer_votes:** solo propio voto o admin/owner (034).
- **comments:** público solo comentarios approved en ofertas visibles; moderadores ven todos y pueden UPDATE (036, 038).
- **offer_events:** INSERT solo authenticated con user_id = auth.uid() o user_id IS NULL; la API usa service_role y bypasea RLS.
- **offer_reports:** INSERT reporter_id = auth.uid(); SELECT solo moderadores.
- **profiles:** SELECT con política pública (008) para display_name/avatar; políticas propias para SELECT/UPDATE por id = auth.uid().
- **user_roles:** SELECT solo el propio user_id.

No se detectan políticas con `USING (true)` que expongan datos sensibles de forma indebida.

### 2.3 Triggers

- `on_auth_user_created` → `handle_new_user()`: INSERT en profiles (id, display_name, avatar_url). Migración 041 alineada con esquema sin updated_at.
- `trg_offer_votes_recalculate`: tras INSERT/UPDATE/DELETE en offer_votes llama a `recalculate_offer_metrics` (actualiza upvotes_count, downvotes_count, ranking_momentum en offers).

### 2.4 Vistas

- **ofertas_ranked_general:** ofertas con score, score_final, ranking_momentum; filtra `deleted_at IS NULL` (039). Usada en home para listados.
- **public_profiles_view:** id, display_name, avatar_url para joins públicos.

### 2.5 Índices

Índices en offers (status, created_at, created_by, ranking_momentum, deleted_at), offer_votes, comments, offer_events, moderation_logs. Adecuados para consultas actuales.

### 2.6 Observaciones

- **offer_quality_checks:** existe en Supabase según docs; no aparece en migraciones ni en código. Deuda: decidir uso o eliminación.
- **Vista 034:** índice `idx_offers_ranking_momentum` usa `updated_at`; si en algún momento se eliminó updated_at de offers, el índice podría fallar o quedar obsoleto (en 002 offers sí tiene updated_at).

---

## 3. Endpoints API

| Endpoint | Auth | Riesgo |
|----------|------|--------|
| POST /api/offers | Bearer; user desde auth/v1/user | OK. created_by desde servidor. |
| POST /api/votes | Bearer opcional; 200 sin efecto si no token | OK. user_id desde servidor. |
| POST /api/events, track-view, track-outbound | Bearer opcional; rate limit | OK. Outbound limitado 1/(user,offer,10min). |
| POST /api/offers/[id]/comments | Bearer obligatorio | OK. user_id desde servidor; content 1–280 chars. |
| GET /api/offers/[id]/comments | Sin auth | Solo status=approved; service_role. OK. |
| POST /api/reports | Bearer obligatorio | OK. reporter_id desde servidor. |
| POST /api/sync-profile | Bearer obligatorio | OK. Crea/actualiza perfil por id de usuario. |
| POST /api/upload-offer-image | Bearer obligatorio | OK. Validación tipo/tamaño en servidor. |
| GET /api/profile/[username] | Ninguno | **Crítico:** ver sección 4 (exposición de datos). |
| POST /api/admin/moderate-offer | requireModeration | OK. |
| POST /api/reputation/increment-approved, increment-rejected | requireModeration | OK. Solo moderación puede llamar. |
| GET/PATCH /api/admin/comments | requireModeration | OK. |
| GET /api/admin/reports | requireModeration | OK. |
| POST /api/admin/refresh-metrics | requireMetrics | OK. |

---

## 4. Seguridad

### 4.1 Identidad

- user_id / created_by / reporter_id se obtienen siempre de Supabase Auth (getUser(token) o auth/v1/user), nunca del body. No hay manipulación de identidad desde el cliente.

### 4.2 Protección de rutas

- **/admin:** layout cliente: comprueba user + user_roles (owner, admin, moderator, analyst) y redirige o muestra “Acceso restringido”. **No hay middleware en servidor:** una petición directa a `/admin` o `/me` puede devolver HTML y luego el cliente redirige. Contenido sensible (listas de pendientes, etc.) se carga por API con Bearer; sin token las API devuelven 401/403. Riesgo medio: flash de layout o mensaje antes de redirección.
- **/me:** mismo esquema; protección en cliente.

### 4.3 Exposición de datos (crítico)

- **GET /api/profile/[username]:**  
  - Usa service_role.  
  - Hace `supabase.from('profiles').select('id, display_name, avatar_url')` **sin filtro**, es decir, carga **todos los perfiles** de la base de datos.  
  - Luego filtra en memoria por `slugFromDisplayName(display_name) === username`.  
  - Consecuencias: (1) con muchos usuarios, la consulta es O(n) y puede ser lenta o agotar memoria; (2) la respuesta del endpoint no expone todos los perfiles al cliente, pero el servidor sí tiene acceso a todos; (3) si hubiera un error o un log que incluyera la respuesta, se podrían filtrar datos.  
  - **Recomendación:** Resolver el perfil por username/slug en la base (por ejemplo columna `username` o índice sobre expresión slug(display_name)) y hacer un SELECT con `.eq(...).maybeSingle()`, sin traer todos los perfiles.

### 4.4 Almacenamiento

- Bucket `offer-images` público; no hay políticas RLS sobre objetos en el código de migraciones. La subida es solo vía API con auth y validación de tipo/tamaño. Quien tenga la URL puede ver la imagen (esperado para imágenes de ofertas públicas). Asegurar en Supabase que el bucket no permita listado público si no se desea.

### 4.5 Variables de entorno

- .env.example documenta: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN.  
- Service role no debe estar en cliente. En el código actual solo se usa en servidor (createServerClient). Correcto.

---

## 5. Sistema de votos

- UNIQUE(offer_id, user_id) en offer_votes; trigger actualiza upvotes_count, downvotes_count, ranking_momentum en offers.  
- API: SELECT existente → si mismo valor, DELETE; si distinto, UPDATE. Sin token devuelve 200 sin efecto.  
- Riesgo de doble clic: dos POST pueden llegar; uno puede fallar por UNIQUE o por orden; estado final consistente. Mejora: deshabilitar botón hasta respuesta.  
- No hay comprobación “voto propio” (usuario no puede votar su oferta); si se desea, debe añadirse en API.

---

## 6. Ranking

- Fórmula en `recalculate_offer_metrics`: score + outbound_24h*0.3 + componente CTR.  
- Vista `ofertas_ranked_general` ordena por ranking_momentum; home usa esta vista con filtros de tiempo y status.  
- Score no es escribible por API; solo se calcula en trigger. Correcto.

---

## 7. Moderación

- Aprobar/rechazar oferta: POST /api/admin/moderate-offer (requireModeration); actualiza status, opcionalmente expires_at y rejection_reason; escribe en moderation_logs.  
- Reputación: el front llama a increment-approved o increment-rejected con el createdBy de la oferta; APIs protegidas por requireModeration.  
- Comentarios: GET/PATCH /api/admin/comments con requireModeration; PATCH actualiza status a approved/rejected.  
- Sin UI para marcar ofertas como eliminadas (soft delete): no hay endpoint ni botón para setear `deleted_at`. Esquema listo; falta flujo de uso.

---

## 8. Comentarios

- INSERT con status por defecto 'pending'; solo se muestran approved en GET público.  
- Contenido limitado a 1–280 caracteres en API. No hay sanitización HTML en backend; el front no debe renderizar contenido de comentarios con dangerouslySetInnerHTML.  
- RLS y políticas de comentarios (036, 038) coherentes con moderación.

---

## 9. Eventos y analítica

- offer_events: view, outbound, share. Inserción vía API con service_role.  
- Outbound: máximo 1 por (offer_id, user_id) cada 10 minutos (evita inflar clicks).  
- View: sin deduplicación por usuario/ventana; un usuario puede inflar vistas llamando muchas veces a track-view. Rate limit global (30/min por IP con default) mitiga pero no elimina.  
- Eventos anónimos (user_id null) permitidos; rate limit global 60/min para events.

---

## 10. Paginación

- Home: en modos “latest” y “personalized” sin búsqueda se usa cursor por created_at y “Cargar más” (fetchNextPage).  
- Con búsqueda o modos General/Top se usa limit creciente (re-fetch de más filas). Escalable a 100k en modo cursor; General/Top pueden ser costosos a muy gran escala.

---

## 11. Performance

- Consultas a ofertas pasan por vista `ofertas_ranked_general` con filtros; índices adecuados.  
- GET /api/profile/[username] es el punto más débil: carga todos los perfiles.  
- Realtime: varios componentes (home, me, me/favorites, u/[username]) usan useOffersRealtime; cada uno puede abrir canal. Valorar una suscripción compartida o desactivar si no se usa.

---

## 12. SEO

- document.title dinámico al abrir/cerrar oferta en el modal.  
- No hay ruta estática por oferta (ej. /o/[id] o /o/[slug]) ni generateMetadata por oferta; el contenido de la oferta no está en el HTML inicial para crawlers. Para SEO fuerte, añadir ruta y metadata.

---

## 13. Roles y permisos

- user_roles: owner, admin, moderator, analyst. Comprobación en requireAdmin/requireModeration/requireMetrics con JWT y consulta a user_roles (service_role).  
- Admin layout restringe por rol (moderación vs métricas vs health). Coherente con APIs.

---

## 14. Soft delete

- Columna offers.deleted_at y políticas RLS que excluyen deleted_at IS NOT NULL; vista ofertas_ranked_general filtra.  
- No hay endpoint ni UI para que un admin marque una oferta como eliminada. Deuda funcional.

---

## 15. Legal

- Existen `/privacy` y `/terms` con contenido (fecha 27 feb 2026), aviso de carácter informativo y referencia a aventaofertas.com.  
- No se ha revisado exhaustivamente el texto legal; para inversión o cumplimiento estricto conviene revisión por abogado.  
- Cookies y datos personales mencionados en privacidad; alinear con uso real (Supabase, Google, Upstash, Vercel).

---

## 16. Dependencias externas

- Supabase: Auth, DB, Storage, Realtime. Crítico.  
- Upstash Redis: rate limiting. Si no está configurado, no hay límite (fallo silencioso).  
- Vercel: hosting.  
- Google OAuth: único proveedor de identidad.

---

## 17. Variables de entorno

- Requeridas en producción: NEXT_PUBLIC_SUPABASE_*, SUPABASE_SERVICE_ROLE_KEY.  
- Opcionales pero recomendadas: UPSTASH_* (sin ellas, sin rate limit).  
- No hay validación al arranque que compruebe presencia de Upstash; solo se comprueba en cada enforceRateLimit.

---

## 18. Riesgos de escalabilidad

- GET /api/profile/[username] que carga todos los perfiles: no escala.  
- General/Top con limit creciente: puede ser costoso con muchas ofertas.  
- Múltiples canales Realtime por página: más conexiones y mensajes de lo necesario.  
- Rate limit por IP: muchos usuarios detrás de un mismo NAT comparten límite.

---

## 19. Riesgos de colusión

- 5 usuarios votándose entre sí: permitido por reglas; UNIQUE y trigger mantienen consistencia. No hay detección de “círculos de votos”.  
- Reputación (offers_approved_count, etc.) se actualiza por acciones de moderación; no hay validación cruzada contra ofertas realmente aprobadas/rechazadas en DB (confianza en que el front solo llama al aprobar/rechazar).

---

## 20. Riesgos de inflado de tráfico

- Views: sin deduplicación por usuario/tiempo; inflado posible hasta el rate limit (30/min por IP).  
- Outbound: limitado a 1/(user, offer, 10 min). Correcto.  
- Ofertas: 5/min por IP. Adecuado.

---

## 21. Riesgos de exposición de datos

- Crítico: ver apartado 4.3 (GET /api/profile/[username] y carga de todos los perfiles).  
- Políticas RLS y APIs no exponen datos ajenos más allá de lo previsto (perfiles públicos display_name/avatar, ofertas aprobadas/publicadas, comentarios aprobados).

---

## 22. Simulaciones de escenarios

| Escenario | Resultado |
|-----------|-----------|
| 1000 usuarios nuevos en 1 h | Auth y trigger en profiles; sin rate limit en signup. Supabase y Google soportan; posible cuello en DB si hay muchas escrituras simultáneas. |
| 200 votos en 5 min | 200 pares (offer_id, user_id) distintos; UNIQUE y trigger correctos. Rate limit 30/min por IP; 200 IPs o 200 ofertas repartidas. Sostenible. |
| 5 usuarios votándose entre sí | Permitido; ranking refleja votos; no hay anti-game específico. |
| Modificar score manualmente | No hay endpoint que acepte score; solo trigger desde offer_votes. Correcto. |
| Saltar RLS | Cliente usa anon key; RLS aplica. APIs usan service_role y validan en código (Bearer + roles). No se puede “saltar” RLS desde cliente para escrituras sensibles. |
| Inserción HTML maliciosa en comentarios | API limita a string 1–280 caracteres. Sin sanitización HTML; si el front no usa dangerouslySetInnerHTML con contenido de comentarios, riesgo bajo. |
| Explotación de eventos | View inflable hasta rate limit. Outbound limitado por usuario/oferta/10min. Share sin límite específico; rate limit global. |

---

## 23. Entrega consolidada

### Riesgos críticos

1. **GET /api/profile/[username]:** Carga todos los perfiles de la tabla y filtra en memoria. No escala y aumenta superficie de exposición. Corregir con búsqueda por slug/username en DB (columna o expresión indexada) y un solo SELECT con filtro.
2. **Rate limit sin Upstash:** Si UPSTASH_* no están configuradas, no hay rate limiting; abuso posible en ofertas, votos, eventos, reportes, comentarios.

### Riesgos medios

1. **Sin middleware de auth:** Rutas /admin y /me protegidas solo en cliente; flash de contenido o layout antes de redirección. Añadir middleware que redirija o devuelva 403 en servidor para /admin y /me.
2. **Views (track-view) sin deduplicación:** Un usuario puede inflar vistas hasta el rate limit por IP. Valorar ventana por (user_id, offer_id) similar a outbound.
3. **Soft delete sin UI:** No hay forma en la app de marcar una oferta como eliminada (deleted_at). Añadir endpoint y/o acción en panel admin.
4. **Realtime / WebSocket:** Tabla `offers` no está en publicación Realtime en migraciones; mensaje de consola y posible cierre de conexión. Añadir `offers` a la publicación o dejar de usar useOffersRealtime y usar polling/refetch.
5. **General/Top sin cursor:** Con mucho volumen, limit creciente puede ser costoso. Planificar cursor por (ranking_momentum, created_at) si se escala.

### Riesgos bajos

1. **Doble clic en votos:** Estado final correcto; posible doble request. Deshabilitar botón hasta respuesta.
2. **offer_quality_checks:** Tabla en Supabase sin uso en código; deuda de decisión (usar o eliminar).
3. **Eventos anónimos:** user_id null permitido; rate limit global mitiga.
4. **SEO por oferta:** Sin ruta estática ni generateMetadata por oferta; solo título dinámico en cliente.

### Deuda técnica

- GET /api/profile/[username]: diseño que no escala y debe reemplazarse por consulta indexada.
- Rate limit: cuando Upstash no está configurado, no hay fallback (ni log de aviso).
- Realtime: tabla offers no en publicación; hook usado en varias páginas.
- offer_quality_checks sin uso.
- Índice ranking_momentum que referencia updated_at (comprobar si offers sigue teniendo esa columna).

### Elementos legales

- Páginas /privacy y /terms presentes y con contenido. Revisión legal recomendada para inversión o cumplimiento estricto. Comprobar que cookies y terceros (Supabase, Google, Vercel, Upstash) estén descritos correctamente.

### Qué falta antes de escalar

1. Corregir GET /api/profile/[username] (no cargar todos los perfiles).  
2. Garantizar rate limiting en producción (Upstash o alternativa y/o validación al arranque).  
3. Middleware para /admin y /me.  
4. Definir y, si aplica, implementar soft delete (UI/endpoint).  
5. Revisar Realtime (publicación o retirar uso) para evitar errores y carga innecesaria.  
6. Opcional: deduplicación de views; cursor en General/Top; ruta y metadata por oferta para SEO.

### Qué rompería el sistema

- Caída o cuota de Supabase (Auth, DB, Storage, Realtime).  
- Cambio o revocación de Google OAuth (dominio, consent screen, credenciales).  
- Pérdida o rotación de SUPABASE_SERVICE_ROLE_KEY sin actualizar en Vercel.  
- Migraciones no aplicadas o aplicadas en distinto orden en producción respecto al esquema que asume el código (p. ej. deleted_at, políticas 039, trigger 041).  
- Si se activa Realtime para ofertas sin tener la tabla en la publicación, o al revés, suscripciones que nunca reciben datos o conexiones que se cierran.

### ¿Listo para tráfico real?

- **Sí con condiciones:** Para un lanzamiento controlado o beta con tráfico moderado, el sistema es usable: auth, perfiles, ofertas, votos, comentarios, moderación y reportes están operativos y protegidos.  
- **Antes de escalar o inversión:** Es necesario corregir el endpoint de perfil por username, asegurar rate limiting efectivo y, recomendable, middleware para /admin y /me. Resolver Realtime y soft delete reduce ruido y deuda. Con eso, el sistema queda en mejor posición para tráfico alto y due diligence técnica.

---

*Documento generado en el marco de una auditoría total del proyecto AVENTA (aventaofertas.com).*
