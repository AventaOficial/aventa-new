# Informe: auditoría completa, cambios recientes y estado – AVENTA

**Proyecto:** AVENTA – comunidad de cazadores de ofertas  
**Stack:** Next.js 16, React 19, Supabase (Auth + DB), Upstash Redis, Tailwind, Framer Motion  
**Repo:** GitHub AventaOficial/aventa-new | **Producción:** Vercel, dominio aventaofertas.com  

---

## 1. Contexto del proyecto

- **Qué es:** Web donde usuarios registrados (solo Google OAuth) pueden publicar ofertas, votar, comentar, marcar favoritos; moderadores aprueban/rechazan ofertas; métricas y reportes en panel admin.
- **Auth:** Supabase Auth con Google; sesión en cookies vía `@supabase/ssr`; PKCE; callback en `/auth/callback` (Route Handler).
- **API:** Rutas bajo `app/api/` usan `SUPABASE_SERVICE_ROLE_KEY`; las que requieren usuario validan JWT con `Authorization: Bearer` y `getUser(token)` o helpers `requireAdmin`/`requireModeration`.
- **RLS:** Habilitado en tablas sensibles; políticas en migraciones (001, 034, etc.). Las API con service_role no están limitadas por RLS; la seguridad se hace en código (Bearer + roles en `user_roles`).
- **Docs de referencia:** `docs/VERIFICACION_VERCEL.md`, `docs/VERIFICACION_GOOGLE.md`, `docs/UPSTASH_RATE_LIMITING.md`, `docs/OAUTH_GOOGLE_APPLE.md`, `docs/DEBUG_OAUTH_PROMPTS.md`, `docs/AUDITORIA_OAUTH_SISTEMA.md`, `docs/AUDITORIA_SUPABASE_RESUMEN.md`; en raíz: `ANALISIS_AUDITORIA_Y_ESTADO.md`, `AUDITORIA_SESION_ACTUAL.md`.

---

## 2. Análisis de todas las auditorías hechas

### 2.1 ANALISIS_AUDITORIA_Y_ESTADO.md

- **Enfoque:** Coherencia esquema Supabase con código, tablas en uso, elementos incompletos.
- **Conclusiones:** Ofertas, votos, favoritos, comentarios, eventos, moderación, reportes y reputación (RPCs) están conectados. Migración 029 (reputación) y 030 (steps/conditions/coupons) aplicadas en repo. `offer_quality_checks` existe en Supabase pero no en migraciones ni en código; `offer_reports` tiene tabla y RLS, UI en admin/reports sí usa reportes (no “próximamente” en código actual). Posible redundancia `value`/`vote` en `offer_votes`.
- **Prioridades que marcaba:** Alta = migración reputación (ya existe 029); Media = reportes UI (ya conectada); rechazar oferta llamando a `increment_offers_rejected_count` (ya se llama desde admin/moderation).

### 2.2 AUDITORIA_SESION_ACTUAL.md

- **Enfoque:** Cambios de una sesión concreta (steps/conditions/coupons, OfferCard/OfferModal, migraciones 029 y 030).
- **Conclusiones:** Información adicional guardada y mostrada; reportes y reputación conectados; pendiente revisar `offer_quality_checks` y trigger en `offer_events` para métricas en tiempo real.

### 2.3 docs/AUDITORIA_SUPABASE_RESUMEN.md

- **Enfoque:** Auditoría RLS y seguridad; migración 034.
- **Conclusiones:** Problemas de RLS (offer_votes, offer_events, comments, offer_reports, moderation_logs, offers) corregidos en 034. Índices añadidos. Funciones SECURITY DEFINER revocadas para anon/authenticated en 033. Comprobaciones post-034 listadas en ese doc.

### 2.4 docs/AUDITORIA_OAUTH_SISTEMA.md

- **Enfoque:** Post-OAuth funcionando; checklist código (cliente singleton, PKCE, logout, onboarding, RLS, callback, cookies) y comprobaciones manuales Supabase/Google/Vercel.
- **Conclusiones:** Código alineado; mejora sugerida = limpiar `?error=...` de la URL en home tras mostrar toast (ya implementada en código actual, pendiente de commit).

### 2.5 Checklists VERIFICACION_VERCEL, VERIFICACION_GOOGLE, UPSTASH

- **Vercel:** Dominio, SSL, env vars (NEXT_PUBLIC_SUPABASE_*, SUPABASE_SERVICE_ROLE_KEY, UPSTASH_*), build, PWA manifest, meta.
- **Google:** OAuth consent screen, URIs, verificación dominio (Search Console), política de privacidad/términos en footer.
- **Upstash:** Rate limit por IP en offers, votes, events, reports, comments, upload; credenciales solo servidor; doc en `docs/UPSTASH_RATE_LIMITING.md`.

---

## 3. Cambios realizados en los últimos 3 días (por commits)

Los siguientes commits son los más recientes en `master` (orden del más nuevo al más antiguo):

| Commit     | Descripción breve |
|-----------|--------------------|
| `154fec6` | fix(auth): forzar flowType pkce en cliente para que Supabase envíe code en redirect |
| `4310803` | fix: build OAuth (quitar page callback, tipos, UIProvider order) + docs DEBUG_OAUTH_PROMPTS |
| `e55f6f4` | fix(auth): OAuth Google – server cookies, callback dynamic, errores en home y docs |
| `63e9a47` | OAuth Google: callback GET en servidor, cliente SSR cookies, onboarding post-login |
| `4f3bbbc` | Google: footer con privacy/terms, bots ven home pública, doc verificación |
| `32ea1a2` | Legal: páginas privacy/terms y ajustes OAuth Google |
| `aabca1b` | Vercel/UX: onboarding sin flash, Hero móvil, solo Google, PWA, limpieza admin/API, docs |
| `b0a7a25` | Ajustes móvil, onboarding sin flash, login Google y Apple, doc OAuth |
| `0646507` | Preparar despliegue Vercel |

**Resumen de cambios de código/producto:**

- **OAuth Google:** Redirect a `/auth/callback`, Route Handler con `createServerAuthClient` y cookies, `flowType: 'pkce'`, eliminación de `app/auth/callback/page.tsx` (conflicto con route), toast de error en home y limpieza de URL (params `error`/`message`).
- **Build:** Tipos en callback (getAll async, set/delete sin devolver ResponseCookies, delete sin segundo arg), reorden de `clearOverlayState`/`finalizeOnboarding` en UIProvider para evitar “used before declaration”.
- **Docs:** DEBUG_OAUTH_PROMPTS, PROMPT_OAUTH_PROBLEMA_COMPLETO, OAUTH_GOOGLE_APPLE actualizado, verificación Google/Vercel.
- **Legal/UX:** Footer con privacy/terms, home pública para bots, PWA (manifest, iconos, InstallAppBanner), onboarding sin flash (layoutReady).

---

## 4. Avance por prioridad (según auditorías)

| Prioridad | Tema                         | Estado |
|-----------|------------------------------|--------|
| Alta      | OAuth Google funcionando     | Hecho: callback, PKCE, cookies, Client Secret corregido en Supabase. |
| Alta      | RLS y endurecimiento (034)   | Hecho en migraciones; aplicar 034 en Supabase si no está aplicada. |
| Alta      | Reputación (columnas + RPCs)  | Hecho: migración 029; llamadas desde offers, increment-approved, increment-rejected. |
| Media     | Reportes (offer_reports)     | Hecho: tabla, RLS, API y UI en admin/reports. |
| Media     | Rechazar oferta → reputación | Hecho: admin/moderation llama a increment-rejected. |
| Media     | Errores OAuth y limpieza URL | Hecho en código (toast + router.replace); pendiente commit (ver §7). |
| Baja      | offer_quality_checks         | Sin uso en código ni migración; decidir uso o eliminación en Supabase. |
| Baja      | value/vote en offer_votes    | Documentado como posible redundancia; no bloquea lanzamiento. |

---

## 5. Estado actual del proyecto / ¿Algo roto?

- **Build:** Debería pasar (`npm run build`); no hay `page.tsx` en `/auth/callback` (solo route).
- **OAuth:** Flujo verificado (Google → Supabase → /auth/callback → sesión en cookies); si algo falla, comprobar Redirect URLs y Client Secret en Supabase/Google.
- **Pendiente en disco (sin commit):**  
  - `app/page.tsx` modificado: limpieza de `?error=...` con `router.replace(pathname, { scroll: false })` y uso de `useRouter`.  
  - Archivos sin seguimiento: `docs/AUDITORIA_OAUTH_SISTEMA.md`, `docs/PROMPT_OAUTH_PROBLEMA_COMPLETO.md`.  
  No hay nada “roto” por estos cambios; son mejoras y documentación.
- **Supabase:** Asegurar que las migraciones hasta 034 (y 029, 030, 033) estén aplicadas en el proyecto de producción. Si 034 no está aplicada, seguir `docs/AUDITORIA_SUPABASE_RESUMEN.md`.

---

## 6. Cómo comprobar que se guarda todo correctamente

- **Auth/sesión:** Iniciar sesión con Google → refrescar → comprobar que sigues logueado; en DevTools → Application → Cookies, que existan `sb-access-token` y `sb-refresh-token` (nombres pueden llevar prefijo del proyecto).
- **Ofertas:** Crear oferta desde la app → en Supabase Table Editor `offers` debe aparecer la fila; en `profiles` el contador `offers_submitted_count` debe incrementarse (si 029 aplicada y se llama al RPC).
- **Votos:** Votar en una oferta → en `offer_votes` debe aparecer la fila; en `offers` los campos de conteo (upvotes_count/downvotes_count o equivalentes) deben actualizarse (trigger).
- **Favoritos:** Añadir a favoritos → en `offer_favorites` debe aparecer la fila.
- **Comentarios:** Escribir comentario en una oferta → en `comments` debe aparecer la fila.
- **Eventos:** Abrir oferta (view), clic en enlace (outbound), compartir → en `offer_events` deben aparecer filas (tipos view/outbound/share).
- **Moderación:** Aprobar/rechazar en admin → en `offers` el `status` debe cambiar; en `moderation_logs` debe haber insert; contadores de reputación en `profiles` (approved/rejected) deben actualizarse si se llaman los RPCs.
- **Reportes:** Crear reporte desde la app → en `offer_reports` debe aparecer la fila; en admin/reports debe listarse.
- **Perfil:** Actualizar display_name/avatar en /settings → en `profiles` deben verse los cambios; onboarding completado → `onboarding_completed = true`.

Si algo no se guarda: revisar en Supabase Logs (API/Postgres) errores al insertar/actualizar; revisar RLS (políticas que bloqueen al role que usa la API); y en el código que la ruta correspondiente esté llamando a Supabase y manejando errores.

---

## 7. Alineación con git (commit / push)

**Estado actual:**

- **Rama:** `master`, “up to date with origin/master” para los commits ya subidos.
- **Sin commit:**  
  - `app/page.tsx` (cambios: toast OAuth + limpieza URL con `router.replace` y `useRouter`).  
- **Sin seguimiento:**  
  - `docs/AUDITORIA_OAUTH_SISTEMA.md`  
  - `docs/PROMPT_OAUTH_PROBLEMA_COMPLETO.md`  
  - `docs/INFORME_AUDITORIA_COMPLETA_Y_ESTADO.md` (este archivo)

**Recomendación:** Hacer commit de los cambios y documentos y luego push para dejar todo alineado:

```bash
git add app/page.tsx docs/AUDITORIA_OAUTH_SISTEMA.md docs/PROMPT_OAUTH_PROBLEMA_COMPLETO.md docs/INFORME_AUDITORIA_COMPLETA_Y_ESTADO.md
git commit -m "docs: auditoría OAuth/sistema, prompt OAuth completo; fix: limpiar URL tras error OAuth en home"
git push
```

---

## 8. Checklist unificada pre-lanzamiento

Usar esta lista para cerrar todo antes de lanzamiento.

### Código y build

- [ ] `npm run build` pasa sin errores.
- [ ] Cliente Supabase browser: singleton, `flowType: 'pkce'`.
- [ ] Callback OAuth: solo Route Handler en `/auth/callback`, sin page en la misma ruta.
- [ ] Rutas privadas (/admin, /me, /settings) protegen por sesión/rol en layout o página.
- [ ] APIs que requieren usuario usan Bearer + `getUser` o requireAdmin/requireModeration.
- [ ] No se hace log del anon key ni del service_role key.

### Supabase

- [ ] Migraciones aplicadas hasta 034 (incluidas 029, 030, 033).
- [ ] RLS habilitado en: profiles, offers, offer_votes, comments, offer_events, offer_reports, moderation_logs.
- [ ] Trigger `on_auth_user_created` crea fila en `profiles`.
- [ ] Authentication → URL Configuration: Site URL y Redirect URLs correctos (`https://aventaofertas.com/auth/callback`).
- [ ] Google provider activo; Client ID/Secret correctos (y Client Secret actual si se regeneró).
- [ ] Logs sin errores 500 recurrentes.

### Google Cloud

- [ ] OAuth consent screen: nombre, privacidad, términos, dominio.
- [ ] Authorized redirect URIs: solo el callback de Supabase (`https://<proyecto>.supabase.co/auth/v1/callback`).
- [ ] Dominio verificado (Search Console) si lo pide la verificación de la app.

### Vercel

- [ ] Variables de entorno Production: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN.
- [ ] Dominio aventaofertas.com con SSL.
- [ ] Último deploy en verde.

### Upstash

- [ ] Variables UPSTASH_* en Vercel Production; no expuestas en cliente.

### Comprobación rápida de datos

- [ ] Login con Google y persistencia de sesión al refrescar.
- [ ] Crear oferta → aparece en Supabase y en feed (tras aprobar si aplica).
- [ ] Votar / favoritos / comentarios / reportes → se ven en Supabase y en la UI.
- [ ] Moderación aprobar/rechazar → status y moderation_logs correctos.

---

## 9. Tablas creadas (migraciones) – uso y seguridad

Todas las tablas listadas están definidas en migraciones del repo (salvo que se indique “solo en Supabase”).

| Tabla / recurso | Migración(es) | ¿Se usa en código? | Qué hace | Seguridad / notas |
|-----------------|---------------|--------------------|----------|--------------------|
| **profiles** | 001, 002_onboarding, 026 trust_score, 029 reputación, 031 display_name | Sí | Perfiles de usuario (display_name, avatar, onboarding_completed, reputación). Creado por trigger al insert en auth.users. | RLS: SELECT/UPDATE solo propio perfil. Trigger SECURITY DEFINER. |
| **offers** | 002, 004 fkey, 015 ranking, 023 risk, 030 steps/conditions/coupons | Sí | Ofertas (título, precio, estado, creador, métricas, steps, conditions, coupons). | RLS (034): anon ve approved/published no expiradas; authenticated ve propias + visibles + admin. |
| **offer_votes** | 002, 019 value, 020 vote alias | Sí | Votos por oferta y usuario (value 1/-1). | RLS (034): solo propio voto o admin/owner. Trigger actualiza conteos en offers. |
| **comments** | 003 | Sí | Comentarios por oferta y usuario. | RLS (034): SELECT solo comentarios de ofertas visibles (approved/published, no expiradas). |
| **offer_events** | 005, 012 RLS, 027 share | Sí | Eventos view/outbound/share por oferta. | RLS (034): INSERT solo authenticated (APIs usan service_role). |
| **daily_system_metrics** | 006 | Sí (admin/health) | Métricas diarias del sistema. | Uso solo en panel admin. |
| **offer_favorites** | 007 | Sí | Favoritos por usuario y oferta. | RLS según migraciones. |
| **user_roles** | 022 | Sí | Roles (owner, admin, moderator, analyst) por user_id. | Usado en requireAdmin/requireModeration; no exponer a anon. |
| **moderation_logs** | 024 | Sí | Log al aprobar/rechazar ofertas. | RLS (034): SELECT/INSERT solo moderator/admin/owner. |
| **offer_reports** | 025 | Sí | Reportes de ofertas por usuarios. | RLS (034): SELECT solo moderator/admin/owner; INSERT con reporter_id = auth.uid(). |
| **offer_images (bucket)** | 018 | Sí (upload, publicUrl) | Storage para imágenes de ofertas. | Políticas del bucket según 018. |
| **ofertas_ranked_general** | Vista (010, 011, 030) | Sí (page ofertas) | Vista de ofertas con scores/ranking para feed. | Vista sobre offers con políticas RLS subyacentes. |
| **offer_performance_metrics** | 013, 014 materialized, 028 shares | Sí (admin/metrics) | Métricas de rendimiento por oferta. | Solo lectura en admin. |
| **offer_quality_checks** | No en repo | No | (Si existe en Supabase) Calidad de ofertas. | Decidir uso o eliminación; no hay migración ni uso en código. |

Vistas/helpers: `008_public_profiles_view`, `010_ofertas_scores_view`, `011_ofertas_scores_ranked`, etc., usadas por la app o por otras vistas. RPCs: `increment_offers_submitted_count`, `increment_offers_approved_count`, `increment_offers_rejected_count` (029); ejecución revocada para anon/authenticated en 033; solo las API con service_role las llaman.

---

## 10. Prompt para auditoría Supabase (copiar y pegar)

Usa este bloque para pedir a una IA o a un revisor una auditoría de Supabase orientada a lanzamiento:

---

**Contexto:** Proyecto AVENTA (aventaofertas.com), app Next.js 16 con Supabase (Auth + Postgres + Storage). Dominio en producción: https://aventaofertas.com. Auth solo con Google OAuth; sesión en cookies; APIs con service_role validan JWT Bearer y roles en tabla `user_roles`.

**Objetivo:** Auditoría completa de Supabase para un lanzamiento en producción: esquema, uso de tablas, RLS, seguridad, Auth y buenas prácticas.

**Tablas principales (todas con RLS en producción):**

- **profiles** – Perfiles de usuario; creados por trigger desde auth.users; columnas: id, display_name, avatar_url, onboarding_completed, offers_submitted_count, offers_approved_count, offers_rejected_count, trust_score, etc.
- **offers** – Ofertas (título, precio, status, created_by, steps, conditions, coupons, métricas).
- **offer_votes** – Votos (offer_id, user_id, value 1/-1).
- **comments** – Comentarios por oferta.
- **offer_events** – Eventos view/outbound/share.
- **offer_favorites** – Favoritos por usuario y oferta.
- **user_roles** – user_id, role (owner, admin, moderator, analyst).
- **moderation_logs** – Log de moderación (oferta, acción, usuario).
- **offer_reports** – Reportes de ofertas (reporter_id, offer_id, estado).
- **daily_system_metrics** – Métricas diarias (admin).
- Vistas: ofertas_ranked_general, offer_performance_metrics, etc.
- Storage: bucket offer-images para imágenes de ofertas.

**RPCs (SECURITY DEFINER, revocados para anon/authenticated; solo API con service_role las llama):**

- increment_offers_submitted_count(uuid)
- increment_offers_approved_count(uuid)
- increment_offers_rejected_count(uuid)

**Qué debe incluir la auditoría:**

1. **Esquema:** Listar todas las tablas (y vistas/materialized views relevantes) del proyecto; indicar cuáles tienen migración en el repo y cuáles no; cuáles se usan desde la app y cuáles no.
2. **RLS:** Para cada tabla sensible, confirmar que RLS está habilitado y describir políticas (quién puede SELECT/INSERT/UPDATE/DELETE). Detectar políticas demasiado amplias (p. ej. USING (true)) o ausencia de RLS donde haya datos sensibles.
3. **Auth:** Comprobar que la configuración de Google OAuth (Redirect URLs, Site URL) es correcta para producción; que no queden secrets antiguos; que los triggers (p. ej. creación de profile) funcionen.
4. **Seguridad:** Funciones SECURITY DEFINER: que estén revocadas para anon/authenticated si solo deben llamarse desde el backend; que no haya exposición del service_role key en cliente; que las APIs que modifican datos validen usuario/rol (Bearer + user_roles).
5. **Datos y consistencia:** Triggers que actualicen conteos (votes, métricas); que los RPCs de reputación existan y se llamen desde la app; que no haya tablas huérfanas o columnas sin uso que generen confusión.
6. **Lanzamiento:** Checklist final: migraciones aplicadas, backups, logs sin errores críticos, recomendaciones de retención (p. ej. offer_events) o índices si aplica.

Responde con un informe estructurado (por secciones) y, al final, una lista de acciones recomendadas ordenadas por prioridad (crítico / alto / medio / bajo).

---

*Fin del informe. Última actualización: febrero 2025.*
