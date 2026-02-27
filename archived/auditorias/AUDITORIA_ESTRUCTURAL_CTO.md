# Auditoría Estructural — AVENTA (Next.js + Supabase)

**Fecha:** 21 Febrero 2025  
**Objetivo:** Auditoría estructural pre-Series A. Sin refactor. Diagnóstico quirúrgico.

---

## SECTION 1: Lo que está alineado y limpio

### Arquitectura base
- **Next.js 16 App Router** con TypeScript. Stack moderno y coherente.
- **Supabase** como BaaS: auth, DB, storage, realtime. Elección adecuada para MVP.
- **Separación client/server** en cliente Supabase: `lib/supabase/client.ts` (anon, singleton) vs `lib/supabase/server.ts` (service_role). Patrón correcto.
- **API routes** para operaciones sensibles: votos, comentarios, upload, moderación. Enfoque backend-first coherente.

### Componentes reutilizables
- `OfferCard`, `OfferModal`, `OfferCardSkeleton` compartidos en 4 páginas (home, me, favorites, u/[username]).
- `ClientLayout` centraliza Navbar, ActionBar, Hero, ChatBubble, Onboarding.
- `AuthProvider`, `ThemeProvider`, `UIProvider` bien delimitados.

### Supabase / DB
- **Vistas bien diseñadas:** `ofertas_ranked_general` lee de `offers` (upvotes_count, downvotes_count, ranking_momentum). Fuente única de verdad.
- **Triggers:** `recalculate_offer_metrics` en INSERT/UPDATE/DELETE de `offer_votes`. Consistencia automática.
- **RLS** en `profiles`, `comments`, `offer_favorites`, `offer_events`. Tablas sensibles protegidas.
- **Auth:** `AuthProvider` con `onAuthStateChange` + `getSession`. Flujo estándar.

### APIs con validación correcta
- **`/api/votes`:** Bearer token → `auth/v1/user` → service_role para escribir. Correcto.
- **`/api/upload-offer-image`:** 401 si no hay token. Validación de tipo y tamaño.
- **`/api/offers/[offerId]/comments`:** Bearer + validación de usuario.
- **`/api/profile/[username]`:** Lectura pública, sin auth necesaria.

---

## SECTION 2: Lo que está desconectado

### Cliente Supabase duplicado / inconsistente
- **`app/api/track-view/route.ts`** importa `createClient` de `@supabase/supabase-js` y crea instancia ad-hoc con `persistSession: false` en lugar de usar `@/lib/supabase/client` o `server`.
- El resto del proyecto usa `@/lib/supabase/client` o `createServerClient`. Inconsistencia de patrón.

### Vistas vs uso real
- **`ofertas_scores`** y **`ofertas_scores_ranked`** existen en migraciones (010, 011) pero **no se usan** en la app.
- **Home** usa `ofertas_ranked_general` (017). **`/me`** y **`/me/favorites`** usan `offers` con `upvotes_count`/`downvotes_count`.
- **`/u/[username]`** usa `offers` vía API de perfil. Coherente con `offers`.
- No hay inconsistencia entre `ofertas_scores` y `offer_vote_totals` en el código actual: la app usa `ofertas_ranked_general` y `offers`. Las vistas `ofertas_scores*` son código muerto.

### Tipos vs schema
- **Sin tipos generados** de Supabase (`supabase gen types`). No hay `Database` ni `*.types.ts`.
- **Tipos duplicados** en cada archivo: `OfferRow`, `MappedOffer`, `Offer`, `OfferAuthor`, `PendingOffer`, etc.
- **`rowToOffer`** duplicado en `page.tsx`, `me/favorites/page.tsx`; inline en `me/page.tsx` y en la API de perfil.
- **Riesgo:** Cualquier cambio de schema en DB no se refleja en tipos; roturas silenciosas.

### Protección de rutas vs API
- **`/me`** y **`/me/favorites`**: comprueban `getUser()` en cliente y redirigen. Correcto.
- **`/admin/moderation`**: comprueba `user_roles` (admin/moderator) en cliente.
- **`/admin/metrics`**: no hay comprobación de roles ni auth.
- **`/admin/health`**: comprueba `user.email === ALLOWED_EMAIL` hardcodeado en cliente.
- **APIs admin:** `/api/admin/moderate-offer`, `/api/admin/refresh-metrics`, `/api/reputation/increment-approved` **no validan** auth ni roles en servidor.

---

## SECTION 3: Lo que es frágil

### Seguridad crítica

| Endpoint | Problema | Impacto |
|----------|----------|---------|
| `POST /api/admin/moderate-offer` | Sin auth. Cualquiera puede aprobar/rechazar ofertas. | **Crítico** |
| `POST /api/admin/refresh-metrics` | Sin auth. Cualquiera puede ejecutar REFRESH MATERIALIZED VIEW. | Alto (coste DB) |
| `POST /api/reputation/increment-approved` | Sin auth. Cualquiera puede incrementar reputación de cualquier userId. | Alto |

### Protección admin solo en cliente
- **Moderation:** La UI solo muestra botones si `user_roles` tiene admin/moderator. La API no valida. Un script puede llamar a `POST /api/admin/moderate-offer` sin sesión.
- **Health:** `ALLOWED_EMAIL = 'jafetalonsovazquez@gmail.com'` hardcodeado. Si el email cambia, hay que tocar código. Además, la comprobación es solo en cliente; la página de health no expone datos sensibles, pero la tabla `daily_system_metrics` podría tener RLS o no — no hay migración que la proteja.

### Data fetching
- **Todo en cliente:** Home, /me, /me/favorites, /u/[username] hacen fetch en `useEffect` con `createClient()`. No hay Server Components para listados.
- **Realtime:** `useOffersRealtime` se suscribe a **todos** los UPDATE en `offers`. Cada cambio en cualquier oferta dispara el callback. No hay filtro por `offer_id`. Con muchos votos, el cliente recibe muchos eventos y re-ordena la lista innecesariamente.

### Fetches por card (N+1)
- **OfferCard:** 2 fetches por card si hay sesión: `offer_votes` (user vote) y `offer_favorites` (isLiked).
- Con 12 cards en home = 24 requests extra. Con 100k usuarios = 24 × 100k requests por carga de página.

### Dependencias de useEffect
- **`page.tsx`:** `fetchOffers` está en `useCallback` con `[timeFilter, viewMode, limit]`. El efecto incluye `fetchOffers` en deps. Correcto.
- **`page.tsx`:** `console.log("Home render")`, `console.log("GENERAL RANKING DATA:", ...)` en producción. Código muerto/debug.

### Memory leaks potenciales
- **AuthProvider:** `getSession()` y `onAuthStateChange` en paralelo. Si unmount antes de que terminen, el `then` podría ejecutarse tras unmount. Riesgo bajo.
- **ChatBubble:** `setTimeout` sin cleanup en unmount. Riesgo bajo.
- **OfferModal:** fetch de comentarios sin `AbortController`. Si se cierra el modal antes de que responda, el `setState` podría ejecutarse tras unmount.

### useTheme() como “forzar re-render”
- Usado en: Hero, page.tsx, ChatBubble, ActionBar, me, u/[username], favorites. Solo DarkModeToggle y Navbar necesitan el tema.
- El resto no usa `theme`. Cualquier cambio de tema re-renderiza todos estos componentes.

---

## SECTION 4: Lo que falta

### Middleware
- **No existe `middleware.ts`.** No hay redirección centralizada por auth. Cada página protege manualmente.

### Validación de sesión en servidor
- **Rutas admin:** Ninguna API admin valida Bearer token ni roles en servidor.
- **Recomendación:** Middleware o helper que verifique `user_roles` antes de ejecutar lógica admin.

### Paginación
- **Home:** `limit(12)` fijo. No hay "cargar más" ni cursor. Con 10k ofertas, la carga inicial es manejable (12 filas), pero no hay forma de paginar sin recargar toda la lógica.

### Rate limiting
- API routes sin rate limiting. Un atacante puede disparar miles de requests a `/api/votes`, `/api/track-view`, `/api/admin/moderate-offer`.

### Tipos generados
- `supabase gen types typescript` no se ejecuta. No hay sincronización automática schema ↔ frontend.

### Error handling
- **Analytics:** `track-view`, `track-outbound`, `events` silencian errores (siempre 204). Correcto para no bloquear.
- **Cliente:** Varios `.catch(() => {})` vacíos. Errores de red no se muestran al usuario.

### RLS en tablas sensibles
- **`offers`:** No hay RLS en migraciones. Las operaciones se hacen vía API con service_role. Documentado en OFFERS_RLS_NOTE.
- **`offer_votes`:** No hay RLS. Operaciones vía API con service_role.
- **`user_roles`:** No hay migración que cree la tabla ni RLS. Se usa en moderation pero no está versionada.
- **`daily_system_metrics`:** Vista. No hay RLS explícito. Grant SELECT a anon/authenticated.

### Índices
- No se ha auditado exhaustivamente. Si `ofertas_ranked_general` se consulta con filtros (timeFilter, viewMode), los índices en `offers` (created_at, status, expires_at) son críticos.

---

## SECTION 5: Lo que debe arreglarse antes de escalar

### Crítico (antes de 100k usuarios)

1. **`POST /api/admin/moderate-offer`:** Validar Bearer token en servidor y comprobar que el usuario tenga rol admin/moderator en `user_roles`. Rechazar 403 si no.
2. **`POST /api/admin/refresh-metrics`:** Validar auth. Solo admin o service_role.
3. **`POST /api/reputation/increment-approved`:** Validar que el caller sea admin/moderator o que el request venga de la moderación (por ejemplo, con un token de admin).

### Alto (antes de 100k usuarios)

4. **`track-view`:** Usar `@/lib/supabase/client` o crear un helper server-side que use `createClient` con anon key de forma consistente.
5. **Fetches por card:** Cargar votos y favoritos por lote a nivel de página. Pasar `userVote` e `isLiked` como props a OfferCard.
6. **Realtime:** Filtrar `useOffersRealtime` por `offer_id` de ofertas visibles, o usar un canal por lista. Evitar refetch global en cada voto.
7. **Paginación:** Añadir "cargar más" o cursor en home. Evitar cargar todo sin límite.

### Medio (antes de 1M usuarios)

8. **Middleware:** Añadir `middleware.ts` para redirigir `/me`, `/me/favorites` si no hay sesión. Evitar flash de contenido.
9. **Tipos generados:** Ejecutar `supabase gen types` y centralizar tipos en `lib/types/database.ts`.
10. **Centralizar `rowToOffer` y tipos:** Crear `lib/offers.ts` con `rowToOffer`, tipos compartidos y helpers.
11. **Rate limiting:** En Vercel, usar Edge Middleware o Upstash para limitar requests por IP en APIs sensibles.

### Bajo (deuda técnica)

12. **Quitar `useTheme()`** donde no se use `theme`.
13. **Eliminar `console.log`** de producción.
14. **`user_roles`:** Crear migración si la tabla no existe en schema versionado.

---

## SECTION 6: Puntuación de riesgo técnico

| Criterio | Puntuación (1–10) | Comentario |
|----------|-------------------|------------|
| Arquitectura | 7 | Base sólida. Falta middleware y RSC. |
| Seguridad | 4 | APIs admin sin auth. Crítico. |
| Data flow | 6 | Coherente pero con N+1 y realtime amplio. |
| Mantenibilidad | 5 | Tipos duplicados, mapeos repetidos. |
| Escalabilidad | 5 | Sin paginación, realtime global, N+1. |
| Consistencia | 6 | Cliente Supabase inconsistente en track-view. |

**Riesgo técnico global: 5.5 / 10**

---

## Resumen ejecutivo

**AVENTA** tiene una base arquitectónica correcta (Next.js 16, Supabase, API routes para operaciones sensibles). Las vistas y triggers de DB están bien diseñados. El problema más grave es **seguridad**: las APIs de admin no validan auth ni roles en servidor. Cualquiera puede aprobar/rechazar ofertas, refrescar métricas e incrementar reputación.

**Antes de escalar a 100k usuarios:**
- Validar auth en todas las APIs admin.
- Reducir fetches por card (batch).
- Filtrar realtime por ofertas visibles.
- Añadir paginación.

**Antes de 1M usuarios:**
- Middleware, tipos generados, rate limiting.
- Revisar índices y rendimiento de vistas.

---

*Auditoría realizada sin refactor. Solo diagnóstico.*
