# Sistema de infraestructura y apps — AVENTA

Resumen de cómo está montado el proyecto: qué servicios se usan, dónde viven los datos y cómo se conectan. Útil para onboarding, auditorías y operación.

---

## 1. Resumen visual (stack)

```
[ Usuario ]
     │
     ▼
[ Vercel ]  ←  Next.js (app router), API routes, crons
     │
     ├──► [ Supabase ]   Auth, DB (Postgres), Storage, Realtime
     ├──► [ Upstash ]    Redis (rate limiting)
     ├──► [ Resend ]     Envío de correos (digests, plantillas)
     └──► [ Git/GitHub ] Código, deploy automático (push → Vercel)
```

- **Frontend y API:** desplegados en **Vercel** (Next.js).
- **Auth, base de datos, storage y realtime:** **Supabase**.
- **Rate limiting:** **Upstash** (Redis).
- **Correos (digest diario/semanal, etc.):** **Resend**.
- **Código y CI/deploy:** **Git** (repo en **GitHub**); push a `master` suele disparar deploy en Vercel.

---

## 2. Supabase

| Uso | Cómo |
|-----|------|
| **Auth** | Login con Google y con email/contraseña; sesión JWT; verificación de correo; reset password. El cliente usa `createBrowserClient` (anon key) en el navegador; las API que necesitan usuario validan el token con `GET Supabase/auth/v1/user` o usan `createServerClient` con service_role donde aplique. |
| **Base de datos** | Postgres. Tablas principales: `profiles`, `offers`, `offer_votes`, `offer_favorites`, `offer_reports`, `offer_events`, `notifications`, `user_email_preferences`, `comments`, `comment_likes`, etc. Vistas: `ofertas_ranked_general`, `public_profiles_view`. Triggers: p. ej. en `offer_votes` para recalcular `offers.upvotes_count` / `downvotes_count`. |
| **Storage** | Supabase Storage para imágenes de ofertas (y en el futuro avatar, etc.). Acceso vía anon o service_role según política. |
| **Realtime** | Suscripción a cambios en tabla `offers` (postgres_changes) para actualizar ranking/votos en la UI sin recargar. |

**Variables de entorno (ver `.env.example`):**

- `NEXT_PUBLIC_SUPABASE_URL` — URL del proyecto (ej. `https://xxx.supabase.co`).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Clave anónima (pública, usada en cliente y para validar JWT de usuario en API).
- `SUPABASE_SERVICE_ROLE_KEY` — Clave de servicio (solo servidor; bypass RLS). Usada en `lib/supabase/server.ts` para API que escriben en BD (votos, ofertas, admin, etc.).

**Clientes en código:**

- **Cliente navegador:** `lib/supabase/client.ts` → `createBrowserClient(url, anonKey)` (Supabase SSR).
- **Servidor con permisos de usuario (cookies/sesión):** `lib/supabase/server-auth.ts` → `createServerClient` de `@supabase/ssr`.
- **Servidor con service_role:** `lib/supabase/server.ts` → `createServerClient()` (lee/escribe sin RLS).

---

## 3. Vercel

| Uso | Cómo |
|-----|------|
| **Hosting** | Build de Next.js y despliegue de la app (front + API routes). |
| **URL** | `VERCEL_URL` en runtime; en código se usa `NEXT_PUBLIC_APP_URL` o fallback a `https://aventaofertas.com` (ver `app/layout.tsx`). |
| **Crons** | Definidos en `vercel.json`: daily-digest (0 0 * * * = medianoche UTC), weekly-digest (0 0 * * 1 = lunes 00:00 UTC). Las rutas protegen con `CRON_SECRET` (query, header `x-cron-secret` o Bearer). |

**Variables típicas en Vercel (además de las de Supabase/Upstash/Resend):**

- `NEXT_PUBLIC_APP_URL` — URL pública de la app.
- `CRON_SECRET` — Secreto para autorizar llamadas a los endpoints de cron.

---

## 4. Upstash (Redis)

| Uso | Cómo |
|-----|------|
| **Rate limiting** | Límite por IP (y opcionalmente por usuario) para evitar abuso. `lib/server/rateLimit.ts`: usa `@upstash/ratelimit` y `@upstash/redis`. Preset por defecto: 30 req/min (votes, track-view, upload); presets custom: reports 10/min, comments 20/min, events 60/min, offers 5/min. |

**Variables:**

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Si no están configuradas, el rate limit no se aplica (en producción se hace un warning en log).

---

## 5. Resend

| Uso | Cómo |
|-----|------|
| **Correos** | Resumen diario (Top 10), resumen semanal; en el futuro otros correos transaccionales. Las rutas cron llaman a la API de Resend (`https://api.resend.com/emails`). Plantillas en `lib/email/templates.ts`. |

**Variables:**

- `RESEND_API_KEY`
- `EMAIL_FROM` (ej. `AVENTA <notificaciones@aventaofertas.com>`)
- `EMAIL_LOGO_URL` (opcional, logo en cabecera del correo)

---

## 6. Git / GitHub

- Repo del proyecto (ej. `AventaOficial/aventa-new`). Push a `master` (o rama configurada) dispara build y deploy en Vercel. No se documentan secretos ni URLs privadas del repo.

---

## 7. Variables de entorno (referencia)

Resumen según `.env.example` (no incluir valores reales en docs):

| Variable | Servicio | Uso |
|----------|----------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | URL del proyecto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | Cliente navegador + validar JWT en API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | API de servidor (votos, ofertas, admin) |
| `UPSTASH_REDIS_REST_URL` | Upstash | Rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash | Rate limiting |
| `RESEND_API_KEY` | Resend | Envío de correos |
| `EMAIL_FROM` | Resend | Remitente |
| `EMAIL_LOGO_URL` | Opcional | Logo en correos |
| `NEXT_PUBLIC_APP_URL` | App | URL canónica (opcional en dev) |
| `CRON_SECRET` | Vercel crons | Proteger /api/cron/* |

---

## 8. Dónde está qué (rápido)

- **Auth y usuarios:** Supabase Auth + tabla `profiles` (sync con sync-profile).
- **Ofertas y votos:** Tablas `offers`, `offer_votes`; trigger recalcula contadores; vista `ofertas_ranked_general` para el feed.
- **Eventos (vistas, clics, shares):** `offer_events`; rutas `/api/events`, `/api/track-view`, `/api/track-outbound`.
- **Notificaciones in-app:** Tabla `notifications`; digest por correo vía `user_email_preferences` y Resend.
- **Admin:** Rutas bajo `/api/admin/*` y páginas bajo `/admin/*`; permisos vía `requireAdmin` / `requireModeration` (roles en Supabase).

Este doc se puede ampliar con detalles de cada tabla o con diagramas cuando haga falta.
